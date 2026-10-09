import mongoose from 'mongoose';
import { BRANCH_STATUS, hasPermission } from '@jerp/shared';
import { requireContext } from '../../core/context/requestContext.js';
import { ApiError } from '../../utils/ApiError.js';
import { Branch } from '../branches/branch.model.js';
import { Product } from '../products/product.model.js';
import { User } from '../users/user.model.js';

export const oid = (id) => new mongoose.Types.ObjectId(String(id));

export function accessibleBranchFilter(field = 'branchId') {
  const { branchAccess } = requireContext();
  return branchAccess?.all ? {} : { [field]: { $in: (branchAccess?.branchIds ?? []).map(oid) } };
}

export function canAccessBranch(branchId) {
  const { branchAccess } = requireContext();
  return Boolean(branchAccess?.all || branchAccess?.branchIds?.includes(String(branchId)));
}

export async function requireBranch(branchId, { path = 'branchId', active = true } = {}) {
  if (!canAccessBranch(branchId)) throw ApiError.forbidden('You do not have access to this branch', 'BRANCH_FORBIDDEN');
  const branch = await Branch.findOne({ _id: branchId, ...(active && { status: BRANCH_STATUS.ACTIVE }) }).lean();
  if (!branch) throw ApiError.badRequest('Select an active branch', [{ path, message: 'Branch not available' }], 'VALIDATION_ERROR');
  return branch;
}

export const canSeeCost = () => hasPermission(requireContext().permissions, 'product.viewCost');

export async function nameMaps({ branchIds = [], userIds = [], productIds = [] }) {
  const uniq = (list) => [...new Set(list.filter(Boolean).map(String))];
  const [branches, users, products] = await Promise.all([
    uniq(branchIds).length ? Branch.find({ _id: { $in: uniq(branchIds) } }).select('name code').lean() : [],
    uniq(userIds).length ? User.find({ _id: { $in: uniq(userIds) } }).select('name').lean() : [],
    uniq(productIds).length
      ? Product.find({ _id: { $in: uniq(productIds) } }).select('sku name metal purity grossWeightMg netWeightMg fineWeightMg status costPricePaise quantity').lean()
      : [],
  ]);
  const toMap = (rows, fn) => new Map(rows.map((r) => [String(r._id), fn(r)]));
  const cost = canSeeCost();
  return {
    branches: toMap(branches, (b) => ({ id: b._id, name: b.name, code: b.code })),
    users: toMap(users, (u) => ({ id: u._id, name: u.name })),
    products: toMap(products, (p) => ({
      id: p._id,
      sku: p.sku,
      name: p.name,
      metal: p.metal,
      purity: p.purity,
      quantity: p.quantity,
      grossWeightMg: p.grossWeightMg,
      netWeightMg: p.netWeightMg,
      fineWeightMg: p.fineWeightMg,
      status: p.status,
      ...(cost && { costPricePaise: p.costPricePaise }),
    })),
  };
}

export const pick = (map, id) => (id ? (map.get(String(id)) ?? null) : null);
