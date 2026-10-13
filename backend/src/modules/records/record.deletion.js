import { hasAnyPermission, PRODUCT_STATUS } from '@jerp/shared';
import { AUDIT_ACTIONS, recordAudit } from '../../core/audit/audit.service.js';
import { requireContext } from '../../core/context/requestContext.js';
import { findReferences, findReferencesMany, pluralLabel } from '../../core/deletion/references.js';
import { FileAsset } from '../../core/storage/fileAsset.model.js';
import { storage } from '../../core/storage/storage.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { Session } from '../auth/session.model.js';
import { Branch } from '../branches/branch.model.js';
import { Category } from '../categories/category.model.js';
import { Customer } from '../customers/customer.model.js';
import { AttendanceCalendar, Employee } from '../hr/hr.models.js';
import { accessibleBranchFilter } from '../inventory/inventory.helpers.js';
import { Item } from '../items/item.model.js';
import { Order } from '../orders/order.model.js';
import { Product } from '../products/product.model.js';
import { PurchaseOrder } from '../purchases/purchase.model.js';
import { Role } from '../roles/role.model.js';
import { Supplier } from '../suppliers/supplier.model.js';
import { User } from '../users/user.model.js';

async function removeFile(fileId) {
  if (!fileId) return;
  const asset = await FileAsset.findByIdAndDelete(fileId).lean();
  if (asset) await storage.remove(asset.key);
}

/**
 * Everything that can be deleted, and when. A record can be deleted only while nothing else points to it
 * (see findReferences); `rule` adds what a reference scan cannot see. Customers, suppliers and products are
 * soft-deleted (hidden, kept for their code and history); the rest are removed. Every delete is audited.
 *
 *   permissions  any one of them allows the delete
 *   instead      what to do when it is in use (shown with the reason)
 *   branchScoped only records in the user's branches
 *   ignore       references the delete tidies up itself (see cleanup)
 *   rule(doc)    a reason it can never be deleted, or null
 *   cleanup(doc) runs after the delete: files, settings that only belong to it
 */
const TYPES = {
  customer: { model: Customer, module: 'customer', permissions: ['customer.delete'], soft: true, instead: 'Deactivate it instead.', name: (d) => d.name, meta: (d) => ({ code: d.code }) },
  supplier: { model: Supplier, module: 'supplier', permissions: ['supplier.delete'], soft: true, instead: 'Deactivate it instead.', name: (d) => d.companyName, meta: (d) => ({ code: d.code }) },
  product: {
    model: Product,
    module: 'product',
    permissions: ['product.delete'],
    soft: true,
    branchScoped: true,
    name: (d) => d.name,
    meta: (d) => ({ sku: d.sku }),
    rule: (d) => (d.status !== PRODUCT_STATUS.DRAFT ? 'Only draft products can be deleted. A stocked piece leaves inventory through a sale, return or adjustment.' : null),
    cleanup: (d) => Promise.all((d.images ?? []).map((i) => removeFile(i.fileId))),
  },
  category: { model: Category, module: 'category', permissions: ['category.delete'], name: (d) => d.name, instead: 'Move them to another category first.' },
  item: {
    model: Item,
    module: 'item',
    permissions: ['product.delete', 'purchase.edit'],
    instead: 'Deactivate it instead.',
    name: (d) => d.name,
    meta: (d) => ({ code: d.code }),
    rule: (d) => (d.usedCount ? `${d.usedCount} piece${d.usedCount === 1 ? ' was' : 's were'} made from this item. Deactivate it instead.` : null),
  },
  role: {
    model: Role,
    module: 'role',
    permissions: ['role.delete'],
    instead: 'Give its users another role first.',
    name: (d) => d.name,
    rule: (d) => (d.isSystem ? 'Default roles cannot be deleted. You can change their permissions instead.' : null),
  },
  employee: {
    model: Employee,
    module: 'employee',
    permissions: ['employee.delete'],
    branchScoped: true,
    instead: 'Mark the employee as left instead.',
    name: (d) => d.name,
    meta: (d) => ({ code: d.code }),
    cleanup: (d) => removeFile(d.photoFileId),
  },
  branch: {
    model: Branch,
    module: 'branch',
    permissions: ['branch.delete'],
    instead: 'Deactivate it instead.',
    name: (d) => d.name,
    meta: (d) => ({ code: d.code }),
    rule: (d) => (d.isHeadOffice ? 'The head office cannot be deleted.' : null),
    // Its holiday calendar and users' access to it go with it; a branch login is a real user and must be removed first.
    ignore: ['AttendanceCalendar', { model: 'User', paths: ['branchAccess.branchIds', 'defaultBranchId'] }],
    cleanup: async (d) => {
      await AttendanceCalendar.deleteMany({ branchId: d._id });
      await User.updateMany({ 'branchAccess.branchIds': d._id }, { $pull: { 'branchAccess.branchIds': d._id } });
      await User.updateMany({ defaultBranchId: d._id }, { $set: { defaultBranchId: null } });
    },
  },
  user: {
    model: User,
    module: 'user',
    permissions: ['user.delete'],
    instead: 'Deactivate the user instead.',
    name: (d) => d.name,
    meta: (d) => ({ email: d.email }),
    rule: (d) => {
      if (d.isOwner) return 'The organisation owner cannot be deleted.';
      if (String(d._id) === String(requireContext().userId)) return 'You cannot delete your own login.';
      if (d.branchLoginFor) return 'This is a branch login. Remove it from the branch’s page instead.';
      return null;
    },
    cleanup: (d) => Session.deleteMany({ userId: d._id }),
  },
  purchaseOrder: {
    model: PurchaseOrder,
    module: 'purchase',
    permissions: ['purchase.cancel'],
    branchScoped: true,
    instead: 'Cancel it instead.',
    name: (d) => `Purchase order ${d.orderNo}`,
    rule: (d) => (d.purchaseId ? `Received on purchase ${d.purchaseNo}.` : null),
  },
  order: {
    model: Order,
    module: 'order',
    permissions: ['order.cancel'],
    branchScoped: true,
    instead: 'Cancel it instead.',
    name: (d) => `Order ${d.orderNo}`,
    rule: (d) => (d.advancePaise > 0 || d.advances?.length ? 'An advance was taken on this order. Cancel it instead, so the advance is refunded or adjusted properly.' : null),
    cleanup: (d) => Promise.all((d.images ?? []).map((i) => removeFile(i.fileId))),
  },
};

export const DELETABLE_TYPES = Object.keys(TYPES);

function typeOf(type) {
  const t = TYPES[type];
  if (!t) throw ApiError.notFound('Record type');
  if (!hasAnyPermission(requireContext().permissions, t.permissions)) throw ApiError.forbidden();
  return t;
}

async function findDoc(t, id) {
  const filter = { _id: id, ...(t.soft && { isDeleted: { $ne: true } }), ...(t.branchScoped && accessibleBranchFilter()) };
  const doc = await t.model.findOne(filter).lean();
  if (!doc) throw ApiError.notFound('Record');
  return doc;
}

const joinList = (parts) => (parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`);

/** Can this record be deleted? If not, why: a fixed rule, or the records that use it. */
export async function deleteCheck(type, id) {
  const t = typeOf(type);
  const doc = await findDoc(t, id);
  const name = t.name(doc);
  const reason = t.rule?.(doc) ?? null;
  const usedBy = reason ? [] : await findReferences(t.model.modelName, doc._id, { ignore: t.ignore ?? [] });
  const message = reason ?? (usedBy.length ? `${name} is used by ${joinList(usedBy.map((r) => r.label))}, so it cannot be deleted.${t.instead ? ` ${t.instead}` : ''}` : null);
  return { type, id: doc._id, name, deletable: !message, reason: reason ? 'NOT_DELETABLE' : usedBy.length ? 'IN_USE' : null, message, usedBy: usedBy.map(({ model, count, label }) => ({ model, count, label })) };
}

/**
 * Deletability of a whole table page at once, so every row can show its Delete button enabled or disabled (with the
 * reason as a tooltip) before anyone clicks: { [id]: { deletable, message } }. Without the permission every row is
 * disabled with that reason. Ids the user cannot see are left out.
 */
export async function deleteChecks(type, ids) {
  const t = TYPES[type];
  if (!t) throw ApiError.notFound('Record type');
  if (!hasAnyPermission(requireContext().permissions, t.permissions)) {
    return Object.fromEntries(ids.map((id) => [id, { deletable: false, message: 'You do not have permission to delete this.' }]));
  }
  const filter = { _id: { $in: ids }, ...(t.soft && { isDeleted: { $ne: true } }), ...(t.branchScoped && accessibleBranchFilter()) };
  const docs = await t.model.find(filter).lean();
  const open = docs.filter((d) => !t.rule?.(d));
  const used = open.length ? await findReferencesMany(t.model.modelName, open.map((d) => d._id), { ignore: t.ignore ?? [] }) : new Map();
  return Object.fromEntries(
    docs.map((d) => {
      const rule = t.rule?.(d) ?? null;
      const models = used.get(String(d._id)) ?? [];
      const message = rule ?? (models.length ? `In use by ${joinList(models.map(pluralLabel))}, so it cannot be deleted.${t.instead ? ` ${t.instead}` : ''}` : null);
      return [String(d._id), { deletable: !message, message }];
    }),
  );
}

/** Deletes a record nothing uses (checked again here), tidying up what belonged only to it. */
export async function deleteRecord(type, id) {
  const t = typeOf(type);
  const check = await deleteCheck(type, id);
  // IN_USE: other records point to it. NOT_DELETABLE: a fixed rule (head office, owner, default role, stocked piece).
  if (!check.deletable) throw ApiError.conflict(check.message, check.reason, check.usedBy.map((r) => ({ path: r.model, message: r.label })));
  const doc = await findDoc(t, id);
  if (t.soft) await t.model.updateOne({ _id: doc._id }, { $set: { isDeleted: true, updatedBy: requireContext().userId } });
  else await t.model.deleteOne({ _id: doc._id });
  await t.cleanup?.(doc);
  await recordAudit({ action: AUDIT_ACTIONS.DELETE, module: t.module, recordType: t.model.modelName, recordId: doc._id, meta: { name: check.name, ...t.meta?.(doc) } });
  return { id: doc._id, name: check.name };
}
