import { customerSchema } from '@jerp/shared/schemas';
import { undoCreate, undoDelete, undoEdit, undoStatus } from '../undo/undo.helpers.js';
import { Customer } from './customer.model.js';
import { customerFormValues, setCustomerStatus, updateCustomer } from './customer.service.js';

const statusOf = async (id) => (await Customer.findOne({ _id: id, isDeleted: false }).select('status').lean())?.status ?? null;

export const customerUndoHandlers = [
  undoCreate({ type: 'customer.create', title: 'Customer added', deleteType: 'customer', permission: 'customer.delete', exists: (id) => Customer.exists({ _id: id, isDeleted: false }) }),
  // An edit of the opening balance / advance moved money (receipts, refunds, ledger): not put back automatically.
  undoEdit({ type: 'customer.update', title: 'Customer edited', permission: 'customer.edit', schema: customerSchema, load: customerFormValues, apply: updateCustomer, moneyFields: ['openingBalancePaise'] }),
  undoStatus({ type: 'customer.status', title: 'Customer activated / deactivated', permission: 'customer.edit', status: statusOf, apply: setCustomerStatus }),
  undoDelete({
    type: 'customer.delete',
    title: 'Customer deleted',
    permission: 'customer.delete',
    model: Customer,
    soft: true,
    clash: async (doc) => ((await Customer.exists({ _id: { $ne: doc._id }, mobile: doc.mobile, isDeleted: false })) ? `Another customer now has the mobile ${doc.mobile}.` : null),
  }),
];
