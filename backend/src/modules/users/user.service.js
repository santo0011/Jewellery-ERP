import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { BRANCH_STATUS, hasPermission, PLAN_LIMITS, USER_STATUS } from '@jerp/shared';
import { env } from '../../config/env.js';
import { withTransaction } from '../../config/db.js';
import { AUDIT_ACTIONS, recordAudit } from '../../core/audit/audit.service.js';
import { requireContext } from '../../core/context/requestContext.js';
import { ApiError } from '../../utils/ApiError.js';
import { escapeRegex, paginate } from '../../utils/pagination.js';
import { Session } from '../auth/session.model.js';
import { Branch } from '../branches/branch.model.js';
import { Subscription } from '../organisations/subscription.model.js';
import { Role } from '../roles/role.model.js';
import { User } from './user.model.js';
import { assertEmailAvailable } from './emailAvailability.js';

const PUBLIC_FIELDS = 'name email mobile roleIds branchAccess defaultBranchId isOwner status lastLoginAt mustChangePassword createdAt';

const toObjectIds = (ids) => ids.map((id) => new mongoose.Types.ObjectId(String(id)));

function serialize(user, rolesById, branchesById) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    mobile: user.mobile,
    isOwner: user.isOwner,
    status: user.status,
    mustChangePassword: Boolean(user.mustChangePassword),
    lastLoginAt: user.lastLoginAt,
    createdAt: user.createdAt,
    roles: (user.roleIds ?? []).map((id) => rolesById.get(String(id))).filter(Boolean),
    branchAccess: {
      all: Boolean(user.branchAccess?.all),
      branches: (user.branchAccess?.branchIds ?? []).map((id) => branchesById.get(String(id))).filter(Boolean),
    },
    defaultBranch: user.defaultBranchId ? (branchesById.get(String(user.defaultBranchId)) ?? null) : null,
  };
}

async function lookups() {
  const [roles, branches] = await Promise.all([Role.find({}).select('name isSystem').lean(), Branch.find({}).select('code name status').lean()]);
  return {
    rolesById: new Map(roles.map((r) => [String(r._id), { id: r._id, name: r.name, isSystem: r.isSystem }])),
    branchesById: new Map(branches.map((b) => [String(b._id), { id: b._id, code: b.code, name: b.name, status: b.status }])),
  };
}

function visibilityFilter() {
  const { branchAccess } = requireContext();
  if (branchAccess?.all) return {};
  return { 'branchAccess.all': false, 'branchAccess.branchIds': { $in: toObjectIds(branchAccess?.branchIds ?? []) } };
}

async function findUser(id) {
  const user = await User.findOne({ _id: id, ...visibilityFilter() });
  if (!user) throw ApiError.notFound('User');
  return user;
}

async function resolveRoles(roleIds) {
  const roles = await Role.find({ _id: { $in: roleIds } }).select('permissions name').lean();
  if (roles.length !== new Set(roleIds.map(String)).size) {
    throw ApiError.badRequest('One or more roles are invalid', [{ path: 'roleIds', message: 'Select valid roles' }], 'VALIDATION_ERROR');
  }
  return roles;
}

function assertCanAssign(roles) {
  const { rolePermissions: permissions } = requireContext();
  const requested = new Set(roles.flatMap((r) => r.permissions));
  const denied = [...requested].filter((p) => !hasPermission(permissions, p));
  if (denied.length) {
    throw ApiError.forbidden('You cannot assign a role with permissions you do not have', 'PERMISSION_ESCALATION');
  }
}

async function assertBranches({ branchAccess, defaultBranchId }) {
  const ids = [...new Set([...(branchAccess.all ? [] : branchAccess.branchIds), ...(defaultBranchId ? [defaultBranchId] : [])])];
  if (!ids.length) return;
  const count = await Branch.countDocuments({ _id: { $in: ids }, status: BRANCH_STATUS.ACTIVE });
  if (count !== ids.length) {
    throw ApiError.badRequest('One or more branches are invalid or inactive', [{ path: 'branchAccess.branchIds', message: 'Select active branches' }], 'VALIDATION_ERROR');
  }
}

async function assertUserLimit() {
  const subscription = await Subscription.findOne({}).lean();
  const max = PLAN_LIMITS[subscription?.plan]?.users;
  if (max == null) return;
  const count = await User.countDocuments({ status: USER_STATUS.ACTIVE });
  if (count >= max) throw ApiError.forbidden(`Your plan allows ${max} active users, and all are in use (branch logins count too). Deactivate a user, or ask your platform administrator to upgrade the plan.`, 'PLAN_LIMIT_REACHED');
}

const hashPassword = (password) => bcrypt.hash(password, env.BCRYPT_ROUNDS);

async function revokeAllSessions(userId, reason, session) {
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } }, { session });
  await Session.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: reason } }, { session });
}

export async function listUsers({ page, limit, q, status, roleId, branchId }) {
  const filter = { ...visibilityFilter() };
  if (status) filter.status = status;
  if (roleId) filter.roleIds = new mongoose.Types.ObjectId(roleId);
  if (branchId) filter.$or = [{ 'branchAccess.all': true }, { 'branchAccess.branchIds': new mongoose.Types.ObjectId(branchId) }];
  if (q) {
    const rx = new RegExp(escapeRegex(q), 'i');
    filter.$and = [{ $or: [{ name: rx }, { email: rx }, { mobile: rx }] }];
  }
  const [{ items, meta }, maps] = await Promise.all([
    paginate(User.find(filter).select(PUBLIC_FIELDS).sort({ isOwner: -1, status: 1, name: 1 }), User.countDocuments(filter), { page, limit }),
    lookups(),
  ]);
  return { items: items.map((u) => serialize(u, maps.rolesById, maps.branchesById)), meta };
}

export async function getUser(id) {
  const user = await User.findOne({ _id: id, ...visibilityFilter() }).select(PUBLIC_FIELDS).lean();
  if (!user) throw ApiError.notFound('User');
  const maps = await lookups();
  return serialize(user, maps.rolesById, maps.branchesById);
}

export async function createUser(input) {
  const { userId } = requireContext();
  const roles = await resolveRoles(input.roleIds);
  assertCanAssign(roles);
  await assertBranches(input);
  await assertUserLimit();

  await assertEmailAvailable(input.email);

  const branchAccess = { all: input.branchAccess.all, branchIds: input.branchAccess.all ? [] : input.branchAccess.branchIds };
  const user = await User.create({
    name: input.name,
    email: input.email,
    mobile: input.mobile ?? null,
    passwordHash: await hashPassword(input.password),
    roleIds: input.roleIds,
    branchAccess,
    defaultBranchId: input.defaultBranchId ?? (branchAccess.all ? null : branchAccess.branchIds[0]),
    mustChangePassword: true,
    passwordChangedAt: new Date(),
    createdBy: userId,
  });

  await recordAudit({
    action: AUDIT_ACTIONS.CREATE,
    module: 'user',
    recordType: 'User',
    recordId: user._id,
    meta: { name: user.name, email: user.email, roles: roles.map((r) => r.name), allBranches: branchAccess.all },
  });
  return getUser(user._id);
}

export async function updateUser(id, input) {
  const ctx = requireContext();
  const user = await findUser(id);
  const isSelf = String(user._id) === ctx.userId;

  const rolesChanged = JSON.stringify(user.roleIds.map(String).sort()) !== JSON.stringify([...input.roleIds].sort());
  const branchAccess = { all: input.branchAccess.all, branchIds: input.branchAccess.all ? [] : input.branchAccess.branchIds };
  const accessChanged =
    Boolean(user.branchAccess?.all) !== branchAccess.all ||
    JSON.stringify((user.branchAccess?.branchIds ?? []).map(String).sort()) !== JSON.stringify([...branchAccess.branchIds].sort());

  if ((rolesChanged || accessChanged) && user.isOwner) throw ApiError.forbidden('The owner’s roles and branch access cannot be changed', 'OWNER_PROTECTED');
  if ((rolesChanged || accessChanged) && isSelf) throw ApiError.forbidden('You cannot change your own roles or branch access', 'SELF_PROTECTED');

  if (rolesChanged) {
    const current = new Set(user.roleIds.map(String));
    const roles = await resolveRoles(input.roleIds);
    assertCanAssign(roles.filter((r) => !current.has(String(r._id))));
  }
  await assertBranches({ branchAccess, defaultBranchId: input.defaultBranchId });

  const changes = [];
  const track = (field, from, to) => {
    if (JSON.stringify(from ?? null) !== JSON.stringify(to ?? null)) changes.push({ field, from: from ?? null, to: to ?? null });
  };
  track('name', user.name, input.name);
  track('mobile', user.mobile, input.mobile ?? null);
  track('roleIds', user.roleIds.map(String).sort(), [...input.roleIds].sort());
  track('branchAccess', { all: Boolean(user.branchAccess?.all), branchIds: (user.branchAccess?.branchIds ?? []).map(String).sort() }, { all: branchAccess.all, branchIds: [...branchAccess.branchIds].sort() });
  track('defaultBranchId', user.defaultBranchId ? String(user.defaultBranchId) : null, input.defaultBranchId ?? null);
  if (!changes.length) return getUser(id);

  user.set({ name: input.name, mobile: input.mobile ?? null, roleIds: input.roleIds, branchAccess, defaultBranchId: input.defaultBranchId ?? null });
  await user.save();
  await recordAudit({ action: AUDIT_ACTIONS.UPDATE, module: 'user', recordType: 'User', recordId: user._id, changes });
  return getUser(id);
}

export async function setUserStatus(id, status) {
  const ctx = requireContext();
  const user = await findUser(id);
  if (user.status === status) return getUser(id);
  if (String(user._id) === ctx.userId) throw ApiError.forbidden('You cannot change your own status', 'SELF_PROTECTED');
  if (user.isOwner) throw ApiError.forbidden('The owner account cannot be deactivated', 'OWNER_PROTECTED');
  if (status === USER_STATUS.ACTIVE) await assertUserLimit();

  const from = user.status;
  await withTransaction(async (session) => {
    await User.updateOne({ _id: user._id }, { $set: { status } }, { session });
    if (status === USER_STATUS.DISABLED) await revokeAllSessions(user._id, 'user_disabled', session);
    await recordAudit(
      { action: AUDIT_ACTIONS.STATUS_CHANGE, module: 'user', recordType: 'User', recordId: user._id, changes: [{ field: 'status', from, to: status }] },
      { session },
    );
  });
  return getUser(id);
}

const BRANCH_LOGIN_ROLE_KEY = 'branch_manager';

/**
 * A branch's own login: one account per branch, limited to that branch, with the Branch Manager role.
 * Its email is always the branch's email; here only the password is set (first time creates the account).
 */
export async function setBranchLogin(branchId, { password }) {
  const { userId } = requireContext();
  const branch = await Branch.findById(branchId).select('code name email').lean();
  if (!branch) throw ApiError.notFound('Branch');
  if (!branch.email) {
    throw ApiError.badRequest('Add an email to this branch first. The branch signs in with it.', [{ path: 'email', message: 'Branch has no email' }], 'BRANCH_EMAIL_REQUIRED');
  }
  const passwordHash = await hashPassword(password);
  const existing = await User.findOne({ branchLoginFor: branch._id }).select('email').lean();

  if (!existing) {
    await assertEmailAvailable(branch.email);
    await assertUserLimit();
    const role = await Role.findOne({ key: BRANCH_LOGIN_ROLE_KEY }).select('_id').lean();
    if (!role) throw ApiError.conflict('The Branch Manager role is missing. Restore it under Roles first.', 'ROLE_MISSING');
    await withTransaction(async (session) => {
      const [user] = await User.create(
        [
          {
            name: `${branch.name} (branch login)`,
            email: branch.email,
            passwordHash,
            roleIds: [role._id],
            branchAccess: { all: false, branchIds: [branch._id] },
            defaultBranchId: branch._id,
            branchLoginFor: branch._id,
            passwordChangedAt: new Date(),
            createdBy: userId,
          },
        ],
        { session },
      );
      await recordAudit({ action: AUDIT_ACTIONS.CREATE, module: 'user', recordType: 'User', recordId: user._id, meta: { name: user.name, email: branch.email, branchLogin: branch.name } }, { session });
    });
    return getBranchLogin(branch._id);
  }

  await withTransaction(async (session) => {
    await User.updateOne(
      { _id: existing._id },
      { $set: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: false, failedLoginCount: 0, lockedUntil: null } },
      { session },
    );
    await revokeAllSessions(existing._id, 'branch_login_password_changed', session);
    await recordAudit({ action: AUDIT_ACTIONS.PASSWORD_RESET, module: 'user', recordType: 'User', recordId: existing._id, meta: { branchLogin: branch.name, byAdmin: true } }, { session });
  });
  return getBranchLogin(branch._id);
}

/** Keeps a branch login's email equal to the branch email when the branch is edited. */
export async function syncBranchLoginEmail(branchId, email, { session } = {}) {
  const login = await User.findOne({ branchLoginFor: branchId }).select('email').session(session ?? null).lean();
  if (!login || login.email === email) return;
  if (!email) {
    throw ApiError.badRequest('This branch signs in with its email, so it cannot be removed.', [{ path: 'email', message: 'Required while the branch has a login' }], 'VALIDATION_ERROR');
  }
  await assertEmailAvailable(email, { exceptUserId: login._id });
  await User.updateOne({ _id: login._id }, { $set: { email } }, { session });
  await revokeAllSessions(login._id, 'branch_login_email_changed', session);
}

export async function getBranchLogin(branchId) {
  const user = await User.findOne({ branchLoginFor: branchId }).select('email status lastLoginAt').lean();
  return user ? { id: user._id, email: user.email, status: user.status, lastLoginAt: user.lastLoginAt } : null;
}

/** Branch id -> its login summary, for the branches list. */
export async function branchLoginsByBranch(branchIds) {
  const users = await User.find({ branchLoginFor: { $in: branchIds } }).select('email status lastLoginAt branchLoginFor').lean();
  return new Map(users.map((u) => [String(u.branchLoginFor), { id: u._id, email: u.email, status: u.status, lastLoginAt: u.lastLoginAt }]));
}

export async function adminResetPassword(id, password) {
  const ctx = requireContext();
  const user = await findUser(id);
  if (String(user._id) === ctx.userId) throw ApiError.forbidden('Use Profile & security to change your own password', 'SELF_PROTECTED');
  if (user.isOwner) throw ApiError.forbidden('The owner’s password can only be changed by the owner', 'OWNER_PROTECTED');

  const passwordHash = await hashPassword(password);
  await withTransaction(async (session) => {
    await User.updateOne(
      { _id: user._id },
      { $set: { passwordHash, mustChangePassword: true, passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null } },
      { session },
    );
    await revokeAllSessions(user._id, 'admin_password_reset', session);
    await recordAudit({ action: AUDIT_ACTIONS.PASSWORD_RESET, module: 'user', recordType: 'User', recordId: user._id, meta: { byAdmin: true } }, { session });
  });
}
