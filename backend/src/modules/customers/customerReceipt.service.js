import { SALE_STATUS } from '@jerp/shared';
import { withTransaction } from '../../config/db.js';
import { AUDIT_ACTIONS, recordAudit } from '../../core/audit/audit.service.js';
import { requireContext } from '../../core/context/requestContext.js';
import { PAYMENT_ACCOUNT } from '../../core/ledger/paymentAccounts.js';
import { postJournal, reverseJournalsFor } from '../../core/ledger/posting.service.js';
import { nextDocumentNo } from '../../core/numbering/numbering.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { todayContext } from '../../utils/businessDate.js';
import { nameMaps, pick, requireBranch } from '../inventory/inventory.helpers.js';
import { Sale, billDue } from '../sales/sale.model.js';
import { Customer } from './customer.model.js';
import { CustomerReceipt } from './customerReceipt.model.js';

/*
 * Collecting dues: money a customer pays later against bills left partly unpaid and their old due.
 * A payment goes first to the bill it was taken for (if any), then the old due, then the oldest bills; each bill's
 * `duePaidPaise` and the customer's `openingDuePaidPaise` keep what is still owed exact everywhere.
 */

export { billDue };

/** Old due still owed (a plus opening balance, less what was collected against it). */
export const openingDueLeft = (c) => Math.max(0, (c.openingBalancePaise ?? 0) - (c.openingDuePaidPaise ?? 0));

/** Everything the customer owes right now: old due and every bill with money still due (oldest first). */
export async function customerDues(customerId, { session, excludeSaleId } = {}) {
  const customer = await Customer.findOne({ _id: customerId, isDeleted: false }).session(session ?? null).lean();
  if (!customer) throw ApiError.notFound('Customer');
  const sales = await Sale.find({ customerId, status: SALE_STATUS.COMPLETED, 'payments.mode': 'credit', ...(excludeSaleId && { _id: { $ne: excludeSaleId } }) })
    .select('invoiceNo businessDate createdAt branchId totals payments duePaidPaise returnCreditPaise')
    .sort({ createdAt: 1 })
    .session(session ?? null)
    .lean();
  const bills = sales
    .map((s) => ({ saleId: s._id, invoiceNo: s.invoiceNo, businessDate: s.businessDate, branchId: s.branchId, grandTotalPaise: s.totals.grandTotalPaise, duePaise: billDue(s) }))
    .filter((b) => b.duePaise > 0);
  const openingDuePaise = openingDueLeft(customer);
  return { customer, openingDuePaise, bills, totalDuePaise: openingDuePaise + bills.reduce((s, b) => s + b.duePaise, 0) };
}

export async function getCustomerDues(customerId) {
  const { customer, openingDuePaise, bills, totalDuePaise } = await customerDues(customerId);
  const maps = await nameMaps({ branchIds: bills.map((b) => b.branchId) });
  return {
    customer: { id: customer._id, code: customer.code, name: customer.name, mobile: customer.mobile },
    openingDuePaise,
    bills: bills.map((b) => ({ ...b, branch: pick(maps.branches, b.branchId) })),
    totalDuePaise,
  };
}

/** Splits a payment over what is owed: the chosen bill first, then the old due, then the oldest bills. */
function allocate(amount, { openingDuePaise, bills }, saleId) {
  const order = [
    ...bills.filter((b) => saleId && String(b.saleId) === String(saleId)),
    ...(openingDuePaise > 0 ? [{ saleId: null, invoiceNo: null, duePaise: openingDuePaise }] : []),
    ...bills.filter((b) => !saleId || String(b.saleId) !== String(saleId)),
  ];
  const allocations = [];
  let left = amount;
  for (const due of order) {
    if (left <= 0) break;
    const take = Math.min(left, due.duePaise);
    allocations.push({ saleId: due.saleId, invoiceNo: due.invoiceNo, amountPaise: take });
    left -= take;
  }
  return allocations;
}

/** Advance the customer paid as money (receipts), as opposed to an old advance carried over as opening balance. */
export async function advanceReceived(customerId, { session } = {}) {
  const rows = await CustomerReceipt.find({ customerId, kind: 'advance' }).select('amountPaise').session(session ?? null).lean();
  return rows.reduce((n, r) => n + r.amountPaise, 0);
}

/**
 * An advance paid now, when the customer is added (or their advance raised): a receipt at the branch on today's date,
 * cash/bank debited and the customer's account credited — the same side as the minus opening balance it is part of.
 * A minus amount is an advance paid back (the advance lowered below what was received): the same entry reversed.
 */
export async function recordAdvanceReceipt(customer, { branchId, mode, reference }, amountPaise, { session }) {
  const { userId } = requireContext();
  const branch = await requireBranch(branchId, { path: 'advancePayment.branchId' });
  const today = await todayContext();
  const receiptNo = await nextDocumentNo({ prefix: 'ADV', branchCode: branch.code, financialYear: today.financialYear }, { session });
  const [doc] = await CustomerReceipt.create(
    [
      {
        receiptNo,
        kind: 'advance',
        customerId: customer._id,
        customer: { id: customer._id, code: customer.code, name: customer.name, mobile: customer.mobile },
        branchId: branch._id,
        businessDate: today.businessDate,
        mode,
        amountPaise,
        reference: reference ?? null,
        note: null,
        allocations: [],
        createdBy: userId,
      },
    ],
    { session },
  );
  const refund = amountPaise < 0;
  const amount = Math.abs(amountPaise);
  const money = { account: PAYMENT_ACCOUNT[mode], branchId: branch._id };
  const party = { account: 'sundry_debtors', branchId: branch._id, party: { type: 'customer', id: customer._id } };
  await postJournal(
    {
      voucherType: 'customer_advance',
      date: today.now,
      businessDate: today.businessDate,
      financialYear: today.financialYear,
      narration: refund ? `Advance refunded to ${customer.name} (${receiptNo})` : `Advance received from ${customer.name} (${receiptNo})`,
      source: { docType: 'customer_receipt', docId: doc._id, docNo: receiptNo },
      lines: refund ? [{ ...party, debit: amount }, { ...money, credit: amount }] : [{ ...money, debit: amount }, { ...party, credit: amount }],
    },
    { session },
  );
  return doc;
}

export async function collectPayment(customerId, { branchId, mode, amountPaise, reference, note, saleId }) {
  const branch = await requireBranch(branchId);
  const today = await todayContext();

  const receipt = await withTransaction(async (session) => {
    const dues = await customerDues(customerId, { session });
    if (dues.totalDuePaise <= 0) throw ApiError.conflict(`${dues.customer.name} owes nothing`, 'NOTHING_DUE');
    if (amountPaise > dues.totalDuePaise) {
      throw ApiError.badRequest(`${dues.customer.name} owes only ${(dues.totalDuePaise / 100).toFixed(2)}`, [{ path: 'amountPaise', message: 'More than the due' }], 'MORE_THAN_DUE');
    }
    if (saleId && !dues.bills.some((b) => String(b.saleId) === String(saleId))) {
      throw ApiError.badRequest('Nothing is due on this bill', [{ path: 'saleId', message: 'Nothing due on this bill' }], 'VALIDATION_ERROR');
    }
    return receiveDue(dues, { branch, mode, amountPaise, reference, note, saleId }, today, session);
  });
  return serializeReceipt(receipt.toObject(), await getCustomerDues(customerId));
}

/**
 * Records money received against what the customer owes (`dues` from customerDues, read in this transaction): a DR
 * receipt split over the bills / old due, those marked paid, and cash/bank debited against the customer's account.
 * `withSale`: taken at the counter on that bill (the previous due added to it) — it is undone with that bill, so it
 * gets no Undo entry of its own.
 */
export async function receiveDue(dues, { branch, mode, amountPaise, reference, note, saleId, withSale }, today, session) {
  const { userId } = requireContext();
  const allocations = allocate(amountPaise, dues, saleId);
  const receiptNo = await nextDocumentNo({ prefix: 'DR', branchCode: branch.code, financialYear: today.financialYear }, { session });
  const c = dues.customer;
  const [doc] = await CustomerReceipt.create(
    [
      {
        receiptNo,
        customerId: c._id,
        customer: { id: c._id, code: c.code, name: c.name, mobile: c.mobile },
        branchId: branch._id,
        businessDate: today.businessDate,
        mode,
        amountPaise,
        reference: reference ?? null,
        note: note ?? null,
        allocations,
        withSale: withSale ?? null,
        createdBy: userId,
      },
    ],
    { session },
  );
  for (const a of allocations) {
    if (a.saleId) await Sale.updateOne({ _id: a.saleId }, { $inc: { duePaidPaise: a.amountPaise } }, { session });
    else await Customer.updateOne({ _id: c._id }, { $inc: { openingDuePaidPaise: a.amountPaise } }, { session });
  }
  const party = { type: 'customer', id: c._id };
  await postJournal(
    {
      voucherType: 'customer_receipt',
      date: today.now,
      businessDate: today.businessDate,
      financialYear: today.financialYear,
      narration: `Due received from ${c.name} (${receiptNo}${withSale ? ` with ${withSale.invoiceNo}` : ''})`,
      source: { docType: 'customer_receipt', docId: doc._id, docNo: receiptNo },
      lines: [
        { account: PAYMENT_ACCOUNT[mode], debit: amountPaise, branchId: branch._id },
        { account: 'sundry_debtors', credit: amountPaise, branchId: branch._id, party },
      ],
    },
    { session },
  );
  await recordAudit(
    {
      action: AUDIT_ACTIONS.CREATE,
      module: 'customer',
      recordType: 'Customer',
      recordId: c._id,
      meta: { name: c.name, receiptNo, dueReceived: amountPaise, ...(withSale && { invoiceNo: withSale.invoiceNo }) },
      ...(!withSale && { undo: { type: 'customerReceipt.create', branchId: branch._id, recordType: 'CustomerReceipt', recordId: doc._id, label: `${receiptNo} — ${c.name}` } }),
    },
    { session },
  );
  return doc;
}

/**
 * Takes back a due payment entered by mistake (Undo): what it paid off is owed again (bills and old due), its entry
 * is reversed (the money goes back out), and the receipt stays, marked void.
 */
export async function voidReceipt(id, reason) {
  const { userId } = requireContext();
  const today = await todayContext();
  await withTransaction(async (session) => {
    const r = await CustomerReceipt.findOneAndUpdate(
      { _id: id, kind: 'due', status: { $ne: 'void' } },
      { $set: { status: 'void', voidedAt: today.now, voidedBy: userId, voidReason: reason } },
      { session },
    );
    if (!r) throw ApiError.conflict('This receipt is already void', 'INVALID_STATE');
    for (const a of r.allocations) {
      if (a.saleId) await Sale.updateOne({ _id: a.saleId }, { $inc: { duePaidPaise: -a.amountPaise } }, { session });
      else await Customer.updateOne({ _id: r.customerId }, { $inc: { openingDuePaidPaise: -a.amountPaise } }, { session });
    }
    await reverseJournalsFor({ docType: 'customer_receipt', docId: r._id }, { date: today.now, businessDate: today.businessDate, financialYear: today.financialYear, narration: `Receipt ${r.receiptNo} taken back` }, { session });
    await recordAudit({ action: AUDIT_ACTIONS.CANCEL, module: 'customer', recordType: 'Customer', recordId: r.customerId, meta: { name: r.customer?.name, receiptNo: r.receiptNo, reason } }, { session });
  });
}

async function serializeReceipt(r, dues) {
  const maps = await nameMaps({ branchIds: [r.branchId], userIds: [r.createdBy] });
  return {
    id: r._id,
    receiptNo: r.receiptNo,
    customer: r.customer,
    branch: pick(maps.branches, r.branchId),
    businessDate: r.businessDate,
    createdAt: r.createdAt,
    mode: r.mode,
    amountPaise: r.amountPaise,
    reference: r.reference,
    note: r.note,
    allocations: r.allocations,
    createdBy: pick(maps.users, r.createdBy),
    duePaiseAfter: dues?.totalDuePaise,
  };
}
