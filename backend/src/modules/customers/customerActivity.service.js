import { hasPermission, OPEN_ORDER_STATUSES, SALE_STATUS } from '@jerp/shared';
import { requireContext } from '../../core/context/requestContext.js';
import { ApiError } from '../../utils/ApiError.js';
import { accessibleBranchFilter, nameMaps, pick } from '../inventory/inventory.helpers.js';
import { Order } from '../orders/order.model.js';
import { Product } from '../products/product.model.js';
import { Sale } from '../sales/sale.model.js';
import { Customer } from './customer.model.js';

const sum = (list, fn) => list.reduce((s, x) => s + fn(x), 0);

/**
 * Everything the customer has bought and paid, for the customer page. Sections the user may not see
 * (invoices without sales.view, orders without order.view) come back as null.
 */
export async function customerActivity(id) {
  const { permissions } = requireContext();
  const customer = await Customer.findOne({ _id: id, isDeleted: false }).select('openingBalancePaise').lean();
  if (!customer) throw ApiError.notFound('Customer');
  const canSales = hasPermission(permissions, 'sales.view');
  const canOrders = hasPermission(permissions, 'order.view');

  const [sales, orders] = await Promise.all([
    canSales ? Sale.find({ customerId: id, ...accessibleBranchFilter() }).sort({ createdAt: -1 }).lean() : [],
    canOrders ? Order.find({ customerId: id, ...accessibleBranchFilter() }).sort({ createdAt: -1 }).lean() : [],
  ]);
  const completed = sales.filter((s) => s.status === SALE_STATUS.COMPLETED);
  const productIds = completed.flatMap((s) => s.items.map((i) => i.productId));
  const [maps, products] = await Promise.all([
    nameMaps({ branchIds: [...sales, ...orders].map((d) => d.branchId) }),
    Product.find({ _id: { $in: productIds } }).select('images categoryId').lean(),
  ]);
  const imageOf = new Map(products.map((p) => [String(p._id), p.images?.[0]?.fileId ?? null]));

  const purchases = completed.flatMap((s) =>
    s.items.map((i) => ({
      saleId: s._id,
      invoiceNo: s.invoiceNo,
      at: s.createdAt,
      branch: pick(maps.branches, s.branchId),
      productId: i.productId,
      sku: i.sku,
      name: i.name,
      metal: i.metal,
      purity: i.purity,
      huid: i.huid,
      grossWeightMg: i.grossWeightMg,
      netWeightMg: i.netWeightMg,
      ratePerGramPaise: i.breakdown.ratePerGramPaise,
      discountPaise: i.breakdown.discountPaise,
      totalPaise: i.breakdown.totalPaise,
      returned: Boolean(i.returned),
      imageFileId: imageOf.get(String(i.productId)) ?? null,
    })),
  );

  // Every rupee in time order: order advances / refunds, then what was paid (or put on credit) on each bill.
  const payments = [
    ...orders.flatMap((o) =>
      o.advances.map((a) => ({
        at: a.at,
        kind: a.amountPaise < 0 ? 'refund' : 'advance',
        mode: a.mode,
        amountPaise: a.amountPaise,
        docNo: a.receiptNo,
        ref: { type: 'order', id: o._id, no: o.orderNo },
        reference: a.reference,
      })),
    ),
    ...completed.flatMap((s) =>
      s.payments.map((p) => ({
        at: s.createdAt,
        kind: p.mode === 'credit' ? 'credit' : 'payment',
        mode: p.mode,
        amountPaise: p.amountPaise,
        docNo: s.invoiceNo,
        ref: { type: 'sale', id: s._id, no: s.invoiceNo },
        reference: p.reference,
      })),
    ),
  ].sort((a, b) => new Date(b.at) - new Date(a.at));

  const openOrders = orders.filter((o) => OPEN_ORDER_STATUSES.includes(o.status));
  const creditDue = sum(payments.filter((p) => p.kind === 'credit'), (p) => p.amountPaise);
  const openingDue = Math.max(0, customer.openingBalancePaise ?? 0);

  return {
    stats: {
      purchasesPaise: canSales ? sum(completed, (s) => s.totals.grandTotalPaise) : null,
      bills: canSales ? completed.length : null,
      items: canSales ? purchases.filter((p) => !p.returned).length : null,
      grossWeightMg: canSales ? sum(purchases.filter((p) => !p.returned), (p) => p.grossWeightMg ?? 0) : null,
      paidPaise: sum(payments.filter((p) => p.kind === 'payment' || p.kind === 'advance' || p.kind === 'refund'), (p) => p.amountPaise),
      duePaise: creditDue + openingDue,
      creditDuePaise: creditDue,
      openingDuePaise: openingDue,
      openOrders: canOrders ? openOrders.length : null,
      advanceHeldPaise: canOrders ? sum(openOrders, (o) => o.advancePaise) : null,
      lastPurchaseAt: completed[0]?.createdAt ?? null,
    },
    purchases: canSales ? purchases : null,
    invoices: canSales
      ? sales.map((s) => ({
          id: s._id,
          invoiceNo: s.invoiceNo,
          at: s.createdAt,
          status: s.status,
          branch: pick(maps.branches, s.branchId),
          itemCount: s.items.length,
          grandTotalPaise: s.totals.grandTotalPaise,
          duePaise: sum(s.payments.filter((p) => p.mode === 'credit'), (p) => p.amountPaise),
          orderNo: s.orderNo ?? null,
        }))
      : null,
    orders: canOrders
      ? orders.map((o) => ({
          id: o._id,
          orderNo: o.orderNo,
          at: o.createdAt,
          status: o.status,
          summary: o.items.map((i) => i.description).join(', '),
          estimatedPaise: o.estimatedPaise,
          advancePaise: o.advancePaise,
          expectedDate: o.expectedDate,
          invoiceNo: o.invoiceNo,
        }))
      : null,
    payments,
  };
}
