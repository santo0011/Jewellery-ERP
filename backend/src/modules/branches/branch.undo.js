import { branchSchema } from '@jerp/shared/schemas';
import { undoCreate, undoEdit, undoStatus } from '../undo/undo.helpers.js';
import { Branch } from './branch.model.js';
import { setBranchStatus, updateBranch } from './branch.service.js';

// A deleted branch is not brought back (its delete also took it out of users' access): add it again instead.
export const branchUndoHandlers = [
  undoCreate({ type: 'branch.create', title: 'Branch added', deleteType: 'branch', permission: 'branch.delete', exists: (id) => Branch.exists({ _id: id }) }),
  undoEdit({ type: 'branch.update', title: 'Branch edited', permission: 'branch.edit', schema: branchSchema, load: (id) => Branch.findById(id).lean(), apply: updateBranch }),
  undoStatus({ type: 'branch.status', title: 'Branch activated / deactivated', permission: 'branch.edit', status: async (id) => (await Branch.findById(id).select('status').lean())?.status ?? null, apply: setBranchStatus }),
];
