// One-time repair: bills that sold a piece made for the same customer's open order without being linked to it.
// For each, the order is linked and delivered, its advance is taken off the bill's due, and the ledger is corrected
// (customer advances → customer's account). Bills where the advance is more than what is still due are only listed.
//
// Usage:  node --env-file=.env scripts/repair-order-links.js            (shows what would change)
//         node --env-file=.env scripts/repair-order-links.js --apply    (makes the changes)

import { ORDER_STATUS, OPEN_ORDER_STATUSES, SALE_STATUS } from '@jerp/shared';
import { connectDb, disconnectDb, withTransaction } from '../src/config/db.js';
import { AUDIT_ACTIONS, recordAudit } from '../src/core/audit/audit.service.js';
import { runWithContext } from '../src/core/context/requestContext.js';
import { postJournal } from '../src/core/ledger/posting.service.js';
import { Order } from '../src/modules/orders/order.model.js';
import { Organisation } from '../src/modules/organisations/organisation.model.js';
import { Sale } from '../src/modules/sales/sale.model.js';
import { todayContext } from '../src/utils/businessDate.js';

const apply = process.argv.includes('--apply');
const rupees = (p) => `₹${(p / 100).toLocaleString('en-IN')}`;
const creditOf = (s) => s.payments.filter((p) => p.mode === 'credit').reduce((n, p) => n + p.amountPaise, 0);

await connectDb();
let fixed = 0;
let listed = 0;

for (const org of await Organisation.find({}).select('_id name').lean()) {
  await runWithContext({ organisationId: String(org._id) }, async () => {
    const sales = await Sale.find({ status: SALE_STATUS.COMPLETED, orderId: null, customerId: { $ne: null } }).lean();
    for (const sale of sales) {
      const orders = await Order.find({ customerId: sale.customerId, status: { $in: OPEN_ORDER_STATUSES }, 'items.productId': { $in: sale.items.map((i) => i.productId) } }).lean();
      if (orders.length !== 1) continue;
      const order = orders[0];
      const advance = order.advancePaise ?? 0;
      const stillDue = creditOf(sale) - (sale.duePaidPaise ?? 0);
      const line = `${org.name}: ${sale.invoiceNo} sold a piece of ${order.orderNo} (${order.customer?.name}) — order advance ${rupees(advance)}, due on bill ${rupees(stillDue)}`;
      if (advance > stillDue) {
        console.log(`SKIP  ${line} — advance is more than the due; fix by hand (refund or customer advance).`);
        listed += 1;
        continue;
      }
      console.log(`${apply ? 'FIX ' : 'WOULD FIX'}  ${line} → due becomes ${rupees(stillDue - advance)}`);
      fixed += 1;
      if (!apply) continue;

      const today = await todayContext();
      await withTransaction(async (session) => {
        // The bill: the order's advance now pays part of it; the credit (due) line shrinks by the same amount.
        let left = advance;
        const payments = sale.payments
          .map((p) => {
            if (p.mode !== 'credit' || left <= 0) return p;
            const take = Math.min(left, p.amountPaise);
            left -= take;
            return { ...p, amountPaise: p.amountPaise - take };
          })
          .filter((p) => p.amountPaise > 0);
        await Sale.updateOne(
          { _id: sale._id },
          { $set: { orderId: order._id, orderNo: order.orderNo, advanceAdjustedPaise: (sale.advanceAdjustedPaise ?? 0) + advance, payments } },
          { session },
        );
        // The order: delivered with this bill.
        await Order.updateOne(
          { _id: order._id },
          {
            $set: { status: ORDER_STATUS.DELIVERED, saleId: sale._id, invoiceNo: sale.invoiceNo, deliveredAt: sale.createdAt },
            $push: { timeline: { status: ORDER_STATUS.DELIVERED, at: today.now, by: sale.createdBy, note: `Linked to ${sale.invoiceNo} (repair); advance adjusted` } },
          },
          { session },
        );
        // The ledger: the advance held for the order settles part of what the customer owed on the bill.
        const party = { type: 'customer', id: sale.customerId };
        await postJournal(
          {
            voucherType: 'order_advance_adjust',
            date: today.now,
            businessDate: today.businessDate,
            financialYear: today.financialYear,
            narration: `Advance of ${order.orderNo} adjusted on ${sale.invoiceNo}`,
            source: { docType: 'sale', docId: sale._id, docNo: sale.invoiceNo },
            lines: [
              { account: 'customer_advances', debit: advance, branchId: sale.branchId, party },
              { account: 'sundry_debtors', credit: advance, branchId: sale.branchId, party },
            ],
          },
          { session },
        );
        await recordAudit(
          { action: AUDIT_ACTIONS.UPDATE, module: 'sales', recordType: 'Sale', recordId: sale._id, meta: { name: sale.invoiceNo, repair: `Linked ${order.orderNo}, advance ${advance / 100} adjusted` } },
          { session, actor: { organisationId: String(org._id), userId: null } },
        );
      });
    }
  });
}

console.log(`\n${apply ? 'Fixed' : 'Would fix'}: ${fixed}${listed ? ` · needs a look: ${listed}` : ''}${apply || !fixed ? '' : '  (run again with --apply to make the changes)'}`);
await disconnectDb();
