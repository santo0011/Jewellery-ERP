import { ORG_STATUS, USER_STATUS } from '@jerp/shared';
import { ApiError } from '../../utils/ApiError.js';
import { Branch } from '../branches/branch.model.js';
import { Organisation } from '../organisations/organisation.model.js';
import { Role } from '../roles/role.model.js';
import { User } from '../users/user.model.js';
import { Session } from './session.model.js';
import { organisationDeactivated } from '../organisations/organisationAccess.js';

const SKIP = { skipTenant: true };

export async function loadPrincipal({ sub, org, sid, tv }) {
  const [user, session, organisation] = await Promise.all([
    User.findOne({ _id: sub, organisationId: org })
      .setOptions(SKIP)
      .select('name email status tokenVersion roleIds branchAccess defaultBranchId mustChangePassword')
      .lean(),
    Session.findOne({ _id: sid, userId: sub, realm: { $ne: 'platform' }, revokedAt: null, expiresAt: { $gt: new Date() } }).select('_id').lean(),
    Organisation.findById(org).select('status').lean(),
  ]);

  // A signed token for a deactivated organisation says why, even though deactivation also revoked its session.
  if (user && organisation?.status === ORG_STATUS.SUSPENDED) throw organisationDeactivated();
  if (!user || !session || user.tokenVersion !== tv) throw ApiError.unauthorized('Session is no longer valid', 'SESSION_INVALID');
  if (user.status !== USER_STATUS.ACTIVE) throw ApiError.unauthorized('Your account is disabled', 'ACCOUNT_DISABLED');
  if (!organisation || organisation.status !== ORG_STATUS.ACTIVE) throw organisationDeactivated();

  const roles = await Role.find({ _id: { $in: user.roleIds }, organisationId: org }).setOptions(SKIP).select('permissions').lean();
  const permissions = new Set(roles.flatMap((r) => r.permissions));

  return {
    userId: user._id,
    organisationId: org,
    sessionId: session._id,
    name: user.name,
    email: user.email,
    permissions,
    branchAccess: { all: Boolean(user.branchAccess?.all), branchIds: (user.branchAccess?.branchIds ?? []).map(String) },
    defaultBranchId: user.defaultBranchId ? String(user.defaultBranchId) : null,
    mustChangePassword: Boolean(user.mustChangePassword),
  };
}

const accessScope = (principal) => (principal.branchAccess.all ? {} : { _id: { $in: principal.branchAccess.branchIds } });

/**
 * Picks the branch the request acts in (header, else the user's default, else the first accessible one)
 * and returns that branch's permission list (null = everything allowed).
 */
export async function resolveActiveBranch(principal, requestedBranchId) {
  const base = { organisationId: principal.organisationId, status: 'active' };
  const fields = '_id allowedPermissions isHeadOffice';

  if (requestedBranchId) {
    if (!/^[a-f\d]{24}$/i.test(requestedBranchId)) throw ApiError.badRequest('Invalid branch', undefined, 'INVALID_BRANCH');
    if (!principal.branchAccess.all && !principal.branchAccess.branchIds.includes(requestedBranchId)) {
      throw ApiError.forbidden('You do not have access to this branch', 'BRANCH_FORBIDDEN');
    }
    const branch = await Branch.findOne({ _id: requestedBranchId, ...base }).setOptions(SKIP).select(fields).lean();
    if (!branch) throw ApiError.forbidden('Branch is not available', 'BRANCH_FORBIDDEN');
    return { branchId: String(branch._id), allowedPermissions: branch.allowedPermissions ?? null };
  }

  const preferred = principal.defaultBranchId
    ? await Branch.findOne({ _id: principal.defaultBranchId, ...base, ...accessScope(principal) }).setOptions(SKIP).select(fields).lean()
    : null;
  const branch = preferred ?? (await Branch.findOne({ ...base, ...accessScope(principal) }).setOptions(SKIP).sort({ isHeadOffice: -1, name: 1 }).select(fields).lean());
  if (!branch) return { branchId: null, allowedPermissions: [] };
  return { branchId: String(branch._id), allowedPermissions: branch.allowedPermissions ?? null };
}
