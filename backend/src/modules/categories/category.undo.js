import { categorySchema } from '@jerp/shared/schemas';
import { undoCreate, undoDelete, undoEdit } from '../undo/undo.helpers.js';
import { Category } from './category.model.js';
import { updateCategory } from './category.service.js';

export const categoryUndoHandlers = [
  undoCreate({ type: 'category.create', title: 'Category added', deleteType: 'category', permission: 'category.delete', exists: (id) => Category.exists({ _id: id }) }),
  undoEdit({ type: 'category.update', title: 'Category edited', permission: 'category.edit', schema: categorySchema, load: (id) => Category.findById(id).lean(), apply: updateCategory }),
  undoDelete({
    type: 'category.delete',
    title: 'Category deleted',
    permission: 'category.create',
    model: Category,
    clash: async (doc) => {
      if (doc.parentId && !(await Category.exists({ _id: doc.parentId }))) return 'The category it was under has been deleted since.';
      return (await Category.exists({ name: doc.name, parentId: doc.parentId ?? null })) ? `Another category is now called ${doc.name}.` : null;
    },
  }),
];
