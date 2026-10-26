import { hasPermission, OPEN_ORDER_STATUSES, PAYMENT_MODES, SALE_STATUS } from '@jerp/shared';
import { requireContext } from '../../core/context/requestContext.js';
import { businessDateFor, dayRange, todayContext } from '../../utils/businessDate.js';
import { Category } from '../categories/category.model.js';
import { CustomerReceipt } from '../customers/customerReceipt.model.js';
import { oid, requireBranch } from '../inventory/inventory.helpers.js';
import { Order } from '../orders/order.model.js';
import { Product } from '../products/product.model.js';
import { Sale, billDue } from '../sales/sale.model.js';

const sum = (list, fn) => list.reduce((s, x) => s + fn(x), 0);
/** YYYY-MM-DD arithmetic on business dates (no timezone drift: the strings are already local). */
const shiftDate = (ymd, days) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
/** Month starts (YYYY-MM-01) from the month of `from` to the month of `to`. */
const monthsBetween = (from, to) => {
  const out = [];
  for (let m = `${from.slice(0, 7)}-01`; m <= to; ) {
    out.push(m);
    const d = new Date(`${m}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + 1);
    m = d.toISOString().slice(0, 10);
  }
  return out;
};
// Longer than this, the trend is shown per month (a daily line would be hundreds of points).
const DAILY_UP_TO = 92;

/**
 * Money received at the branch from `from` (null: since the start) to today, by business date: paid on bills,
 * order advances and part payments, dues collected later and advances customers paid. Each rupee is counted once,
 * on the day it came in — an order advance used on a bill later is not counted again (bills count only what was paid
 * at the counter). Refunds are money going out and are not collections.
 */
async function collections({ branchFilter, from, to, sales, timezone }) {
  const [orders, receipts] = await Promise.all([
    Order.find({ ...branchFilter, advances: { $elemMatch: { amountPaise: { $gt: 0 }, at: dayRange(from, to, timezone) } } }).select('advances').lean(),
    CustomerReceipt.find({ ...branchFilter, status: { $ne: 'void' }, businessDate: { ...(from && { $gte: from }), $lte: to } }).select('kind businessDate mode amountPaise').lean(),
  ]);
  const rows = [
    ...sales.flatMap((s) => s.payments.filter((p) => p.mode !== 'credit').map((p) => ({ source: 'bills', mode: p.mode, date: s.businessDate, amount: p.amountPaise }))),
    ...orders.flatMap((o) =>
      o.advances.filter((a) => a.amountPaise > 0).map((a) => ({ source: 'orderAdvances', mode: a.mode, date: businessDateFor(a.at, timezone), amount: a.amountPaise })),
    ),
    ...receipts.map((r) => ({ source: r.kind === 'advance' ? 'customerAdvances' : 'dueCollections', mode: r.mode, date: r.businessDate, amount: r.amountPaise })),
  ].filter((r) => r.amount > 0 && (!from || r.date >= from) && r.date <= to);
  const total = (list) => {
    const by = { bills: 0, orderAdvances: 0, dueCollections: 0, customerAdvances: 0 };
    const byMode = {};
    for (const r of list) {
      by[r.source] += r.amount;
      byMode[r.mode] = (byMode[r.mode] ?? 0) + r.amount;
    }
    return { collectedPaise: sum(list, (r) => r.amount), breakdown: by, byMode };
  };
  return { today: total(rows.filter((r) => r.date === to)), period: total(rows) };
}

/** Hour of the day (0–23) in the organisation's time zone. */
const hourOf = (date, timeZone) => Number(new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', hourCycle: 'h23' }).format(date));
// A single day is shown per hour from shop opening (or the first bill, if earlier) to now.
const DAY_STARTS_AT = 9;

const top = (rows, n) => {
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  if (sorted.length <= n) return sorted;
  const rest = sorted.slice(n - 1);
  return [...sorted.slice(0, n - 1), { key: 'other', label: 'Other', value: sum(rest, (r) => r.value), extra: sum(rest, (r) => r.extra ?? 0) }];
};

/**
 * The branch at a glance for the chosen period — 'today', 'month' (this month so far) or 'all' (since the branch's
 * first bill): sales trend and mix, collections, orders and stock.
 */
export async function branchDashboard({ branchId, period }) {
  const { permissions } = requireContext();
  const branch = await requireBranch(branchId, { active: false });
  const can = (p) => hasPermission(permissions, p);
  const today = await todayContext();
  const branchFilter = { branchId: oid(branch._id) };
  let from = period === 'month' ? `${today.businessDate.slice(0, 7)}-01` : today.businessDate;
  if (period === 'all') {
    const first = await Sale.findOne({ ...branchFilter, status: SALE_STATUS.COMPLETED }).sort({ businessDate: 1 }).select('businessDate').lean();
    if (first && first.businessDate < today.businessDate) from = first.businessDate;
  }
  const span = daysBetween(from, today.businessDate) + 1;
  const monthly = span > DAILY_UP_TO;

  const [sales, orders, stock] = await Promise.all([
    // Sales figures are money: they also need Dashboard → View financial figures.
    can('sales.view') && can('dashboard.viewFinancials') ? Sale.find({ ...branchFilter, status: SALE_STATUS.COMPLETED, businessDate: { $gte: from } }).sort({ createdAt: -1 }).lean() : null,
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
    // One point per day — or per month (keyed by its first day) over a long range.
    const dates = monthly ? monthsBetween(from, today.businessDate) : Array.from({ length: span }, (_, i) => shiftDate(from, i));
    const byDay = new Map(dates.map((d) => [d, { date: d, totalPaise: 0, bills: 0 }]));
    for (const s of sales) {
      const day = byDay.get(monthly ? `${s.businessDate.slice(0, 7)}-01` : s.businessDate);
      if (day) {
        day.totalPaise += s.totals.grandTotalPaise;
        day.bills += 1;
      }
    }
    const todays = sales.filter((s) => s.businessDate === today.businessDate);
    const collected = await collections({ branchFilter, from: period === 'all' ? null : from, to: today.businessDate, sales, timezone: today.timezone });
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

    // Payment mix = the period's collections by mode (the same money as "Collected"), plus what bills left on credit.
    // Advances used on bills are not a mode: that money is already in the mix on the day it was paid.
    const byMode = new Map(Object.entries(collected.period.byMode));
    const leftOnCredit = sum(sales, (s) => sum(s.payments.filter((p) => p.mode === 'credit'), (p) => p.amountPaise));
    if (leftOnCredit) byMode.set('credit', leftOnCredit);
    const modeLabel = (m) => (m === 'credit' ? 'On credit (due)' : m === 'gold' ? 'Customer gold' : (PAYMENT_MODES.find((x) => x.value === m)?.label ?? m));

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
        // Everything received today: bill payments, order advances, dues collected and customer advances.
        collectedPaise: collected.today.collectedPaise,
        collectedBreakdown: collected.today.breakdown,
      },
      period: {
        revenuePaise: revenue,
        bills: sales.length,
        averageBillPaise: sales.length ? Math.round(revenue / sales.length) : 0,
        // Everything received in the period (cash, card, UPI, bank — not what was left on credit).
        collectedPaise: collected.period.collectedPaise,
        collectedBreakdown: collected.period.breakdown,
        items: items.length,
        grossWeightMg: sum(items, (i) => i.grossWeightMg ?? 0),
        discountPaise: sum(sales, (s) => s.totals.discountPaise ?? 0),
        gstPaise: sum(sales, (s) => s.totals.gstPaise ?? 0),
        // Still owed on the period's bills (credit left at billing, less what was collected or returned since).
        creditDuePaise: sum(sales, billDue),
        dueBills: sales.filter((s) => billDue(s) > 0).length,
      },
      daily: [...byDay.values()],
      // One day has a single daily point (no line): it is shown per hour instead.
      hourly:
        span === 1
          ? (() => {
              const hours = todays.map((x) => hourOf(x.createdAt, today.timezone));
              const first = Math.min(DAY_STARTS_AT, ...hours);
              const last = Math.max(first + 1, hourOf(today.now, today.timezone), ...hours);
              const points = Array.from({ length: last - first + 1 }, (_, i) => ({ hour: first + i, totalPaise: 0, bills: 0 }));
              todays.forEach((x, i) => {
                const point = points[hours[i] - first];
                point.totalPaise += x.totals.grandTotalPaise;
                point.bills += 1;
              });
              return points;
            })()
          : null,
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

  return { branch: { id: branch._id, name: branch.name, code: branch.code }, range: { from, to: today.businessDate, period, span, bucket: monthly ? 'month' : 'day' }, sales: salesBlock, orders: ordersBlock, stock: stockBlock };
}
