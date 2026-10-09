import mongoose from 'mongoose';
import { expandPermissions, hasPermission } from '@jerp/shared';
import { AUDIT_ACTIONS, recordAudit } from '../../core/audit/audit.service.js';
import { requireContext } from '../../core/context/requestContext.js';
import { ApiError } from '../../utils/ApiError.js';
import { randomToken } from '../../utils/crypto.js';
import { User } from '../users/user.model.js';
import { Role } from './role.model.js';

const serialize = (role, userCount = 0) => ({
  id: role._id,
  key: role.key,
  name: role.name,
  description: role.description,
  isSystem: role.isSystem,
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
  await recordAudit({ action: AUDIT_ACTIONS.CREATE, module: 'role', recordType: 'Role', recordId: role._id, meta: { name, permissions } });
  return serialize(role.toObject());
}

export async function updateRole(id, { name, description, permissions }) {
  const { userId } = requireContext();
  const role = await findRole(id);
  if (role.isSystem) throw ApiError.forbidden('System roles cannot be modified. Duplicate the role to customise it.', 'SYSTEM_ROLE');

  const added = permissions.filter((p) => !role.permissions.includes(p));
  const removed = role.permissions.filter((p) => !permissions.includes(p));
  assertCanGrant(added);

  const changes = [];
  if (role.name !== name) changes.push({ field: 'name', from: role.name, to: name });
  if ((role.description ?? null) !== (description ?? null)) changes.push({ field: 'description', from: role.description, to: description ?? null });
  if (added.length || removed.length) changes.push({ field: 'permissions', from: { removed }, to: { added } });
  if (!changes.length) return getRole(id);

  role.set({ name, description: description ?? null, permissions, updatedBy: userId });
  await role.save();
  await recordAudit({ action: AUDIT_ACTIONS.UPDATE, module: 'role', recordType: 'Role', recordId: role._id, changes });
  return getRole(id);
}

export async function duplicateRole(id) {
  const source = await findRole(id);
  const permissions = expandPermissions(source.permissions);
  let name = `${source.name} (copy)`;
  for (let i = 2; await Role.exists({ name }).collation({ locale: 'en', strength: 2 }); i += 1) name = `${source.name} (copy ${i})`;
  return createRole({ name, description: source.description, permissions });
}

export async function deleteRole(id) {
  const role = await findRole(id);
  if (role.isSystem) throw ApiError.forbidden('System roles cannot be deleted', 'SYSTEM_ROLE');
  const assigned = await User.countDocuments({ roleIds: new mongoose.Types.ObjectId(String(id)) });
  if (assigned > 0) {
    throw ApiError.conflict(`This role is assigned to ${assigned} user${assigned === 1 ? '' : 's'}. Reassign them first.`, 'ROLE_IN_USE');
  }
  await role.deleteOne();
  await recordAudit({ action: AUDIT_ACTIONS.DELETE, module: 'role', recordType: 'Role', recordId: role._id, meta: { name: role.name } });
}
