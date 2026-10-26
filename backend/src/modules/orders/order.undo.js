import { OPEN_ORDER_STATUSES } from '@jerp/shared';
import { metalShortfall, sameValues } from '../undo/undo.helpers.js';
import { Order } from './order.model.js';
import { cancelOrder, customerGoldBalance, EDITABLE_ORDER_STATUSES, orderFormValues, refundAdvanceReceipt, removeCustomerMetal, setOrderStatus, updateOrder } from './order.service.js';

const inr = (p) => `₹${(p / 100).toLocaleString('en-IN')}`;
const open = (o) => o && OPEN_ORDER_STATUSES.includes(o.status);
/** The way the advance was paid (refunds go back the same way); gold entries are not money. */
const moneyMode = (o) => o.advances.find((a) => a.amountPaise > 0 && a.mode !== 'gold' && a.mode !== 'customer_advance')?.mode ?? 'cash';
const customerGoldLines = (o) => customerGoldBalance(o).filter((r) => r.leftMg > 0).map((r) => ({ metal: r.metal, purity: r.purity, kind: 'customer_gold', grossWeightMg: r.leftMg }));

export const orderUndoHandlers = [
  {
    // Cancelled, not deleted: the advance is refunded the way it was paid and the customer's gold goes back.
    type: 'order.create',
    title: 'Order booked',
    mode: 'reversal',
    permission: 'order.cancel',
    async check(entry) {
      const o = await Order.findById(entry.recordId).lean();
      if (!open(o)) return { superseded: true, reason: o ? `The order is ${o.status} now` : 'The order was deleted' };
      const made = o.items.filter((i) => i.productId);
      if (made.length) return { ok: false, reason: `${made.length} piece${made.length === 1 ? ' was' : 's were'} already made for it — cancel the order from its page instead.` };
      const short = await metalShortfall(o.branchId, customerGoldLines(o));
      if (short) return { ok: false, reason: `The customer's gold cannot be given back: ${short}` };
      const money = o.advancePaise - customerGoldBalance(o).reduce((n, r) => n + Math.max(0, r.leftPaise), 0) - (o.customerAdvanceUsedPaise ?? 0);
      return { ok: true, effect: `Cancels order ${o.orderNo}${money > 0 ? `: the advance of ${inr(money)} is refunded by ${moneyMode(o)}` : ''}${customerGoldLines(o).length ? ', and the customer’s gold is given back' : ''}.` };
    },
    run: async (entry, { reason }) => {
      const o = await Order.findById(entry.recordId).lean();
      await cancelOrder(entry.recordId, { reason, refundMode: moneyMode(o) });
    },
  },
  {
    type: 'order.update',
    title: 'Order edited',
    mode: 'undo',
    permission: 'order.edit',
    async check(entry) {
      const o = await Order.findById(entry.recordId);
      if (!o) return { superseded: true, reason: 'The order was deleted' };
      if (!EDITABLE_ORDER_STATUSES.includes(o.status)) return { ok: false, reason: `The order is ${o.status.replace('_', ' ')} now and can no longer be edited.` };
      if (!sameValues(orderFormValues(o), entry.data.after)) return { ok: false, reason: 'It was edited again since.' };
      const finishedLast = o.items.reduce((last, i, n) => (i.productId ? n : last), -1);
      if (entry.data.before.items.length <= finishedLast) return { ok: false, reason: 'A piece was finished on an item the edit added — it cannot be removed.' };
      return { ok: true, effect: 'Puts the order’s items, delivery date and notes back as they were.' };
    },
    run: (entry) => updateOrder(entry.recordId, entry.data.before),
  },
  {
    type: 'order.advance',
    title: 'Order advance taken',
    mode: 'reversal',
    permission: 'order.edit',
    async check(entry) {
      const o = await Order.findById(entry.recordId).lean();
      if (!open(o)) return { ok: false, reason: o ? `The order is ${o.status} now — its advance went on the bill or was refunded.` : 'The order was deleted.' };
      if (o.advances.some((a) => a.reference === `Refund of ${entry.data.receiptNo}`)) return { superseded: true, reason: 'Already refunded' };
      if (o.advancePaise < entry.data.amountPaise) return { ok: false, reason: 'Part of the advance was already used.' };
      const paid = o.advances.find((a) => a.receiptNo === entry.data.receiptNo);
      return { ok: true, effect: `Refunds advance ${entry.data.receiptNo} (${inr(entry.data.amountPaise)}) by ${paid?.mode ?? 'the same mode'}; both receipts stay on the order.` };
    },
    run: (entry, { reason }) => refundAdvanceReceipt(entry.recordId, entry.data.receiptNo, reason),
  },
  {
    type: 'order.status',
    title: 'Order status changed',
    mode: 'undo',
    permission: 'order.edit',
    async check(entry) {
      const o = await Order.findById(entry.recordId).lean();
      if (!open(o)) return { ok: false, reason: o ? `The order is ${o.status} now.` : 'The order was deleted.' };
      if (o.status === entry.data.from) return { superseded: true, reason: 'Its status is already back' };
      if (o.status !== entry.data.to) return { ok: false, reason: 'Its status was changed again since.' };
      return { ok: true, effect: `Sets the order back to ${entry.data.from.replace('_', ' ')}.` };
    },
    run: (entry, { reason }) => setOrderStatus(entry.recordId, { status: entry.data.from, note: `Undo: ${reason}` }),
  },
  {
    type: 'order.customerMetal',
    title: 'Customer gold received for an order',
    mode: 'reversal',
    permission: 'order.edit',
    async check(entry) {
      const o = await Order.findById(entry.recordId).lean();
      if (!open(o)) return { ok: false, reason: o ? `The order is ${o.status} now.` : 'The order was deleted.' };
      const lines = (o.customerMetal ?? []).filter((l) => entry.data.lineIds.includes(String(l._id)));
      if (!lines.length || lines.every((l) => l.returnedAt)) return { superseded: true, reason: 'Already given back' };
      const left = customerGoldBalance(o);
      for (const l of lines) {
        const row = left.find((r) => r.metal === l.metal && r.purity === l.purity);
        if (!row || row.leftMg < l.netWeightMg) return { ok: false, reason: 'Part of this gold already went into a finished piece.' };
      }
      return { ok: true, effect: 'Gives this gold back to the customer (it leaves Raw materials and the credit for it is taken off the order).' };
    },
    run: async (entry) => {
      for (const lineId of entry.data.lineIds) await removeCustomerMetal(entry.recordId, lineId);
    },
  },
];
