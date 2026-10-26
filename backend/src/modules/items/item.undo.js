import { itemSchema } from '@jerp/shared/schemas';
import { undoCreate, undoDelete, undoEdit, undoStatus } from '../undo/undo.helpers.js';
import { Item } from './item.model.js';
import { setItemStatus, updateItem } from './item.service.js';

export const itemUndoHandlers = [
  undoCreate({ type: 'item.create', title: 'Item added', deleteType: 'item', permission: 'purchase.edit', exists: (id) => Item.exists({ _id: id }) }),
  undoEdit({ type: 'item.update', title: 'Item edited', permission: 'purchase.create', schema: itemSchema, load: (id) => Item.findById(id).lean(), apply: updateItem }),
  undoStatus({ type: 'item.status', title: 'Item activated / deactivated', permission: 'purchase.create', status: async (id) => (await Item.findById(id).select('status').lean())?.status ?? null, apply: (id, status) => setItemStatus(id, { status }) }),
  undoDelete({
    type: 'item.delete',
    title: 'Item deleted',
    permission: 'purchase.edit',
    model: Item,
    clash: async (doc) => ((await Item.exists({ $or: [{ code: doc.code }, { nameKey: doc.nameKey, metal: doc.metal, purity: doc.purity }] })) ? `Another item now has the code ${doc.code} or the same name, metal and purity.` : null),
  }),
];
