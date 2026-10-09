import { hasPermission, OPEN_ORDER_STATUSES, PAYMENT_MODES, SALE_STATUS } from '@jerp/shared';
import { requireContext } from '../../core/context/requestContext.js';
import { todayContext } from '../../utils/businessDate.js';
import { Category } from '../categories/category.model.js';
import { oid, requireBranch } from '../inventory/inventory.helpers.js';
import { Order } from '../orders/order.model.js';
import { Product } from '../products/product.model.js';
import { Sale } from '../sales/sale.model.js';

const sum = (list, fn) => list.reduce((s, x) => s + fn(x), 0);
/** YYYY-MM-DD arithmetic on business dates (no timezone drift: the strings are already local). */
const shiftDate = (ymd, days) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const top = (rows, n) => {
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  if (sorted.length <= n) return sorted;
  const rest = sorted.slice(n - 1);
  return [...sorted.slice(0, n - 1), { key: 'other', label: 'Other', value: sum(rest, (r) => r.value), extra: sum(rest, (r) => r.extra ?? 0) }];
};

/** The branch at a glance for the chosen period: sales trend and mix, collections, orders and stock. */
export async function branchDashboard({ branchId, days }) {
  const { permissions } = requireContext();
  const branch = await requireBranch(branchId, { active: false });
  const can = (p) => hasPermission(permissions, p);
  const today = await todayContext();
  const from = shiftDate(today.businessDate, -(days - 1));
  const branchFilter = { branchId: oid(branch._id) };

  const [sales, orders, stock] = await Promise.all([
    can('sales.view') ? Sale.find({ ...branchFilter, status: SALE_STATUS.COMPLETED, businessDate: { $gte: from } }).sort({ createdAt: -1 }).lean() : null,
    can('order.view') ? Order.find({ ...branchFilter, $or: [{ status: { $in: OPEN_ORDER_STATUSES } }, { createdAt: { $gte: new Date(`${from}T00:00:00Z`) } }] }).sort({ expectedDate: 1 }).lean() : null,
    can('inventory.view')
      ? Product.aggregate([
          { $match: { ...branchFilter, isDeleted: false, status: 'in_stock' } },
          { $group: { _id: { metal: '$metal', purity: '$purity' }, items: { $sum: '$quantity' }, grossMg: { $sum: '$grossWeightMg' }, fineMg: { $sum: '$fineWeightMg' } } },
        ])
      : null,
  ]);

  let salesBlock = null;
  if (sales) {
    const dates = Array.from({ length: days }, (_, i) => shiftDate(from, i));
    const byDay = new Map(dates.map((d) => [d, { date: d, totalPaise: 0, bills: 0 }]));
    for (const s of sales) {
      const day = byDay.get(s.businessDate);
      if (day) {
        day.totalPaise += s.totals.grandTotalPaise;
        day.bills += 1;
      }
    }
    const todays = sales.filter((s) => s.businessDate === today.businessDate);
    const items = sales.flatMap((s) => s.items.filter((i) => !i.returned));
    const products = await Product.find({ _id: { $in: items.map((i) => i.productId) } }).select('categoryId').lean();
    const categoryOf = new Map(products.map((p) => [String(p._id), String(p.categoryId)]));
    const categories = new Map((await Category.find({ _id: { $in: [...new Set(categoryOf.values())] } }).select('name').lean()).map((c) => [String(c._id), c.name]));

    const byCategory = new Map();
    const byPurity = new Map();
    for (const i of items) {
      const cat = categoryOf.get(String(i.productId));
      const label = categories.get(cat) ?? 'Uncategorised';
      byCategory.set(label, { key: label, label, value: (byCategory.get(label)?.value ?? 0) + i.breakdown.totalPaise, extra: (byCategory.get(label)?.extra ?? 0) + 1 });
      const pk = `${i.metal}:${i.purity}`;
      byPurity.set(pk, { key: pk, metal: i.metal, purity: i.purity, value: (byPurity.get(pk)?.value ?? 0) + (i.grossWeightMg ?? 0), extra: (byPurity.get(pk)?.extra ?? 0) + i.breakdown.totalPaise });
    }

    const byMode = new Map();
    for (const s of sales) {
      for (const p of s.payments) byMode.set(p.mode, (byMode.get(p.mode) ?? 0) + p.amountPaise);
      if (s.advanceAdjustedPaise) byMode.set('advance', (byMode.get('advance') ?? 0) + s.advanceAdjustedPaise);
    }
    const modeLabel = (m) => (m === 'advance' ? 'Order advance' : m === 'credit' ? 'On credit (due)' : (PAYMENT_MODES.find((x) => x.value === m)?.label ?? m));

    const byCustomer = new Map();
    for (const s of sales.filter((x) => x.customer)) {
      const k = String(s.customer.id);
      const prev = byCustomer.get(k);
      byCustomer.set(k, { id: s.customer.id, name: s.customer.name, mobile: s.customer.mobile, value: (prev?.value ?? 0) + s.totals.grandTotalPaise, bills: (prev?.bills ?? 0) + 1 });
    }

    const revenue = sum(sales, (s) => s.totals.grandTotalPaise);
    salesBlock = {
      today: {
        revenuePaise: sum(todays, (s) => s.totals.grandTotalPaise),
        bills: todays.length,
        collectedPaise: sum(todays, (s) => sum(s.payments.filter((p) => p.mode !== 'credit'), (p) => p.amountPaise)),
      },
      period: {
        revenuePaise: revenue,
        bills: sales.length,
        averageBillPaise: sales.length ? Math.round(revenue / sales.length) : 0,
        items: items.length,
        grossWeightMg: sum(items, (i) => i.grossWeightMg ?? 0),
        discountPaise: sum(sales, (s) => s.totals.discountPaise ?? 0),
        gstPaise: sum(sales, (s) => s.totals.gstPaise ?? 0),
        creditDuePaise: sum(sales, (s) => sum(s.payments.filter((p) => p.mode === 'credit'), (p) => p.amountPaise)),
      },
      daily: [...byDay.values()],
      byCategory: top([...byCategory.values()], 6),
      byPurity: [...byPurity.values()].sort((a, b) => b.extra - a.extra),
      byPaymentMode: [...byMode.entries()].map(([mode, value]) => ({ key: mode, label: modeLabel(mode), value })).sort((a, b) => b.value - a.value),
      topCustomers: [...byCustomer.values()].sort((a, b) => b.value - a.value).slice(0, 5),
      recent: sales.slice(0, 6).map((s) => ({ id: s._id, invoiceNo: s.invoiceNo, at: s.createdAt, customer: s.customer?.name ?? 'Walk-in', totalPaise: s.totals.grandTotalPaise, items: s.items.length })),
    };
  }

  let ordersBlock = null;
  if (orders) {
    const open = orders.filter((o) => OPEN_ORDER_STATUSES.includes(o.status));
    const counts = Object.fromEntries(['booked', 'in_progress', 'ready', 'delivered', 'cancelled'].map((s) => [s, orders.filter((o) => o.status === s).length]));
    ordersBlock = {
      open: open.length,
      ready: counts.ready,
      overdue: open.filter((o) => o.expectedDate && o.expectedDate < today.businessDate).length,
      urgent: open.filter((o) => o.priority === 'urgent').length,
      advanceHeldPaise: sum(open, (o) => o.advancePaise),
      byStatus: counts,
      bookedInPeriod: orders.filter((o) => o.businessDate >= from).length,
      upcoming: open
        .filter((o) => o.expectedDate && o.expectedDate <= shiftDate(today.businessDate, 7))
        .slice(0, 6)
        .map((o) => ({ id: o._id, orderNo: o.orderNo, customer: o.customer.name, expectedDate: o.expectedDate, status: o.status, priority: o.priority ?? 'normal', overdue: o.expectedDate < today.businessDate })),
    };
  }

  const stockBlock = stock && {
    items: sum(stock, (s) => s.items),
    grossWeightMg: sum(stock, (s) => s.grossMg),
    byPurity: stock.map((s) => ({ key: `${s._id.metal}:${s._id.purity}`, metal: s._id.metal, purity: s._id.purity, items: s.items, value: s.grossMg, fineMg: s.fineMg })).sort((a, b) => b.value - a.value),
  };

  return { branch: { id: branch._id, name: branch.name, code: branch.code }, range: { from, to: today.businessDate, days }, sales: salesBlock, orders: ordersBlock, stock: stockBlock };
}
