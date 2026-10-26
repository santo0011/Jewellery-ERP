import { requireContext } from '../../core/context/requestContext.js';
import { todayContext } from '../../utils/businessDate.js';
import { Purchase, PurchaseOrder } from './purchase.model.js';
import { cancelPurchase, cancelPurchaseOrder, purchaseCancelBlock, reversePurchasePayment } from './purchase.service.js';

const inr = (p) => `₹${(p / 100).toLocaleString('en-IN')}`;
const sameTime = (a, b) => new Date(a).getTime() === new Date(b).getTime();

export const purchaseUndoHandlers = [
  {
    // Cancelled, not deleted (see cancelPurchase): stock, metal and ledger reversed; the bill stays, marked cancelled.
    type: 'purchase.create',
    title: 'Purchase bill entered',
    mode: 'reversal',
    permission: 'purchase.cancel',
    async check(entry) {
      const p = await Purchase.findById(entry.recordId).lean();
      if (!p || p.status === 'cancelled') return { superseded: true, reason: 'Already cancelled' };
      const block = await purchaseCancelBlock(p);
      if (block) return { ok: false, reason: block };
      const paidNow = p.payments.find((x) => x.amountPaise > 0)?.amountPaise ?? 0;
      return {
        ok: true,
        effect: `Cancels ${p.purchaseNo} (bill ${p.billNo}): ${p.items.length ? `${p.items.length} piece${p.items.length === 1 ? '' : 's'} leave stock, ` : ''}${p.metalLines.length ? 'its metal leaves Raw materials, ' : ''}its ledger entries are reversed${paidNow ? ` (the ${inr(paidNow)} paid comes back)` : ''}${p.orderId ? ` and order ${p.orderNo} is open again` : ''}.`,
      };
    },
    run: async (entry, { reason }) => {
      const p = await cancelPurchase(entry.recordId, reason);
      return { purchaseNo: p.purchaseNo, status: p.status };
    },
  },
  {
    type: 'purchase.payment',
    title: 'Supplier bill paid',
    mode: 'reversal',
    permission: 'purchase.edit',
    async check(entry) {
      const p = await Purchase.findById(entry.recordId).lean();
      if (!p || p.status === 'cancelled') return { superseded: true, reason: 'The bill was cancelled' };
      if (p.payments.some((r) => r.reversalOf && sameTime(r.reversalOf, entry.data.at))) return { superseded: true, reason: 'Already taken back' };
      if (!entry.data.journalId) return { ok: false, reason: 'This payment was recorded before Undo kept its entry.' };
      return { ok: true, effect: `Takes back the payment of ${inr(entry.data.amountPaise)} on ${p.purchaseNo}: its entry is reversed and the bill shows it as unpaid again.` };
    },
    run: (entry, { reason }) => reversePurchasePayment(entry.recordId, entry.data, reason),
  },
  {
    type: 'purchaseOrder.create',
    title: 'Purchase order placed',
    mode: 'reversal',
    permission: 'purchase.cancel',
    async check(entry) {
      const o = await PurchaseOrder.findById(entry.recordId).lean();
      if (!o || o.status === 'cancelled') return { superseded: true, reason: 'Already cancelled' };
      if (o.status === 'received') return { ok: false, reason: `It was received on ${o.purchaseNo} — undo that bill first.` };
      return { ok: true, effect: `Cancels purchase order ${o.orderNo} (it stays on record, cancelled).` };
    },
    run: (entry, { reason }) => cancelPurchaseOrder(entry.recordId, { reason }),
  },
  {
    type: 'purchaseOrder.cancel',
    title: 'Purchase order cancelled',
    mode: 'undo',
    permission: 'purchase.cancel',
    async check(entry) {
      const o = await PurchaseOrder.findById(entry.recordId).lean();
      if (!o) return { superseded: true, reason: 'The order was deleted' };
      if (o.status !== 'cancelled') return { superseded: true, reason: 'It is open again' };
      return { ok: true, effect: `Opens purchase order ${o.orderNo} again.` };
    },
    run: async (entry, { reason }) => {
      const today = await todayContext();
      await PurchaseOrder.updateOne({ _id: entry.recordId, status: 'cancelled' }, { $set: { status: 'open' }, $push: { timeline: { status: 'open', at: today.now, by: requireContext().userId, note: `Cancel undone: ${reason}` } } });
    },
  },
];
