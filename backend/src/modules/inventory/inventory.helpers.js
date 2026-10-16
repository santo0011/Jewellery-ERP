import mongoose from 'mongoose';
import { BRANCH_SCOPED_MODULES, BRANCH_STATUS, hasPermission } from '@jerp/shared';
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

// ---------------------------------------------------------------- navbar branch filter (list pages)

/**
 * Modules whose list pages show the navbar branch filter: every branch module once the organisation has another
 * active branch (what each person may use there comes from their role). With the head office only, none.
 */
export async function sharedBranchModules() {
  const other = await Branch.exists({ isHeadOffice: false, status: BRANCH_STATUS.ACTIVE });
  return new Set(other ? BRANCH_SCOPED_MODULES : []);
}

async function headOfficeId() {
  const ho = await Branch.findOne({ isHeadOffice: true }).select('_id').lean();
  return ho ? String(ho._id) : null;
}

/**
 * The branch a module's list page should show, from the navbar filter: the chosen branch (the working branch,
 * X-Branch-Id), or null for "All branches" (X-Branch-View: all — still limited to the user's branches). A module not
 * shared with any branch shows the head office only. A branchId the page passes itself always wins over this.
 */
export async function viewBranchFor(module) {
  const { branchId, branchView, branchAccess } = requireContext();
  if (!(await sharedBranchModules()).has(module)) {
    const ho = await headOfficeId();
    // Someone without head-office access (e.g. a branch login) keeps to their own branch.
    return ho && (branchAccess?.all || branchAccess?.branchIds?.includes(ho)) ? ho : (branchId ?? null);
  }
  if (branchView === 'all') return null;
  return branchId ?? null;
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
