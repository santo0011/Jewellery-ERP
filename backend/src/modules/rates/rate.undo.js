import { SALE_STATUS } from '@jerp/shared';
import { Sale } from '../sales/sale.model.js';
import { MetalRate } from './rate.model.js';
import { withdrawRates } from './rate.service.js';

export const rateUndoHandlers = [
  {
    // The rates are withdrawn, not deleted: they stay in the rate history, marked, and prices use the ones before.
    type: 'rate.set',
    title: 'Metal rates updated',
    mode: 'undo',
    permission: 'rate.create',
    async check(entry) {
      const live = await MetalRate.countDocuments({ _id: { $in: entry.data.rateIds }, withdrawnAt: null });
      if (!live) return { superseded: true, reason: 'Already withdrawn' };
      // Invoices are priced at the day's rates: once a bill used them they stay (enter the right rates instead).
      const billed = await Sale.findOne({ createdAt: { $gte: new Date(entry.data.at) }, status: SALE_STATUS.COMPLETED }).select('invoiceNo').lean();
      if (billed) return { ok: false, reason: `Invoice ${billed.invoiceNo} was made at these rates — enter the correct rates instead.` };
      return { ok: true, effect: `Withdraws these ${live} rate${live === 1 ? '' : 's'}: prices go back to the rates before them (they stay in the rate history, marked withdrawn).` };
    },
    run: (entry, { reason }) => withdrawRates(entry.data.rateIds, reason),
  },
];
