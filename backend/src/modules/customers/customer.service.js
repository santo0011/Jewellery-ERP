import { hasPermission, OPEN_ORDER_STATUSES, SALE_STATUS } from '@jerp/shared';
import { withTransaction } from '../../config/db.js';
import { AUDIT_ACTIONS, recordAudit } from '../../core/audit/audit.service.js';
import { requireContext } from '../../core/context/requestContext.js';
import { syncOpeningBalance } from '../../core/ledger/openingBalance.service.js';
import { nextCode } from '../../core/numbering/numbering.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { deleteRecord } from '../records/record.deletion.js';
import { diffChanges } from '../../utils/diff.js';
import { maskTail } from '../../utils/mask.js';
import { fromDate, paginate, searchFilter, toDate } from '../../utils/pagination.js';
import { accessibleBranchFilter } from '../inventory/inventory.helpers.js';
import { Order } from '../orders/order.model.js';
import { Sale } from '../sales/sale.model.js';
import { Customer } from './customer.model.js';
import { advanceReceived, billDue, customerDues, openingDueLeft, recordAdvanceReceipt } from './customerReceipt.service.js';

const TRACKED = [
  'name', 'mobile', 'alternateMobile', 'email', 'address', 'dob', 'anniversary', 'gstin', 'pan',
  'kyc.type', 'kyc.number', 'kyc.verified', 'segment', 'preferredMetals', 'tags', 'openingBalancePaise', 'notes',
];

function serialize(c) {
  const canSeeKyc = hasPermission(requireContext().permissions, 'customer.viewKyc');
  return {
    id: c._id,
    code: c.code,
    name: c.name,
    mobile: c.mobile,
    alternateMobile: c.alternateMobile,
    email: c.email,
    address: c.address ?? {},
    dob: fromDate(c.dob),
    anniversary: fromDate(c.anniversary),
    gstin: c.gstin,
    pan: canSeeKyc ? c.pan : maskTail(c.pan),
    kyc: {
      type: c.kyc?.type ?? null,
      number: canSeeKyc ? (c.kyc?.number ?? null) : maskTail(c.kyc?.number),
      verified: Boolean(c.kyc?.verified),
      verifiedAt: c.kyc?.verifiedAt ?? null,
    },
    kycVisible: canSeeKyc,
    segment: c.segment,
    preferredMetals: c.preferredMetals ?? [],
    tags: c.tags ?? [],
    openingBalancePaise: c.openingBalancePaise ?? 0,
    notes: c.notes,
    status: c.status,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

function toDocument(input, existing) {
  const { permissions, userId } = requireContext();
  const canSeeKyc = hasPermission(permissions, 'customer.viewKyc');
  // advancePayment is how an advance was paid (a receipt), not part of the customer.
  const { advancePayment, ...fields } = input;
  const doc = { ...fields, dob: toDate(input.dob), anniversary: toDate(input.anniversary) };

  if (!canSeeKyc && existing) {
    doc.pan = existing.pan;
    doc.kyc = existing.kyc;
  } else {
    const wasVerified = Boolean(existing?.kyc?.verified);
    doc.kyc = {
      type: input.kyc?.type ?? null,
      number: input.kyc?.number ?? null,
      verified: Boolean(input.kyc?.verified && input.kyc?.number),
      verifiedBy: input.kyc?.verified ? (wasVerified ? existing.kyc.verifiedBy : userId) : null,
      verifiedAt: input.kyc?.verified ? (wasVerified ? existing.kyc.verifiedAt : new Date()) : null,
    };
  }
  return doc;
}

async function assertMobileFree(mobile, exceptId) {
  const clash = await Customer.findOne({ mobile, isDeleted: false, ...(exceptId && { _id: { $ne: exceptId } }) }).select('code name').lean();
  if (clash) {
    throw ApiError.conflict(`This mobile already belongs to ${clash.name} (${clash.code})`, 'DUPLICATE', [
      { path: 'mobile', message: `Already used by ${clash.name} (${clash.code})` },
    ]);
  }
}

async function findCustomer(id) {
  const customer = await Customer.findOne({ _id: id, isDeleted: false });
  if (!customer) throw ApiError.notFound('Customer');
  return customer;
}

/**
 * Per customer, from completed bills: unpaid credit (same rule as the customer page) and what was paid at the counter.
 * Empty without sales.view.
 */
async function billsByCustomer() {
  const credit = new Map();
  const paid = new Map();
  if (!hasPermission(requireContext().permissions, 'sales.view')) return { credit, paid };
  const sales = await Sale.find({ status: SALE_STATUS.COMPLETED, customerId: { $ne: null }, ...accessibleBranchFilter() })
    .select('customerId payments duePaidPaise returnCreditPaise advanceAdjustedPaise customerAdvancePaise oldGoldPaise')
    .lean();
  const add = (map, key, amount) => amount && map.set(key, (map.get(key) ?? 0) + amount);
  for (const s of sales) {
    const key = String(s.customerId);
    for (const p of s.payments) if (p.mode !== 'credit') add(paid, key, p.amountPaise);
    // Credit still owed on the bill; what was collected later counts as paid.
    add(credit, key, billDue(s));
    add(paid, key, s.duePaidPaise ?? 0);
    // Advances used on the bill (order advance, advance paid before) are money already received; old gold handed
    // over paid for part of it too.
    add(paid, key, (s.advanceAdjustedPaise ?? 0) + (s.customerAdvancePaise ?? 0) + (s.oldGoldPaise ?? 0));
  }
  return { credit, paid };
}

const totalDue = (c, credit) => (credit.get(String(c._id)) ?? 0) + openingDueLeft(c);
/** Old due not yet collected. */
const OLD_DUE_LEFT = { $expr: { $gt: [{ $subtract: ['$openingBalancePaise', { $ifNull: ['$openingDuePaidPaise', 0] }] }, 0] } };

/** 'due' = owes and has paid nothing, 'partly_paid' = owes but has paid some, 'paid' = billed and owes nothing, null = no bills or dues. */
function paymentStatus(duePaise, paidPaise) {
  if (duePaise > 0) return paidPaise > 0 ? 'partly_paid' : 'due';
  return paidPaise > 0 ? 'paid' : null;
}

/** due: 'due' = only customers who owe money (highest first), 'clear' = nothing owed. */
/** Marks customers who have bought anything (any invoice, any branch): they can never be deleted. */
/**
 * Also the advance each customer has with you: what is left of the advance paid before (a minus opening balance,
 * less what bills used) and advances on their open orders.
 */
async function withPurchaseFlag(rows) {
  const ids = rows.map((r) => r.id);
  const [buyers, used, orders] = await Promise.all([
    Sale.distinct('customerId', { customerId: { $in: ids } }),
    Sale.find({ customerId: { $in: ids }, status: SALE_STATUS.COMPLETED, customerAdvancePaise: { $gt: 0 } }).select('customerId customerAdvancePaise').lean(),
    Order.find({ customerId: { $in: ids }, status: { $in: OPEN_ORDER_STATUSES }, advancePaise: { $gt: 0 } }).select('customerId advancePaise').lean(),
  ]);
  const bought = new Set(buyers.map(String));
  const sumBy = (list, field) => list.reduce((m, x) => m.set(String(x.customerId), (m.get(String(x.customerId)) ?? 0) + x[field]), new Map());
  const usedBy = sumBy(used, 'customerAdvancePaise');
  const orderBy = sumBy(orders, 'advancePaise');
  return rows.map((r) => {
    const advanceLeftPaise = Math.max(0, -(r.openingBalancePaise ?? 0) - (usedBy.get(String(r.id)) ?? 0));
    const orderAdvancePaise = orderBy.get(String(r.id)) ?? 0;
    return { ...r, hasPurchases: bought.has(String(r.id)), advanceLeftPaise, orderAdvancePaise, advancePaise: advanceLeftPaise + orderAdvancePaise };
  });
}

export async function listCustomers({ page, limit, q, segment, status, due }) {
  const filter = { isDeleted: false, ...searchFilter(q, ['name', 'mobile', 'code', 'email', 'alternateMobile']) };
  if (segment) filter.segment = segment;
  if (status) filter.status = status;
  const { credit, paid } = await billsByCustomer();
  const owing = { $or: [{ _id: { $in: [...credit.keys()] } }, OLD_DUE_LEFT] };
  const withDue = (c) => {
    const duePaise = totalDue(c, credit);
    const paidPaise = paid.get(String(c._id)) ?? 0;
    return { ...serialize(c), duePaise, creditDuePaise: credit.get(String(c._id)) ?? 0, paidPaise, paymentStatus: paymentStatus(duePaise, paidPaise) };
  };

  if (due === 'due') {
    // The owing set is small; rank it by amount so the biggest dues come first.
    const all = (await Customer.find({ ...filter, $and: [owing] }).lean()).map(withDue).sort((a, b) => b.duePaise - a.duePaise);
    return { items: await withPurchaseFlag(all.slice((page - 1) * limit, page * limit)), meta: { page, limit, total: all.length, pages: Math.max(1, Math.ceil(all.length / limit)) } };
  }
  if (due === 'clear') filter.$nor = [owing];
  const { items, meta } = await paginate(Customer.find(filter).sort({ createdAt: -1 }), Customer.countDocuments(filter), { page, limit });
  return { items: await withPurchaseFlag(items.map(withDue)), meta: { ...meta, summary: await customerSummary(credit, owing) } };
}

/** Header cards: how many customers, how many joined this month, and what customers owe (bill credit + old dues). */
async function customerSummary(credit, owing) {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [total, fresh, owingCount, opening] = await Promise.all([
    Customer.countDocuments({ isDeleted: false }),
    Customer.countDocuments({ isDeleted: false, createdAt: { $gte: monthStart } }),
    Customer.countDocuments({ isDeleted: false, $and: [owing] }),
    Customer.aggregate([{ $match: { isDeleted: false, ...OLD_DUE_LEFT } }, { $group: { _id: null, total: { $sum: { $subtract: ['$openingBalancePaise', { $ifNull: ['$openingDuePaidPaise', 0] }] } } } }]),
  ]);
  const creditPaise = [...credit.values()].reduce((s, v) => s + v, 0);
  return { total, newThisMonth: fresh, duePaise: creditPaise + (opening[0]?.total ?? 0), owing: owingCount };
}

/** How much of the advance paid before (a minus opening balance) bills have already used. */
async function advanceUsed(customerId) {
  const used = await Sale.find({ customerId, status: SALE_STATUS.COMPLETED, customerAdvancePaise: { $gt: 0 } }).select('customerAdvancePaise').lean();
  return used.reduce((n, s) => n + s.customerAdvancePaise, 0);
}

export async function getCustomer(id) {
  const c = (await findCustomer(id)).toObject();
  const [used, received] = await Promise.all([advanceUsed(c._id), advanceReceived(c._id)]);
  // The edit form shows only the advance still available (what was paid before, less what bills have used).
  return { ...serialize(c), advanceUsedPaise: used, advanceReceivedPaise: received, advanceLeftPaise: Math.max(0, -(c.openingBalancePaise ?? 0) - used) };
}

export async function createCustomer(input) {
  const { userId } = requireContext();
  await assertMobileFree(input.mobile);
  const customer = await withTransaction(async (session) => {
    const code = await nextCode('customer', 'C', 5, { session });
    const [doc] = await Customer.create([{ ...toDocument(input), code, createdBy: userId, updatedBy: userId }], { session });
    // An advance paid now is a receipt (cash/bank, today, this branch); only the rest stays an opening balance.
    const advance = Math.max(0, -(doc.openingBalancePaise ?? 0));
    const received = input.advancePayment && advance > 0 ? advance : 0;
    if (received) await recordAdvanceReceipt(doc, input.advancePayment, received, { session });
    await syncOpeningBalance({ partyType: 'customer', partyId: doc._id, code, amountPaise: doc.openingBalancePaise + received }, { session });
    await recordAudit({ action: AUDIT_ACTIONS.CREATE, module: 'customer', recordType: 'Customer', recordId: doc._id, meta: { name: doc.name, code } }, { session });
    return doc;
  });
  return serialize(customer.toObject());
}

export async function updateCustomer(id, input) {
  const { userId } = requireContext();
  const customer = await findCustomer(id);
  if (input.mobile !== customer.mobile) await assertMobileFree(input.mobile, customer._id);

  const before = serialize(customer.toObject());
  const collectedOld = customer.openingDuePaidPaise ?? 0;
  if (collectedOld > 0 && (input.openingBalancePaise ?? 0) < collectedOld) {
    throw ApiError.badRequest(`${(collectedOld / 100).toFixed(2)} of the old due was already collected, so it cannot be less than that`, [{ path: 'openingBalancePaise', message: 'Already partly collected' }], 'VALIDATION_ERROR');
  }
  // No new (or bigger) advance while bills are still due: the dues are settled first. (The opening balance itself —
  // an old due — is the same field being edited, so correcting it is not blocked.)
  const advanceBefore = Math.max(0, -(customer.openingBalancePaise ?? 0));
  const advanceAfter = Math.max(0, -(input.openingBalancePaise ?? 0));
  // Advance already used on bills stays part of the record: it cannot be taken back or turned into an old due.
  const used = await advanceUsed(customer._id);
  // Advance paid as money has a receipt and is in cash/bank. Lowering the advance takes off the carried-over part
  // first; going below what was received pays the difference back (a refund out of cash/bank).
  const receivedBefore = await advanceReceived(customer._id);
  const refundNow = receivedBefore > 0 && advanceAfter < receivedBefore ? receivedBefore - advanceAfter : 0;
  if (refundNow && !input.advancePayment) {
    throw new ApiError(422, 'REFUND_MODE_REQUIRED', `${(refundNow / 100).toFixed(2)} of ${customer.name}'s advance was received as payment — choose how it is paid back.`, [
      { path: 'advancePayment.mode', message: 'Select how the advance is paid back' },
    ]);
  }
  const receivedNow = input.advancePayment && advanceAfter > advanceBefore ? advanceAfter - advanceBefore : 0;
  if (used > 0 && advanceAfter < used) {
    throw new ApiError(422, 'ADVANCE_USED', `${(used / 100).toFixed(2)} of ${customer.name}'s advance is already used on bills, so the advance cannot be less than that.`, [
      { path: 'openingBalancePaise', message: 'Advance already used on bills' },
    ]);
  }
  if (advanceAfter > advanceBefore) {
    const { bills } = await customerDues(customer._id);
    const totalDuePaise = bills.reduce((n, b) => n + b.duePaise, 0);
    if (totalDuePaise > 0) {
      throw new ApiError(
        422,
        'DUE_PENDING',
        `${customer.name} still owes ${(totalDuePaise / 100).toFixed(2)}. Collect the due first — an advance can be taken once everything is paid.`,
        [{ path: 'openingBalancePaise', message: 'Clear the due before taking an advance' }],
      );
    }
  }
  customer.set({ ...toDocument(input, customer.toObject()), updatedBy: userId });
  const after = serialize(customer.toObject());
  const changes = diffChanges(before, after, TRACKED);
  if (!changes.length) return before;

  await withTransaction(async (session) => {
    await customer.save({ session });
    if (receivedNow) await recordAdvanceReceipt(customer, input.advancePayment, receivedNow, { session });
    if (refundNow) await recordAdvanceReceipt(customer, input.advancePayment, -refundNow, { session });
    // The opening-balance journal holds only what was not received as payment.
    await syncOpeningBalance(
      {
        partyType: 'customer',
        partyId: customer._id,
        code: customer.code,
        amountPaise: after.openingBalancePaise + receivedBefore + receivedNow - refundNow,
        previousPaise: before.openingBalancePaise + receivedBefore,
      },
      { session },
    );
    await recordAudit({ action: AUDIT_ACTIONS.UPDATE, module: 'customer', recordType: 'Customer', recordId: customer._id, meta: { name: customer.name }, changes }, { session });
  });
  return after;
}

export async function setCustomerStatus(id, status) {
  const customer = await findCustomer(id);
  if (customer.status === status) return serialize(customer.toObject());
  const from = customer.status;
  customer.status = status;
  customer.updatedBy = requireContext().userId;
  await customer.save();
  await recordAudit({ action: AUDIT_ACTIONS.STATUS_CHANGE, module: 'customer', recordType: 'Customer', recordId: customer._id, meta: { name: customer.name }, changes: [{ field: 'status', from, to: status }] });
  return serialize(customer.toObject());
}

/** Deletes it if nothing uses it — the same rules as every other delete (see record.deletion.js). */
export async function deleteCustomer(id) {
  return deleteRecord('customer', id);
}
