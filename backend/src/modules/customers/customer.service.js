import { hasPermission, SALE_STATUS } from '@jerp/shared';
import { withTransaction } from '../../config/db.js';
import { AUDIT_ACTIONS, recordAudit } from '../../core/audit/audit.service.js';
import { requireContext } from '../../core/context/requestContext.js';
import { syncOpeningBalance } from '../../core/ledger/openingBalance.service.js';
import { nextCode } from '../../core/numbering/numbering.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { diffChanges } from '../../utils/diff.js';
import { maskTail } from '../../utils/mask.js';
import { fromDate, paginate, searchFilter, toDate } from '../../utils/pagination.js';
import { accessibleBranchFilter } from '../inventory/inventory.helpers.js';
import { Sale } from '../sales/sale.model.js';
import { Customer } from './customer.model.js';

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
  const doc = { ...input, dob: toDate(input.dob), anniversary: toDate(input.anniversary) };

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
    .select('customerId payments')
    .lean();
  const add = (map, key, amount) => amount && map.set(key, (map.get(key) ?? 0) + amount);
  for (const s of sales) {
    const key = String(s.customerId);
    for (const p of s.payments) add(p.mode === 'credit' ? credit : paid, key, p.amountPaise);
  }
  return { credit, paid };
}

const totalDue = (c, credit) => (credit.get(String(c._id)) ?? 0) + Math.max(0, c.openingBalancePaise ?? 0);

/** 'due' = owes and has paid nothing, 'partly_paid' = owes but has paid some, 'paid' = billed and owes nothing, null = no bills or dues. */
function paymentStatus(duePaise, paidPaise) {
  if (duePaise > 0) return paidPaise > 0 ? 'partly_paid' : 'due';
  return paidPaise > 0 ? 'paid' : null;
}

/** due: 'due' = only customers who owe money (highest first), 'clear' = nothing owed. */
export async function listCustomers({ page, limit, q, segment, status, due }) {
  const filter = { isDeleted: false, ...searchFilter(q, ['name', 'mobile', 'code', 'email', 'alternateMobile']) };
  if (segment) filter.segment = segment;
  if (status) filter.status = status;
  const { credit, paid } = await billsByCustomer();
  const owing = { $or: [{ _id: { $in: [...credit.keys()] } }, { openingBalancePaise: { $gt: 0 } }] };
  const withDue = (c) => {
    const duePaise = totalDue(c, credit);
    const paidPaise = paid.get(String(c._id)) ?? 0;
    return { ...serialize(c), duePaise, creditDuePaise: credit.get(String(c._id)) ?? 0, paidPaise, paymentStatus: paymentStatus(duePaise, paidPaise) };
  };

  if (due === 'due') {
    // The owing set is small; rank it by amount so the biggest dues come first.
    const all = (await Customer.find({ ...filter, $and: [owing] }).lean()).map(withDue).sort((a, b) => b.duePaise - a.duePaise);
    return { items: all.slice((page - 1) * limit, page * limit), meta: { page, limit, total: all.length, pages: Math.max(1, Math.ceil(all.length / limit)) } };
  }
  if (due === 'clear') filter.$nor = [owing];
  const { items, meta } = await paginate(Customer.find(filter).sort({ createdAt: -1 }), Customer.countDocuments(filter), { page, limit });
  return { items: items.map(withDue), meta: { ...meta, summary: await customerSummary(credit, owing) } };
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
    Customer.aggregate([{ $match: { isDeleted: false, openingBalancePaise: { $gt: 0 } } }, { $group: { _id: null, total: { $sum: '$openingBalancePaise' } } }]),
  ]);
  const creditPaise = [...credit.values()].reduce((s, v) => s + v, 0);
  return { total, newThisMonth: fresh, duePaise: creditPaise + (opening[0]?.total ?? 0), owing: owingCount };
}

export async function getCustomer(id) {
  return serialize((await findCustomer(id)).toObject());
}

export async function createCustomer(input) {
  const { userId } = requireContext();
  await assertMobileFree(input.mobile);
  const customer = await withTransaction(async (session) => {
    const code = await nextCode('customer', 'C', 5, { session });
    const [doc] = await Customer.create([{ ...toDocument(input), code, createdBy: userId, updatedBy: userId }], { session });
    await syncOpeningBalance({ partyType: 'customer', partyId: doc._id, code, amountPaise: doc.openingBalancePaise }, { session });
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
  customer.set({ ...toDocument(input, customer.toObject()), updatedBy: userId });
  const after = serialize(customer.toObject());
  const changes = diffChanges(before, after, TRACKED);
  if (!changes.length) return before;

  await withTransaction(async (session) => {
    await customer.save({ session });
    await syncOpeningBalance(
      { partyType: 'customer', partyId: customer._id, code: customer.code, amountPaise: after.openingBalancePaise, previousPaise: before.openingBalancePaise },
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

export async function deleteCustomer(id) {
  const customer = await findCustomer(id);
  if (customer.openingBalancePaise) throw ApiError.conflict('This customer has an opening balance in the ledger. Set it to zero or deactivate the customer instead.', 'HAS_BALANCE');
  customer.isDeleted = true;
  customer.updatedBy = requireContext().userId;
  await customer.save();
  await recordAudit({ action: AUDIT_ACTIONS.DELETE, module: 'customer', recordType: 'Customer', recordId: customer._id, meta: { name: customer.name, code: customer.code } });
}
