import { SALE_STATUS } from '@jerp/shared';
import { Order } from '../orders/order.model.js';
import { Sale } from '../sales/sale.model.js';

/** `mode` of an order advance entry that is advance paid before, moved onto the order (not new money). */
export const CUSTOMER_ADVANCE_MODE = 'customer_advance';

const sumOf =(list, field) => list.reduce((n, x) => n + (x[field] ?? 0), 0);

/**
 * How much of the advance paid before (a minus opening balance) is spoken for: used on bills, or moved onto orders
 * when they were booked (a cancelled order gives its share back, setting it to 0). Cancelled bills give theirs back.
 */
export async function customerAdvanceUsed(customerId, { session } = {}) {
  const [sales, orders] = await Promise.all([
    Sale.find({ customerId, status: SALE_STATUS.COMPLETED, customerAdvancePaise: { $gt: 0 } }).select('customerAdvancePaise').session(session ?? null).lean(),
    Order.find({ customerId, customerAdvanceUsedPaise: { $gt: 0 } }).select('customerAdvanceUsedPaise').session(session ?? null).lean(),
  ]);
  return sumOf(sales, 'customerAdvancePaise') + sumOf(orders, 'customerAdvanceUsedPaise');
}

/** The advance paid before that is still free to use on a bill or a new order. Below 0 only if two used it at once. */
export async function customerAdvanceLeft(customer, { session } = {}) {
  const held = Math.max(0, -(customer?.openingBalancePaise ?? 0));
  if (!held) return 0;
  return held - (await customerAdvanceUsed(customer._id, { session }));
}
