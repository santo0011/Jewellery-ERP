import { withTransaction } from '../../config/db.js';
import { AUDIT_ACTIONS, recordAudit } from '../../core/audit/audit.service.js';
import { requireContext } from '../../core/context/requestContext.js';
import { syncOpeningBalance } from '../../core/ledger/openingBalance.service.js';
import { nextCode } from '../../core/numbering/numbering.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { diffChanges } from '../../utils/diff.js';
import { paginate, searchFilter } from '../../utils/pagination.js';
import { Product } from '../products/product.model.js';
import { Supplier } from './supplier.model.js';

const TRACKED = [
  'companyName', 'contactPerson', 'mobile', 'alternateMobile', 'email', 'gstin', 'pan', 'address', 'bankDetails',
  'supplies', 'paymentTermsDays', 'openingBalancePaise', 'openingFineGoldMg', 'openingFineSilverMg', 'notes',
];

const serialize = (s) => ({
  id: s._id,
  code: s.code,
  companyName: s.companyName,
  contactPerson: s.contactPerson,
  mobile: s.mobile,
  alternateMobile: s.alternateMobile,
  email: s.email,
  gstin: s.gstin,
  pan: s.pan,
  address: s.address ?? {},
  bankDetails: s.bankDetails ?? {},
  supplies: s.supplies ?? [],
  paymentTermsDays: s.paymentTermsDays ?? 0,
  openingBalancePaise: s.openingBalancePaise ?? 0,
  openingFineGoldMg: s.openingFineGoldMg ?? 0,
  openingFineSilverMg: s.openingFineSilverMg ?? 0,
  notes: s.notes,
  status: s.status,
  createdAt: s.createdAt,
  updatedAt: s.updatedAt,
});

async function findSupplier(id) {
  const supplier = await Supplier.findOne({ _id: id, isDeleted: false });
  if (!supplier) throw ApiError.notFound('Supplier');
  return supplier;
}

async function assertGstinFree(gstin, exceptId) {
  if (!gstin) return;
  const clash = await Supplier.findOne({ gstin, isDeleted: false, ...(exceptId && { _id: { $ne: exceptId } }) })
    .select('companyName code')
    .lean();
  if (clash) {
    throw ApiError.conflict(`This GSTIN belongs to ${clash.companyName} (${clash.code})`, 'DUPLICATE', [
      { path: 'gstin', message: `Already used by ${clash.companyName}` },
    ]);
  }
}

export async function listSuppliers({ page, limit, q, status, supplies }) {
  const filter = { isDeleted: false, ...searchFilter(q, ['companyName', 'contactPerson', 'mobile', 'code', 'gstin']) };
  if (status) filter.status = status;
  if (supplies) filter.supplies = supplies;
  const { items, meta } = await paginate(Supplier.find(filter).sort({ companyName: 1 }), Supplier.countDocuments(filter), { page, limit });
  return { items: items.map(serialize), meta };
}

export async function getSupplier(id) {
  return serialize((await findSupplier(id)).toObject());
}

export async function createSupplier(input) {
  const { userId } = requireContext();
  await assertGstinFree(input.gstin);
  const supplier = await withTransaction(async (session) => {
    const code = await nextCode('supplier', 'S', 4, { session });
    const [doc] = await Supplier.create([{ ...input, code, createdBy: userId, updatedBy: userId }], { session });
    await syncOpeningBalance({ partyType: 'supplier', partyId: doc._id, code, amountPaise: doc.openingBalancePaise }, { session });
    await recordAudit(
      { action: AUDIT_ACTIONS.CREATE, module: 'supplier', recordType: 'Supplier', recordId: doc._id, meta: { name: doc.companyName, code } },
      { session },
    );
    return doc;
  });
  return serialize(supplier.toObject());
}

export async function updateSupplier(id, input) {
  const supplier = await findSupplier(id);
  if (input.gstin !== supplier.gstin) await assertGstinFree(input.gstin, supplier._id);
  const before = serialize(supplier.toObject());
  supplier.set({ ...input, updatedBy: requireContext().userId });
  const after = serialize(supplier.toObject());
  const changes = diffChanges(before, after, TRACKED);
  if (!changes.length) return before;
  await withTransaction(async (session) => {
    await supplier.save({ session });
    await syncOpeningBalance(
      { partyType: 'supplier', partyId: supplier._id, code: supplier.code, amountPaise: after.openingBalancePaise, previousPaise: before.openingBalancePaise },
      { session },
    );
    await recordAudit({ action: AUDIT_ACTIONS.UPDATE, module: 'supplier', recordType: 'Supplier', recordId: supplier._id, meta: { name: supplier.companyName }, changes }, { session });
  });
  return after;
}

export async function setSupplierStatus(id, status) {
  const supplier = await findSupplier(id);
  if (supplier.status === status) return serialize(supplier.toObject());
  const from = supplier.status;
  supplier.set({ status, updatedBy: requireContext().userId });
  await supplier.save();
  await recordAudit({
    action: AUDIT_ACTIONS.STATUS_CHANGE,
    module: 'supplier',
    recordType: 'Supplier',
    recordId: supplier._id,
    meta: { name: supplier.companyName },
    changes: [{ field: 'status', from, to: status }],
  });
  return serialize(supplier.toObject());
}

export async function deleteSupplier(id) {
  const supplier = await findSupplier(id);
  if (supplier.openingBalancePaise) throw ApiError.conflict('This supplier has an opening balance in the ledger. Set it to zero or deactivate the supplier instead.', 'HAS_BALANCE');
  const used = await Product.countDocuments({ supplierId: supplier._id, isDeleted: false });
  if (used) {
    throw ApiError.conflict(`${used} product(s) are linked to this supplier. Deactivate it instead.`, 'IN_USE');
  }
  supplier.set({ isDeleted: true, updatedBy: requireContext().userId });
  await supplier.save();
  await recordAudit({ action: AUDIT_ACTIONS.DELETE, module: 'supplier', recordType: 'Supplier', recordId: supplier._id, meta: { name: supplier.companyName, code: supplier.code } });
}
