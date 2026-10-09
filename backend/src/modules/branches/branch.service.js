import { BRANCH_PERMISSIONS, BRANCH_STATUS } from '@jerp/shared';
import { AUDIT_ACTIONS, recordAudit } from '../../core/audit/audit.service.js';
import { requireContext } from '../../core/context/requestContext.js';
import { ApiError } from '../../utils/ApiError.js';
import { diffChanges } from '../../utils/diff.js';
import { escapeRegex, paginate } from '../../utils/pagination.js';
import { Organisation } from '../organisations/organisation.model.js';
import { withTransaction } from '../../config/db.js';
import { branchLoginsByBranch, syncBranchLoginEmail } from '../users/user.service.js';
import { Branch } from './branch.model.js';

const EDITABLE_FIELDS = ['code', 'name', 'phone', 'email', 'gstin', 'address.line1', 'address.line2', 'address.city', 'address.stateCode', 'address.pincode'];

function accessFilter() {
  const { branchAccess } = requireContext();
  return branchAccess?.all ? {} : { _id: { $in: branchAccess?.branchIds ?? [] } };
}

export async function listBranches({ page, limit, q, status }) {
  const filter = { ...accessFilter() };
  if (status) filter.status = status;
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ name: rx }, { code: rx }, { 'address.city': rx }];
  }
  const result = await paginate(Branch.find(filter).sort({ isHeadOffice: -1, name: 1 }), Branch.countDocuments(filter), { page, limit });
  const logins = await branchLoginsByBranch(result.items.map((b) => b._id));
  return { ...result, items: result.items.map((b) => ({ ...serializeBranch(b), login: logins.get(String(b._id)) ?? null })) };
}

export async function branchDirectory() {
  const branches = await Branch.find({ status: BRANCH_STATUS.ACTIVE }).select('code name isHeadOffice').sort({ isHeadOffice: -1, name: 1 }).lean();
  return branches.map((b) => ({ id: b._id, code: b.code, name: b.name }));
}

export async function getBranch(id) {
  const branch = await Branch.findOne({ _id: id, ...accessFilter() }).lean();
  if (!branch) throw ApiError.notFound('Branch');
  return serializeBranch(branch);
}

export async function branchUsage() {
  const { organisationId } = requireContext();
  const [organisation, used] = await Promise.all([
    Organisation.findById(organisationId).select('branchLimit').lean(),
    Branch.countDocuments({ status: BRANCH_STATUS.ACTIVE }),
  ]);
  const limit = organisation?.branchLimit ?? 1;
  return { limit, used, available: Math.max(0, limit - used) };
}

async function assertBranchLimit() {
  const { limit, used } = await branchUsage();
  if (used >= limit) {
    throw ApiError.forbidden(
      `Your branch limit is ${limit} and all ${limit === 1 ? 'of it is' : `${limit} are`} in use. Contact your platform administrator to raise it.`,
      'BRANCH_LIMIT_REACHED',
    );
  }
}

export async function setBranchPermissions(id, permissions) {
  const { userId } = requireContext();
  const branch = await Branch.findOne({ _id: id, ...accessFilter() });
  if (!branch) throw ApiError.notFound('Branch');
  const before = branch.allowedPermissions ? [...branch.allowedPermissions] : [...BRANCH_PERMISSIONS];
  const added = permissions.filter((p) => !before.includes(p));
  const removed = before.filter((p) => !permissions.includes(p));
  if (!added.length && !removed.length) return serializeBranch(branch.toObject());

  branch.allowedPermissions = permissions;
  branch.updatedBy = userId;
  await branch.save();
  await recordAudit({
    action: AUDIT_ACTIONS.UPDATE,
    module: 'branch',
    recordType: 'Branch',
    recordId: branch._id,
    meta: { name: branch.name },
    changes: [{ field: 'allowedPermissions', from: { removed }, to: { added } }],
  });
  return serializeBranch(branch.toObject());
}

export const serializeBranch = (b) => ({ ...b, allowedPermissions: b.allowedPermissions ?? [...BRANCH_PERMISSIONS] });

export async function createBranch(input) {
  const { userId } = requireContext();
  await assertBranchLimit();
  const branch = await Branch.create({ ...input, createdBy: userId, updatedBy: userId });
  await recordAudit({ action: AUDIT_ACTIONS.CREATE, module: 'branch', recordType: 'Branch', recordId: branch._id, meta: { code: branch.code, name: branch.name } });
  return serializeBranch(branch.toObject());
}

export async function updateBranch(id, input) {
  const { userId } = requireContext();
  const branch = await Branch.findOne({ _id: id, ...accessFilter() });
  if (!branch) throw ApiError.notFound('Branch');

  const before = branch.toObject();
  branch.set({ ...input, updatedBy: userId });
  const changes = diffChanges(before, branch.toObject(), EDITABLE_FIELDS);
  if (changes.length === 0) return before;

  await withTransaction(async (session) => {
    if (changes.some((c) => c.field === 'email')) await syncBranchLoginEmail(branch._id, branch.email ?? null, { session });
    await branch.save({ session });
    await recordAudit({ action: AUDIT_ACTIONS.UPDATE, module: 'branch', recordType: 'Branch', recordId: branch._id, changes }, { session });
  });
  return branch.toObject();
}

export async function setBranchStatus(id, status) {
  const { userId } = requireContext();
  const branch = await Branch.findOne({ _id: id, ...accessFilter() });
  if (!branch) throw ApiError.notFound('Branch');
  if (branch.status === status) return branch.toObject();

  if (status === BRANCH_STATUS.INACTIVE && branch.isHeadOffice) {
    throw ApiError.conflict('The head office branch cannot be deactivated', 'HEAD_OFFICE_REQUIRED');
  }
  if (status === BRANCH_STATUS.ACTIVE) await assertBranchLimit();

  const from = branch.status;
  branch.status = status;
  branch.updatedBy = userId;
  await branch.save();
  await recordAudit({
    action: AUDIT_ACTIONS.STATUS_CHANGE,
    module: 'branch',
    recordType: 'Branch',
    recordId: branch._id,
    changes: [{ field: 'status', from, to: status }],
  });
  return branch.toObject();
}
