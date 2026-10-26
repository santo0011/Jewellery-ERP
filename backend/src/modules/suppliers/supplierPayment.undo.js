import { Purchase } from '../purchases/purchase.model.js';
import { SupplierPayment } from './supplierPayment.model.js';
import { voidSupplierPayment } from './supplierPayment.service.js';

const inr = (p) => `₹${(p / 100).toLocaleString('en-IN')}`;

export const supplierPaymentUndoHandlers = [
  {
    // Void, not deleted: the bills and old balance it paid are owed again and its entry is reversed.
    type: 'supplierPayment.create',
    title: 'Supplier paid',
    mode: 'reversal',
    permission: ['supplier.view', 'purchase.edit'],
    async check(entry) {
      const p = await SupplierPayment.findById(entry.recordId).lean();
      if (!p || p.status === 'void') return { superseded: true, reason: 'Already taken back' };
      const billIds = p.allocations.filter((a) => a.purchaseId).map((a) => a.purchaseId);
      const cancelled = billIds.length ? await Purchase.find({ _id: { $in: billIds }, status: 'cancelled' }).select('purchaseNo').lean() : [];
      if (cancelled.length) return { ok: false, reason: `${cancelled.map((b) => b.purchaseNo).join(', ')} ${cancelled.length === 1 ? 'was' : 'were'} cancelled since.` };
      return { ok: true, effect: `Takes back payment ${p.paymentNo} (${inr(p.amountPaise)}): ${p.allocations.map((a) => a.purchaseNo ?? 'the old balance').join(', ')} owed again, and the money comes back to ${p.mode === 'cash' ? 'cash' : 'the bank'}.` };
    },
    run: (entry, { reason }) => voidSupplierPayment(entry.recordId, reason),
  },
];
