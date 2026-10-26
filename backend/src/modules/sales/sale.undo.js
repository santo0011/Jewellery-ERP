import { SALE_STATUS } from '@jerp/shared';
import { OldGold } from '../oldgold/oldGold.model.js';
import { metalShortfall } from '../undo/undo.helpers.js';
import { Sale } from './sale.model.js';
import { cancelSale } from './sale.service.js';

const oldGoldLines = (og) => (og?.lines ?? []).map((l) => ({ metal: l.metal, purity: l.purity, kind: 'old_gold', grossWeightMg: l.netWeightMg }));

export const saleUndoHandlers = [
  {
    // An invoice is never deleted: it is cancelled — pieces back in stock, its ledger entries reversed (the money
    // paid on it goes back out of cash / bank), old gold taken in exchange back to the customer, an order back to ready.
    type: 'sale.create',
    title: 'Invoice made',
    mode: 'reversal',
    permission: 'sales.cancel',
    async check(entry) {
      const sale = await Sale.findById(entry.recordId).lean();
      if (!sale || sale.status !== SALE_STATUS.COMPLETED) return { superseded: true, reason: 'The invoice is already cancelled' };
      if (sale.duePaidPaise > 0) return { ok: false, reason: 'A due payment was collected on this invoice since — take that payment back first, or return the items instead.' };
      if (sale.items.some((i) => i.returned)) return { ok: false, reason: 'Items on this invoice were returned since, so it cannot be cancelled. Return the rest instead.' };
      if (sale.oldGoldPaise) {
        const og = await OldGold.findOne({ saleId: sale._id, status: 'completed' }).lean();
        const short = og && (await metalShortfall(sale.branchId, oldGoldLines(og)));
        if (short) return { ok: false, reason: `The old gold taken on this invoice cannot go back: ${short}` };
      }
      const n = sale.items.length;
      return { ok: true, effect: `Cancels invoice ${sale.invoiceNo}: ${n} piece${n === 1 ? '' : 's'} back in stock, its ledger entries reversed (payments on it are paid back)${sale.oldGoldPaise ? ', the old gold back to the customer' : ''}${sale.orderId ? ', the order back to ready' : ''}.` };
    },
    run: async (entry, { reason }) => {
      const sale = await cancelSale(entry.recordId, reason);
      return { invoiceNo: sale.invoiceNo, status: sale.status };
    },
  },
];
