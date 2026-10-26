import { ADDRESS_FIELDS, BRANCH_STATUS, SUBSCRIPTION_STATUS } from '@jerp/shared';
import { branchSchema } from '@jerp/shared/schemas';
import { editSnapshot } from '../undo/undo.snapshot.js';
import { copyToOrganisation } from '../organisations/headOfficeAddress.js';
import { AUDIT_ACTIONS, recordAudit } from '../../core/audit/audit.service.js';
import { requireContext } from '../../core/context/requestContext.js';
import { ApiError } from '../../utils/ApiError.js';
import { diffChanges } from '../../utils/diff.js';
import { escapeRegex, paginate } from '../../utils/pagination.js';
import { limitsOf } from '../billing/limits.js';
import { Subscription } from '../organisations/subscription.model.js';
import { withTransaction } from '../../config/db.js';
import { branchLoginsByBranch, syncBranchLoginEmail } from '../users/user.service.js';
import { Branch } from './branch.model.js';

const EDITABLE_FIELDS = ['code', 'name', 'phone', 'email', 'gstin', ...ADDRESS_FIELDS.map((f) => `address.${f}`), 'address.stateCode'];

function accessFilter() {
  const { branchAccess } = requireContext();
  return branchAccess?.all ? {} : { _id: { $in: branchAccess?.branchIds ?? [] } };
}

export async function listBranches({ page, limit, q, status, headOffice }) {
  const filter = { ...accessFilter() };
  if (status) filter.status = status;
  if (headOffice === 'exclude') filter.isHeadOffice = { $ne: true };
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

/** Branches allowed by the subscription (2 on a free trial, else the plan's limit; null = unlimited) and in use. */
export async function branchUsage() {
  const [subscription, used] = await Promise.all([Subscription.findOne({}).lean(), Branch.countDocuments({ status: BRANCH_STATUS.ACTIVE })]);
  const limit = limitsOf(subscription).branches;
  return { limit, used, available: limit == null ? null : Math.max(0, limit - used), trial: subscription?.status === SUBSCRIPTION_STATUS.TRIAL };
}

async function assertBranchLimit() {
  const { limit, used, trial } = await branchUsage();
  if (limit != null && used >= limit) {
    const allowed = `${limit} branch${limit === 1 ? '' : 'es'} (head office included)`;
    throw ApiError.forbidden(
      trial ? `The free trial allows ${allowed}, and all are in use. Choose a subscription plan to add more.` : `Your plan allows ${allowed}, and all are in use. Upgrade your plan to add more.`,
      'BRANCH_LIMIT_REACHED',
    );
  }
}

// Per-branch module limits are gone (the role decides); a list stored on older branches is not sent.
// eslint-disable-next-line no-unused-vars
export const serializeBranch = ({ allowedPermissions, ...b }) => b;

export async function createBranch(input) {
  const { userId } = requireContext();
  await assertBranchLimit();
  const branch = await Branch.create({ ...input, createdBy: userId, updatedBy: userId });
  await recordAudit({ action: AUDIT_ACTIONS.CREATE, module: 'branch', recordType: 'Branch', recordId: branch._id, meta: { code: branch.code, name: branch.name }, undo: { type: 'branch.create', branchId: null } });
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
    await recordAudit({ action: AUDIT_ACTIONS.UPDATE, module: 'branch', recordType: 'Branch', recordId: branch._id, meta: { name: branch.name }, changes, undo: { type: 'branch.update', branchId: null, data: editSnapshot(branchSchema, before, branch.toObject()) } }, { session });
    // The head office's address is the organisation's registered address: keep them the same (and in its history).
    if (branch.isHeadOffice && (await copyToOrganisation(branch.organisationId, branch.address, { session, changes }))) {
      const addressChanges = changes.filter((c) => c.field.startsWith('address.'));
      await recordAudit({ action: AUDIT_ACTIONS.UPDATE, module: 'organisation', recordType: 'Organisation', recordId: branch.organisationId, changes: addressChanges, meta: { via: 'Head office branch' } }, { session });
    }
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
    meta: { name: branch.name },
    changes: [{ field: 'status', from, to: status }],
    undo: { type: 'branch.status', branchId: null, data: { from, to: status } },
  });
  return branch.toObject();
}
