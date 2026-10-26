import { withTransaction } from '../../config/db.js';
import { AUDIT_ACTIONS, recordAudit } from '../../core/audit/audit.service.js';
import { requireContext } from '../../core/context/requestContext.js';
import { PAYMENT_ACCOUNT } from '../../core/ledger/paymentAccounts.js';
import { postJournal, reverseJournalsFor } from '../../core/ledger/posting.service.js';
import { nextDocumentNo } from '../../core/numbering/numbering.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { financialYearLabel, todayContext } from '../../utils/businessDate.js';
import { accessibleBranchFilter, nameMaps, pick, requireBranch } from '../inventory/inventory.helpers.js';
import { LIVE_BILL, Purchase } from '../purchases/purchase.model.js';
import { Supplier } from './supplier.model.js';
import { SupplierPayment } from './supplierPayment.model.js';

/*
 * Paying a supplier on their account: what we owe them from before (the old balance) and on purchase bills is one
 * due. A payment clears the old balance first, then the oldest bills; each bill's `paidPaise` and the supplier's
 * `openingDuePaidPaise` keep what is still owed exact everywhere (bill pages, the supplier list, the summary card).
 */

const sum = (list, fn) => list.reduce((n, x) => n + (fn(x) ?? 0), 0);
const paymentStatus = (paid, total) => (paid >= total ? 'paid' : paid > 0 ? 'partly_paid' : 'due');
const at = (date, today) => (date === today.businessDate ? today.now : new Date(`${date}T12:00:00+05:30`));
const billDue = (p) => Math.max(0, p.totals.totalPaise - p.paidPaise);

/** Old balance still owed to the supplier (what they were owed when added, less what has been paid off it). */
export const openingDueLeft = (s) => Math.max(0, (s.openingBalancePaise ?? 0) - (s.openingDuePaidPaise ?? 0));

export async function paySupplier(supplierId, { branchId, mode, amountPaise, reference, note, date }) {
  const { userId } = requireContext();
  const branch = await requireBranch(branchId);
  const today = await todayContext();
  const day = date ?? today.businessDate;
  if (day > today.businessDate) throw ApiError.badRequest('Payment date cannot be in the future', [{ path: 'date', message: 'Pick today or an earlier date' }], 'VALIDATION_ERROR');

  const payment = await withTransaction(async (session) => {
    const supplier = await Supplier.findOne({ _id: supplierId, isDeleted: false }).session(session);
    if (!supplier) throw ApiError.notFound('Supplier');
    const bills = await Purchase.find({ supplierId: supplier._id, paymentStatus: { $ne: 'paid' }, ...LIVE_BILL, ...accessibleBranchFilter() }).sort({ billDate: 1, createdAt: 1 }).session(session);
    const oldDue = openingDueLeft(supplier);
    const totalDue = oldDue + sum(bills, billDue);
    if (totalDue <= 0) throw ApiError.conflict(`Nothing is due to ${supplier.companyName}`, 'INVALID_STATE');
    if (amountPaise > totalDue) {
      throw ApiError.badRequest(`Only ₹${(totalDue / 100).toLocaleString('en-IN')} is due to ${supplier.companyName}`, [{ path: 'amountPaise', message: 'More than the amount due' }], 'VALIDATION_ERROR');
    }

    const paymentNo = await nextDocumentNo({ prefix: 'SP', branchCode: branch.code, financialYear: today.financialYear }, { session });
    const allocations = [];
    let left = amountPaise;
    if (oldDue > 0) {
      const take = Math.min(left, oldDue);
      supplier.openingDuePaidPaise = (supplier.openingDuePaidPaise ?? 0) + take;
      supplier.updatedBy = userId;
      await supplier.save({ session });
      allocations.push({ purchaseId: null, purchaseNo: null, billNo: null, amountPaise: take });
      left -= take;
    }
    for (const bill of bills) {
      if (left <= 0) break;
      const take = Math.min(left, billDue(bill));
      if (take <= 0) continue;
      bill.payments.push({ date: day, at: today.now, mode, amountPaise: take, reference: reference ?? null, by: userId, paymentNo });
      bill.paidPaise += take;
      bill.paymentStatus = paymentStatus(bill.paidPaise, bill.totals.totalPaise);
      await bill.save({ session });
      allocations.push({ purchaseId: bill._id, purchaseNo: bill.purchaseNo, billNo: bill.billNo, amountPaise: take });
      left -= take;
    }

    const [doc] = await SupplierPayment.create(
      [
        {
          paymentNo,
          supplierId: supplier._id,
          supplier: { id: supplier._id, code: supplier.code, name: supplier.companyName, mobile: supplier.mobile },
          branchId: branch._id,
          date: day,
          mode,
          amountPaise,
          reference: reference ?? null,
          note: note ?? null,
          allocations,
          createdBy: userId,
        },
      ],
      { session },
    );
    await postJournal(
      {
        voucherType: 'supplier_payment',
        date: at(day, today),
        businessDate: day,
        financialYear: financialYearLabel(day, today.fyStartMonth),
        narration: `Paid ${supplier.companyName} (${paymentNo})`,
        source: { docType: 'supplier_payment', docId: doc._id, docNo: paymentNo },
        lines: [
          { account: 'sundry_creditors', debit: amountPaise, party: { type: 'supplier', id: supplier._id }, branchId: branch._id },
          { account: PAYMENT_ACCOUNT[mode], credit: amountPaise, branchId: branch._id },
        ],
      },
      { session },
    );
    await recordAudit(
      {
        action: AUDIT_ACTIONS.UPDATE,
        module: 'supplier',
        recordType: 'Supplier',
        recordId: supplier._id,
        meta: { name: supplier.companyName, payment: amountPaise, mode, paymentNo },
        undo: { type: 'supplierPayment.create', branchId: branch._id, recordType: 'SupplierPayment', recordId: doc._id, label: `${paymentNo} — ${supplier.companyName}` },
      },
      { session },
    );
    return { doc, dueAfter: totalDue - amountPaise };
  });
  return { ...serializePayment(payment.doc.toObject(), await nameMaps({ branchIds: [payment.doc.branchId], userIds: [userId] })), duePaiseAfter: payment.dueAfter };
}

/**
 * Takes back a payment on a supplier's account (Undo): each bill it reached gets a matching negative line, the old
 * balance is owed again, its entry is reversed (the money comes back), and the payment stays, marked void.
 */
export async function voidSupplierPayment(id, reason) {
  const { userId } = requireContext();
  const today = await todayContext();
  await withTransaction(async (session) => {
    const p = await SupplierPayment.findOneAndUpdate({ _id: id, status: { $ne: 'void' } }, { $set: { status: 'void', voidedAt: today.now, voidedBy: userId, voidReason: reason } }, { session });
    if (!p) throw ApiError.conflict('This payment is already void', 'INVALID_STATE');
    for (const a of p.allocations) {
      if (!a.purchaseId) {
        await Supplier.updateOne({ _id: p.supplierId }, { $inc: { openingDuePaidPaise: -a.amountPaise } }, { session });
        continue;
      }
      const bill = await Purchase.findById(a.purchaseId).session(session);
      const paid = bill?.payments.find((x) => x.paymentNo === p.paymentNo && x.amountPaise > 0);
      if (!bill || !paid) continue;
      bill.payments.push({ date: today.businessDate, at: today.now, mode: p.mode, amountPaise: -a.amountPaise, reference: `${p.paymentNo} taken back`, by: userId, paymentNo: p.paymentNo, reversalOf: paid.at });
      bill.paidPaise -= a.amountPaise;
      bill.paymentStatus = paymentStatus(bill.paidPaise, bill.totals.totalPaise);
      await bill.save({ session });
    }
    await reverseJournalsFor({ docType: 'supplier_payment', docId: p._id }, { date: today.now, businessDate: today.businessDate, financialYear: today.financialYear, narration: `Payment ${p.paymentNo} taken back` }, { session });
    await recordAudit({ action: AUDIT_ACTIONS.CANCEL, module: 'supplier', recordType: 'Supplier', recordId: p.supplierId, meta: { name: p.supplier?.name, paymentNo: p.paymentNo, reason } }, { session });
  });
}

function serializePayment(p, maps) {
  return {
    id: p._id,
    paymentNo: p.paymentNo,
    source: 'account',
    date: p.date,
    at: p.createdAt,
    mode: p.mode,
    amountPaise: p.amountPaise,
    reference: p.reference,
    note: p.note,
    status: p.status ?? 'active',
    voidReason: p.voidReason ?? null,
    branch: pick(maps.branches, p.branchId) ?? null,
    by: pick(maps.users, p.createdBy) ?? null,
    allocations: p.allocations.map((a) => ({ purchaseId: a.purchaseId, purchaseNo: a.purchaseNo, billNo: a.billNo, amountPaise: a.amountPaise })),
  };
}

/**
 * Every payment made to the supplier, newest first: payments on their account (old balance and bills together) and
 * payments made on a single bill (when it was entered, or Pay on the bill). A bill's share of an account payment is
 * not listed again on its own.
 */
export async function listSupplierPayments(supplierId) {
  const supplier = await Supplier.findOne({ _id: supplierId, isDeleted: false }).select('_id').lean();
  if (!supplier) throw ApiError.notFound('Supplier');
  const [payments, bills] = await Promise.all([
    SupplierPayment.find({ supplierId, ...accessibleBranchFilter() }).sort({ createdAt: -1 }).lean(),
    Purchase.find({ supplierId, 'payments.0': { $exists: true }, ...accessibleBranchFilter() }).select('purchaseNo billNo branchId payments').lean(),
  ]);
  const onBills = bills.flatMap((b) => b.payments.filter((x) => !x.paymentNo).map((x) => ({ ...x, branchId: b.branchId, bill: { purchaseId: b._id, purchaseNo: b.purchaseNo, billNo: b.billNo } })));
  const maps = await nameMaps({ branchIds: [...payments, ...onBills].map((p) => p.branchId), userIds: [...payments.map((p) => p.createdBy), ...onBills.map((x) => x.by)] });
  const rows = [
    ...payments.map((p) => serializePayment(p, maps)),
    ...onBills.map((x) => ({
      id: null,
      paymentNo: null,
      source: 'bill',
      date: x.date,
      at: x.at,
      mode: x.mode,
      amountPaise: x.amountPaise,
      reference: x.reference ?? null,
      note: null,
      branch: pick(maps.branches, x.branchId) ?? null,
      by: pick(maps.users, x.by) ?? null,
      allocations: [{ ...x.bill, amountPaise: x.amountPaise }],
    })),
  ];
  return rows.sort((a, b) => (a.date === b.date ? new Date(b.at) - new Date(a.at) : a.date < b.date ? 1 : -1));
}
