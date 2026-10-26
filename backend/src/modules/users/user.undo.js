import { updateUserSchema } from '@jerp/shared/schemas';
import { undoCreate, undoDelete, undoEdit, undoStatus } from '../undo/undo.helpers.js';
import { User } from './user.model.js';
import { setUserStatus, updateUser } from './user.service.js';

// The edit form's values (same shape the user service keeps for Undo).
const formValues = (u) => ({ name: u.name, mobile: u.mobile ?? null, roleIds: u.roleIds.map(String), branchAccess: { all: Boolean(u.branchAccess?.all), branchIds: (u.branchAccess?.branchIds ?? []).map(String) }, defaultBranchId: u.defaultBranchId ? String(u.defaultBranchId) : null });

export const userUndoHandlers = [
  undoCreate({ type: 'user.create', title: 'User added', deleteType: 'user', permission: 'user.delete', exists: (id) => User.exists({ _id: id }) }),
  undoEdit({
    type: 'user.update',
    title: 'User edited',
    permission: 'user.edit',
    schema: updateUserSchema,
    load: async (id) => {
      const u = await User.findById(id).lean();
      return u ? formValues(u) : null;
    },
    apply: updateUser,
  }),
  undoStatus({ type: 'user.status', title: 'User activated / deactivated', permission: 'user.edit', status: async (id) => (await User.findById(id).select('status').lean())?.status ?? null, apply: setUserStatus }),
  undoDelete({
    type: 'user.delete',
    title: 'User deleted',
    permission: 'user.create',
    model: User,
    // Emails are unique across every organisation.
    clash: async (doc) => ((await User.exists({ email: doc.email }).setOptions({ skipTenant: true })) ? `The email ${doc.email} is in use by another login now.` : null),
  }),
];
