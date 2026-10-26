import { branchUndoHandlers } from '../branches/branch.undo.js';
import { categoryUndoHandlers } from '../categories/category.undo.js';
import { customerReceiptUndoHandlers } from '../customers/customerReceipt.undo.js';
import { customerUndoHandlers } from '../customers/customer.undo.js';
import { expenseUndoHandlers } from '../expenses/expense.undo.js';
import { hrUndoHandlers } from '../hr/hr.undo.js';
import { inventoryUndoHandlers } from '../inventory/inventory.undo.js';
import { itemUndoHandlers } from '../items/item.undo.js';
import { oldGoldUndoHandlers } from '../oldgold/oldGold.undo.js';
import { orderUndoHandlers } from '../orders/order.undo.js';
import { organisationUndoHandlers } from '../organisations/organisation.undo.js';
import { productUndoHandlers } from '../products/product.undo.js';
import { purchaseUndoHandlers } from '../purchases/purchase.undo.js';
import { rateUndoHandlers } from '../rates/rate.undo.js';
import { roleUndoHandlers } from '../roles/role.undo.js';
import { saleUndoHandlers } from '../sales/sale.undo.js';
import { settingsUndoHandlers } from '../settings/settings.undo.js';
import { supplierPaymentUndoHandlers } from '../suppliers/supplierPayment.undo.js';
import { supplierUndoHandlers } from '../suppliers/supplier.undo.js';
import { userUndoHandlers } from '../users/user.undo.js';

/*
 * Every kind of action Undo can take back, by type. Each module keeps its own handlers next to its service
 * (<module>.undo.js); an action is put on an Undo stack only where its service passes `undo` to recordAudit.
 * docs/undo.md lists them all, and what undoing each one does.
 */
const HANDLERS = new Map(
  [
    branchUndoHandlers,
    categoryUndoHandlers,
    customerReceiptUndoHandlers,
    customerUndoHandlers,
    expenseUndoHandlers,
    hrUndoHandlers,
    inventoryUndoHandlers,
    itemUndoHandlers,
    oldGoldUndoHandlers,
    orderUndoHandlers,
    organisationUndoHandlers,
    productUndoHandlers,
    purchaseUndoHandlers,
    rateUndoHandlers,
    roleUndoHandlers,
    saleUndoHandlers,
    settingsUndoHandlers,
    supplierPaymentUndoHandlers,
    supplierUndoHandlers,
    userUndoHandlers,
  ]
    .flat()
    .map((h) => [h.type, h]),
);

export const handlerFor = (type) => HANDLERS.get(type) ?? null;
export const allHandlers = () => [...HANDLERS.values()];
