import { hasPermission, valueOldGold } from '@jerp/shared';
import { withTransaction } from '../../config/db.js';
import { AUDIT_ACTIONS, recordAudit } from '../../core/audit/audit.service.js';
import { requireContext } from '../../core/context/requestContext.js';
import { PAYMENT_ACCOUNT } from '../../core/ledger/paymentAccounts.js';
import { postJournal, reverseJournalsFor } from '../../core/ledger/posting.service.js';
import { nextDocumentNo } from '../../core/numbering/numbering.service.js';
import { moveMetal } from '../../core/stock/stockLedger.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { todayContext } from '../../utils/businessDate.js';
import { maskTail } from '../../utils/mask.js';
import { paginate, searchFilter } from '../../utils/pagination.js';
import { Customer } from '../customers/customer.model.js';
import { accessibleBranchFilter, nameMaps, oid, pick, requireBranch, viewBranchFor } from '../inventory/inventory.helpers.js';
import { OldGold } from './oldGold.model.js';

/*
 * Old gold taken from customers, by weight after a purity test. Two ways in:
 *  - exchange: against a bill (sale.service calls recordOldGold inside the sale's transaction; the sale journal debits
 *    stock for it in place of money received);
 *  - purchase: bought for money here (stock Dr / cash or bank Cr).
 * The metal goes into the branch's old-gold pool at its value, so it shows under Raw materials and can be used to
 * make jewellery. Cancelling takes the metal back out, which is refused once it has been used.
 */

export const OLD_GOLD_PREFIX = 'OG';

/** Each piece valued by the shared formula (the client's figures are never used). */
export function priceOldGold(lines) {
  const priced = lines.map((l) => ({
    description: l.description,
    metal: l.metal,
    purity: l.purity,
    grossWeightMg: l.grossWeightMg,
    lessWeightMg: l.lessWeightMg ?? 0,
    ratePerGramPaise: l.ratePerGramPaise,
    deductionBps: l.deductionBps ?? 0,
    ...valueOldGold(l),
  }));
  const bad = priced.findIndex((l) => l.valuePaise <= 0);
  if (bad >= 0) throw ApiError.badRequest(`${priced[bad].description} has no value: check its weight and rate`, [{ path: `oldGold.${bad}`, message: 'No value' }], 'VALIDATION_ERROR');
  return { lines: priced, totalPaise: priced.reduce((s, l) => s + l.valuePaise, 0) };
}

/** Old gold on a bill or bought outright needs Old gold → Create, besides the page's own permission. */
export function assertCanTakeOldGold() {
  if (!hasPermission(requireContext().permissions, 'oldgold.create')) throw ApiError.forbidden('You are not allowed to take old gold', 'OLD_GOLD_FORBIDDEN');
}

const customerSnapshot = (c) => c && { id: c._id, code: c.code, name: c.name, mobile: c.mobile, pan: c.pan ?? null, address: c.address ?? null };
const sourceOf = (doc) => ({ docType: 'old_gold', docId: doc._id, docNo: doc.docNo });

/**
 * Number, save and stock one old-gold document, inside the caller's transaction. The caller posts the journal
 * (a sale debits stock in its own entry; a purchase pays the customer).
 */
export async function recordOldGold({ type, branch, customer, priced, today, saleId = null, invoiceNo = null, payout = null, note = null }, { session }) {
  const { userId } = requireContext();
  const docNo = await nextDocumentNo({ prefix: OLD_GOLD_PREFIX, branchCode: branch.code, financialYear: today.financialYear }, { session });
  const [doc] = await OldGold.create(
    [
      {
        docNo,
        type,
        branchId: branch._id,
        businessDate: today.businessDate,
        customerId: customer?._id ?? null,
        customer: customerSnapshot(customer),
        lines: priced.lines,
        totalPaise: priced.totalPaise,
        saleId,
        invoiceNo,
        payout: payout ?? { mode: null, reference: null },
        note,
        createdBy: userId,
      },
    ],
    { session },
  );
  const why = invoiceNo ? `Exchange on ${invoiceNo}` : `Bought from ${customer?.name ?? 'customer'}`;
  for (const l of priced.lines) {
    await moveMetal(
      { type: 'old_gold', branchId: branch._id, line: { metal: l.metal, purity: l.purity, kind: 'old_gold', grossWeightMg: l.netWeightMg, valuePaise: l.valuePaise, direction: 'in' }, source: sourceOf(doc), businessDate: today.businessDate, note: why },
      { session },
    );
  }
  return doc;
}

/** Take the metal back out of the pool; refused if it has already been melted, used or moved. */
async function takeBackMetal(doc, today, reason, { session }) {
  for (const l of doc.lines) {
    try {
      await moveMetal(
        { type: 'old_gold_cancel', branchId: doc.branchId, line: { metal: l.metal, purity: l.purity, kind: 'old_gold', grossWeightMg: l.netWeightMg, valuePaise: l.valuePaise, direction: 'out' }, source: sourceOf(doc), businessDate: today.businessDate, note: reason },
        { session },
      );
    } catch (err) {
      if (err.code !== 'INSUFFICIENT_STOCK') throw err;
      throw ApiError.conflict(`The old gold on ${doc.docNo} has already been used or moved from Raw materials, so it cannot be taken back.`, 'OLD_GOLD_USED');
    }
  }
}

/** A bill with old gold is cancelled: the old gold goes back to the customer (sale.service reverses the journal). */
export async function cancelExchangeFor(saleId, today, reason, { session }) {
  const { userId } = requireContext();
  const doc = await OldGold.findOne({ saleId, status: 'completed' }).session(session);
  if (!doc) return null;
  await takeBackMetal(doc, today, reason, { session });
  doc.set({ status: 'cancelled', cancelledAt: today.now, cancelledBy: userId, cancelReason: reason });
  await doc.save({ session });
  return doc;
}

// ---------------------------------------------------------------- buying old gold for money

export async function createPurchase({ branchId, customerId, lines, payout, note }) {
  assertCanTakeOldGold();
  const branch = await requireBranch(branchId);
  const customer = await Customer.findOne({ _id: customerId, isDeleted: false }).lean();
  if (!customer) throw ApiError.badRequest('Customer not found', [{ path: 'customerId', message: 'Customer not found' }], 'VALIDATION_ERROR');
  if (customer.status === 'inactive') throw new ApiError(422, 'OLD_GOLD_BLOCKED', `${customer.name} is inactive. Activate the customer first.`);
  const priced = priceOldGold(lines);
  const today = await todayContext();

  const doc = await withTransaction(async (session) => {
    const og = await recordOldGold({ type: 'purchase', branch, customer, priced, today, payout: { mode: payout.mode, reference: payout.reference ?? null }, note: note ?? null }, { session });
    await postJournal(
      {
        voucherType: 'old_gold',
        date: today.now,
        businessDate: today.businessDate,
        financialYear: today.financialYear,
        narration: `Old gold ${og.docNo} bought from ${customer.name}`,
        source: sourceOf(og),
        lines: [
          { account: 'inventory', debit: priced.totalPaise, branchId: branch._id },
          { account: PAYMENT_ACCOUNT[payout.mode], credit: priced.totalPaise, branchId: branch._id },
        ],
      },
      { session },
    );
    await recordAudit({ action: AUDIT_ACTIONS.CREATE, module: 'oldgold', recordType: 'OldGold', recordId: og._id, meta: { name: og.docNo, total: priced.totalPaise, customer: customer.name }, undo: { type: 'oldgold.create', branchId: og.branchId } }, { session });
    return og;
  });
  return getOldGold(doc._id);
}

export async function cancelOldGold(id, { reason }) {
  const { userId } = requireContext();
  const doc = await findOldGold(id);
  if (doc.type === 'exchange') throw ApiError.conflict(`This old gold came in on invoice ${doc.invoiceNo}. Cancel that invoice instead.`, 'EXCHANGE_ON_BILL');
  if (doc.status !== 'completed') throw ApiError.conflict('This old gold purchase is already cancelled', 'INVALID_STATE');
  const today = await todayContext();
  await withTransaction(async (session) => {
    const claimed = await OldGold.findOneAndUpdate({ _id: doc._id, status: 'completed' }, { $set: { status: 'cancelled', cancelledAt: today.now, cancelledBy: userId, cancelReason: reason } }, { session });
    if (!claimed) throw ApiError.conflict('This old gold purchase is already cancelled', 'INVALID_STATE');
    await takeBackMetal(doc, today, reason, { session });
    await reverseJournalsFor(sourceOf(doc), { date: today.now, businessDate: today.businessDate, financialYear: today.financialYear, narration: `Cancellation of ${doc.docNo}` }, { session });
    await recordAudit({ action: AUDIT_ACTIONS.CANCEL, module: 'oldgold', recordType: 'OldGold', recordId: doc._id, meta: { name: doc.docNo, reason } }, { session });
  });
  return getOldGold(id);
}

// ---------------------------------------------------------------- reading

function serialize(d, maps) {
  const canSeeKyc = hasPermission(requireContext().permissions, 'customer.viewKyc');
  return {
    id: d._id,
    docNo: d.docNo,
    type: d.type,
    status: d.status,
    businessDate: d.businessDate,
    createdAt: d.createdAt,
    branch: pick(maps.branches, d.branchId) ?? { id: d.branchId },
    customer: d.customer && { ...d.customer, pan: canSeeKyc ? d.customer.pan : maskTail(d.customer.pan) },
    lines: d.lines,
    totalPaise: d.totalPaise,
    sale: d.saleId ? { id: d.saleId, invoiceNo: d.invoiceNo } : null,
    payout: d.payout?.mode ? d.payout : null,
    note: d.note,
    createdBy: pick(maps.users, d.createdBy),
    cancelledAt: d.cancelledAt,
    cancelledBy: pick(maps.users, d.cancelledBy),
    cancelReason: d.cancelReason,
  };
}

const mapsFor = (list) => nameMaps({ branchIds: list.map((d) => d.branchId), userIds: list.flatMap((d) => [d.createdBy, d.cancelledBy]) });

async function findOldGold(id) {
  const doc = await OldGold.findOne({ _id: id, ...accessibleBranchFilter() });
  if (!doc) throw ApiError.notFound('Old gold record');
  return doc;
}

export async function getOldGold(id) {
  const d = (await findOldGold(id)).toObject();
  return serialize(d, await mapsFor([d]));
}

export async function listOldGold({ page, limit, q, type, status, branchId: chosen, customerId }) {
  const branchId = chosen ?? (customerId ? null : await viewBranchFor('oldgold'));
  const filter = { ...accessibleBranchFilter(), ...searchFilter(q, ['docNo', 'invoiceNo', 'customer.name', 'customer.mobile']) };
  if (branchId) filter.branchId = oid(branchId);
  if (customerId) filter.customerId = oid(customerId);
  if (type) filter.type = type;
  const listFilter = { ...filter, ...(status && { status }) };
  const { items, meta } = await paginate(OldGold.find(listFilter).sort({ createdAt: -1 }), OldGold.countDocuments(listFilter), { page, limit });
  const maps = await mapsFor(items);
  return { items: items.map((d) => serialize(d, maps)), meta: { ...meta, summary: await monthSummary(filter) } };
}

/** This month, completed only: how much was taken in, by exchange and bought, and the fine gold and silver it holds. */
async function monthSummary(filter) {
  const today = await todayContext();
  const monthStart = `${today.businessDate.slice(0, 7)}-01`;
  const [row] = await OldGold.aggregate([
    { $match: { ...filter, status: 'completed', businessDate: { $gte: monthStart } } },
    { $unwind: '$lines' },
    {
      $group: {
        _id: null,
        docs: { $addToSet: '$_id' },
        totalPaise: { $sum: '$lines.valuePaise' },
        exchangePaise: { $sum: { $cond: [{ $eq: ['$type', 'exchange'] }, '$lines.valuePaise', 0] } },
        purchasePaise: { $sum: { $cond: [{ $eq: ['$type', 'purchase'] }, '$lines.valuePaise', 0] } },
        goldFineMg: { $sum: { $cond: [{ $eq: ['$lines.metal', 'gold'] }, '$lines.fineWeightMg', 0] } },
        silverFineMg: { $sum: { $cond: [{ $eq: ['$lines.metal', 'silver'] }, '$lines.fineWeightMg', 0] } },
      },
    },
  ]);
  return {
    count: row?.docs.length ?? 0,
    totalPaise: row?.totalPaise ?? 0,
    exchangePaise: row?.exchangePaise ?? 0,
    purchasePaise: row?.purchasePaise ?? 0,
    goldFineMg: row?.goldFineMg ?? 0,
    silverFineMg: row?.silverFineMg ?? 0,
  };
}
