import mongoose from 'mongoose';
import { expandPermissions, hasPermission, isBranchRole, isOrganisationLevel, WILDCARD_PERMISSION } from '@jerp/shared';
import { AUDIT_ACTIONS, recordAudit } from '../../core/audit/audit.service.js';
import { requireContext } from '../../core/context/requestContext.js';
import { ApiError } from '../../utils/ApiError.js';
import { deleteRecord } from '../records/record.deletion.js';
import { randomToken } from '../../utils/crypto.js';
import { User } from '../users/user.model.js';
import { Role } from './role.model.js';

const serialize = (role, userCount = 0) => ({
  id: role._id,
  key: role.key,
  name: role.name,
  description: role.description,
  isSystem: role.isSystem,
  customised: Boolean(role.customised),
  permissions: expandPermissions(role.permissions),
  fullAccess: role.permissions.includes('*'),
  userCount,
  updatedAt: role.updatedAt,
});

function assertCanGrant(permissions) {
  const { rolePermissions: granted } = requireContext();
  const denied = permissions.filter((p) => !hasPermission(granted, p));
  if (denied.length) {
    throw ApiError.forbidden(`You cannot grant permissions you do not have: ${denied.slice(0, 5).join(', ')}${denied.length > 5 ? '…' : ''}`, 'PERMISSION_ESCALATION');
  }
}

async function userCounts(roleIds) {
  const rows = await User.aggregate([
    { $match: { roleIds: { $in: roleIds } } },
    { $unwind: '$roleIds' },
    { $match: { roleIds: { $in: roleIds } } },
    { $group: { _id: '$roleIds', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.count]));
}

async function findRole(id) {
  const role = await Role.findById(id);
  if (!role) throw ApiError.notFound('Role');
  return role;
}

export async function listRoles() {
  const roles = await Role.find({}).sort({ isSystem: -1, name: 1 }).lean();
  const counts = await userCounts(roles.map((r) => r._id));
  return roles.map((r) => serialize(r, counts.get(String(r._id)) ?? 0));
}

export async function getRole(id) {
  const role = await Role.findById(id).lean();
  if (!role) throw ApiError.notFound('Role');
  const counts = await userCounts([role._id]);
  return serialize(role, counts.get(String(role._id)) ?? 0);
}

export async function createRole({ name, description, permissions }) {
  const { userId } = requireContext();
  assertCanGrant(permissions);
  const role = await Role.create({
    key: `custom_${randomToken(6).toLowerCase().replace(/[^a-z0-9]/g, 'x')}`,
    name,
    description,
    permissions,
    isSystem: false,
    createdBy: userId,
    updatedBy: userId,
  });
  await recordAudit({ action: AUDIT_ACTIONS.CREATE, module: 'role', recordType: 'Role', recordId: role._id, meta: { name, permissions }, undo: { type: 'role.create', branchId: null } });
  return serialize(role.toObject());
}

export async function updateRole(id, { name, description, permissions }) {
  const { userId } = requireContext();
  const role = await findRole(id);
  // Organisation Admin must keep full access, or the owner could lock everyone out. Other default roles can change.
  if (role.permissions.includes('*')) throw ApiError.forbidden('Organisation Admin always has full access and cannot be changed.', 'SYSTEM_ROLE');

  // A branch role (Branch Manager) never holds organisation-level permissions.
  if (isBranchRole(role.key)) {
    const orgLevel = permissions.filter((p) => p === WILDCARD_PERMISSION || isOrganisationLevel(p));
    if (orgLevel.length) {
      throw ApiError.badRequest(`${role.name} is a branch role and cannot run the organisation: remove ${orgLevel.slice(0, 3).join(', ')}${orgLevel.length > 3 ? '…' : ''}.`, [{ path: 'permissions', message: 'Organisation-level permissions are not allowed for a branch role' }], 'BRANCH_ROLE_ORG_PERMISSION');
    }
  }

  const added = permissions.filter((p) => !role.permissions.includes(p));
  const removed = role.permissions.filter((p) => !permissions.includes(p));
  assertCanGrant(added);

  const changes = [];
  if (role.name !== name) changes.push({ field: 'name', from: role.name, to: name });
  if ((role.description ?? null) !== (description ?? null)) changes.push({ field: 'description', from: role.description, to: description ?? null });
  if (added.length || removed.length) changes.push({ field: 'permissions', from: { removed }, to: { added } });
  if (!changes.length) return getRole(id);
  const before = { name: role.name, description: role.description ?? null, permissions: [...role.permissions] };

  role.set({ name, description: description ?? null, permissions, updatedBy: userId, ...(role.isSystem && { customised: true }) });
  await role.save();
  await recordAudit({ action: AUDIT_ACTIONS.UPDATE, module: 'role', recordType: 'Role', recordId: role._id, meta: { name: role.name }, changes, undo: { type: 'role.update', branchId: null, data: { before, after: { name, description: description ?? null, permissions } } } });
  return getRole(id);
}

export async function duplicateRole(id) {
  const source = await findRole(id);
  const permissions = expandPermissions(source.permissions);
  let name = `${source.name} (copy)`;
  for (let i = 2; await Role.exists({ name }).collation({ locale: 'en', strength: 2 }); i += 1) name = `${source.name} (copy ${i})`;
  return createRole({ name, description: source.description, permissions });
}

/** Deletes it if nothing uses it — the same rules as every other delete (see record.deletion.js). */
export async function deleteRole(id) {
  return deleteRecord('role', id);
}
