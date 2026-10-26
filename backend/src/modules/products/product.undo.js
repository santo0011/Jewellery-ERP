import { PRODUCT_STATUS } from '@jerp/shared';
import { productSchema } from '@jerp/shared/schemas';
import { sameValues, undoCreate, undoDelete, undoEdit } from '../undo/undo.helpers.js';
import { Product } from './product.model.js';
import { productFormValues, setProductHuid, stockIdentity, updateProduct } from './product.service.js';

const live = (id) => Product.findOne({ _id: id, isDeleted: false }).lean();

export const productUndoHandlers = [
  // Only a draft can be deleted: once it is in stock it leaves through a sale, return or adjustment (undo those instead).
  undoCreate({ type: 'product.create', title: 'Product added', deleteType: 'product', permission: 'product.delete', exists: (id) => Product.exists({ _id: id, isDeleted: false }) }),
  undoEdit({
    type: 'product.update',
    title: 'Product edited',
    permission: 'product.edit',
    schema: productSchema,
    load: async (id) => productFormValues(await live(id)),
    apply: updateProduct,
    // In stock, its weight, metal, purity and branch change only through stock adjustments and transfers.
    guard: async (entry) => {
      const p = await live(entry.recordId);
      if (!p || p.status === PRODUCT_STATUS.DRAFT) return null;
      return sameValues(stockIdentity(entry.data.before), stockIdentity(entry.data.after)) ? null : 'The edit changed its weight, metal, purity or branch, and it is in stock now — use a stock adjustment instead.';
    },
  }),
  {
    type: 'product.huid',
    title: 'HUID set',
    mode: 'undo',
    permission: 'product.edit',
    async check(entry) {
      const p = await live(entry.recordId);
      if (!p) return { superseded: true, reason: 'It was deleted' };
      if (p.status === PRODUCT_STATUS.SOLD) return { ok: false, reason: `${p.sku} is sold — its HUID is on the invoice.` };
      if ((p.huid ?? null) !== (entry.data.to ?? null)) return { ok: false, reason: 'Its HUID was changed again since.' };
      return { ok: true, effect: entry.data.from ? `Sets the HUID back to ${entry.data.from}.` : 'Clears the HUID again.' };
    },
    run: (entry) => setProductHuid(entry.recordId, entry.data.from ?? null),
  },
  undoDelete({
    type: 'product.delete',
    title: 'Product deleted',
    permission: 'product.delete',
    model: Product,
    soft: true,
    // Its photos were deleted with it.
    restoreSet: { images: [] },
    clash: async (doc) => (doc.huid && (await Product.exists({ _id: { $ne: doc._id }, huid: doc.huid, isDeleted: false })) ? `HUID ${doc.huid} is on another product now.` : null),
  }),
];
