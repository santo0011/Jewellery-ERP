import { supplierSchema } from '@jerp/shared/schemas';
import { sameValues, undoCreate, undoDelete, undoEdit, undoStatus } from '../undo/undo.helpers.js';
import { Supplier } from './supplier.model.js';
import { hasTransactions, setSupplierStatus, supplierFormValues, updateSupplier } from './supplier.service.js';

const statusOf = async (id) => (await Supplier.findOne({ _id: id, isDeleted: false }).select('status').lean())?.status ?? null;

export const supplierUndoHandlers = [
  undoCreate({ type: 'supplier.create', title: 'Supplier added', deleteType: 'supplier', permission: 'supplier.delete', exists: (id) => Supplier.exists({ _id: id, isDeleted: false }) }),
  undoEdit({
    type: 'supplier.update',
    title: 'Supplier edited',
    permission: 'supplier.edit',
    schema: supplierSchema,
    load: supplierFormValues,
    apply: updateSupplier,
    // The old balance is part of the books from the first purchase or payment on (the edit form locks it too).
    guard: async (entry) =>
      !sameValues(entry.data.before.openingBalancePaise, entry.data.after.openingBalancePaise) && (await hasTransactions(entry.recordId))
        ? 'The old balance was changed, and there are purchases or payments with this supplier since — it can no longer be changed back.'
        : null,
  }),
  undoStatus({ type: 'supplier.status', title: 'Supplier activated / deactivated', permission: 'supplier.edit', status: statusOf, apply: setSupplierStatus }),
  undoDelete({
    type: 'supplier.delete',
    title: 'Supplier deleted',
    permission: 'supplier.delete',
    model: Supplier,
    soft: true,
    clash: async (doc) => (doc.gstin && (await Supplier.exists({ _id: { $ne: doc._id }, gstin: doc.gstin, isDeleted: false })) ? `Another supplier now has the GSTIN ${doc.gstin}.` : null),
  }),
];
