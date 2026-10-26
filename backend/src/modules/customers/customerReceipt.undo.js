import { SALE_STATUS } from '@jerp/shared';
import { Sale } from '../sales/sale.model.js';
import { CustomerReceipt } from './customerReceipt.model.js';
import { voidReceipt } from './customerReceipt.service.js';

const inr = (p) => `₹${(p / 100).toLocaleString('en-IN')}`;

export const customerReceiptUndoHandlers = [
  {
    // Void, not deleted: what it paid off is owed again and its entry is reversed (the money goes back out).
    type: 'customerReceipt.create',
    title: 'Due payment received',
    mode: 'reversal',
    permission: 'accounts.receipt',
    async check(entry) {
      const r = await CustomerReceipt.findById(entry.recordId).lean();
      if (!r || r.status === 'void') return { superseded: true, reason: 'Already taken back' };
      const saleIds = r.allocations.filter((a) => a.saleId).map((a) => a.saleId);
      const gone = saleIds.length ? await Sale.find({ _id: { $in: saleIds }, status: { $ne: SALE_STATUS.COMPLETED } }).select('invoiceNo').lean() : [];
      if (gone.length) return { ok: false, reason: `${gone.map((s) => s.invoiceNo).join(', ')} ${gone.length === 1 ? 'was' : 'were'} cancelled since.` };
      return { ok: true, effect: `Takes back receipt ${r.receiptNo} (${inr(r.amountPaise)}): ${r.allocations.map((a) => a.invoiceNo ?? 'the old due').join(', ')} owed again, and the money goes back out of ${r.mode === 'cash' ? 'cash' : 'the bank'}.` };
    },
    run: (entry, { reason }) => voidReceipt(entry.recordId, reason),
  },
];
