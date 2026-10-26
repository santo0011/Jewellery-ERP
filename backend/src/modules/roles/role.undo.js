import { roleSchema } from '@jerp/shared/schemas';
import { undoCreate, undoDelete, undoEdit } from '../undo/undo.helpers.js';
import { Role } from './role.model.js';
import { updateRole } from './role.service.js';

export const roleUndoHandlers = [
  undoCreate({ type: 'role.create', title: 'Role added', deleteType: 'role', permission: 'role.delete', exists: (id) => Role.exists({ _id: id }) }),
  undoEdit({ type: 'role.update', title: 'Role edited', permission: 'role.edit', schema: roleSchema, load: (id) => Role.findById(id).lean(), apply: updateRole }),
  undoDelete({
    type: 'role.delete',
    title: 'Role deleted',
    permission: 'role.create',
    model: Role,
    clash: async (doc) => ((await Role.exists({ name: doc.name }).collation({ locale: 'en', strength: 2 })) ? `Another role is now called ${doc.name}.` : null),
  }),
];
