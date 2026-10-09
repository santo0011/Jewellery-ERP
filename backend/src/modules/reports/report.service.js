import { ATTENDANCE_STATUSES, hasPermission, METAL_POOL_KINDS, MOVEMENT_TYPE_LABELS, OPEN_ORDER_STATUSES, PAYMENT_MODES, PURITIES, SALE_STATUS } from '@jerp/shared';
import { requireContext } from '../../core/context/requestContext.js';
import { Account } from '../../core/ledger/account.model.js';
import { JournalEntry } from '../../core/ledger/journalEntry.model.js';
import { MetalStock } from '../../core/stock/metalStock.model.js';
import { StockMovement } from '../../core/stock/stockMovement.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { todayContext } from '../../utils/businessDate.js';
import { Category } from '../categories/category.model.js';
import { Customer } from '../customers/customer.model.js';
import { Attendance, Employee, PayrollRun, SalaryAdvance } from '../hr/hr.models.js';
import { monthBounds, offDays } from '../hr/hr.service.js';
import { accessibleBranchFilter, nameMaps, oid, pick, requireBranch } from '../inventory/inventory.helpers.js';
import { Order } from '../orders/order.model.js';
import { Product } from '../products/product.model.js';
import { Sale, SalesReturn } from '../sales/sale.model.js';

// ---------------------------------------------------------------- helpers

const ROW_LIMIT = 2000;
const can = (p) => hasPermission(requireContext().permissions, p);
const sum = (list, fn) => list.reduce((s, x) => s + (fn(x) ?? 0), 0);
const metalLabel = (m) => ({ gold: 'Gold', silver: 'Silver', platinum: 'Platinum' })[m] ?? m;
const purityText = (metal, fineness) => PURITIES[metal]?.find((p) => p.fineness === fineness)?.label ?? String(fineness);
const metalPurity = (metal, purity) => {
  const p = purityText(metal, purity);
  return p.toLowerCase().includes(metalLabel(metal).toLowerCase()) ? p : `${metalLabel(metal)} ${p}`;
};
const modeLabel = (m) => (m === 'advance' ? 'Order advance adjusted' : m === 'credit' ? 'On credit (due)' : (PAYMENT_MODES.find((x) => x.value === m)?.label ?? m));
const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const received = (s) => sum(s.payments.filter((p) => p.mode !== 'credit'), (p) => p.amountPaise) + (s.advanceAdjustedPaise ?? 0);
const credit = (s) => sum(s.payments.filter((p) => p.mode === 'credit'), (p) => p.amountPaise);

/** Rows limited to a chosen branch, or to every branch the user can see. */
async function branchScope(branchId, field = 'branchId') {
  if (!branchId) return accessibleBranchFilter(field);
  await requireBranch(branchId, { active: false });
  return { [field]: oid(branchId) };
}

/** Branches whose ledger lines a report may include: null = no limit (all-branch user, no branch picked). */
async function lineBranches(branchId) {
  if (branchId) {
    await requireBranch(branchId, { active: false });
    return [oid(branchId)];
  }
  const { branchAccess } = requireContext();
  return branchAccess?.all ? null : (branchAccess?.branchIds ?? []).map(oid);
}
const allBranchView = (branchId) => !branchId && Boolean(requireContext().branchAccess?.all);

async function categoryNames(productIds) {
  const products = await Product.find({ _id: { $in: productIds } }).select('categoryId').lean();
  const catOf = new Map(products.map((p) => [String(p._id), String(p.categoryId)]));
  const cats = await Category.find({ _id: { $in: [...new Set(catOf.values())] } }).select('name').lean();
  const names = new Map(cats.map((c) => [String(c._id), c.name]));
  return (productId) => names.get(catOf.get(String(productId))) ?? 'Uncategorised';
}

const completedSales = async ({ from, to, branchId }) =>
  Sale.find({ ...(await branchScope(branchId)), status: SALE_STATUS.COMPLETED, businessDate: { $gte: from, $lte: to } })
    .sort({ businessDate: 1, createdAt: 1 })
    .lean();

/** Group rows by key, summing the numeric fields named in `fields`. */
function groupBy(list, keyFn, init, add) {
  const map = new Map();
  for (const x of list) {
    const k = keyFn(x);
    if (k === null || k === undefined) continue;
    const acc = map.get(k) ?? init(x, k);
    add(acc, x);
    map.set(k, acc);
  }
  return [...map.values()];
}

const totalsOf = (rows, keys) => Object.fromEntries(keys.map((k) => [k, sum(rows, (r) => r[k])]));

// Column helpers: type drives formatting and CSV output on the client.
const col = (key, label, type = 'text', extra = {}) => ({ key, label, type, ...extra });

// ---------------------------------------------------------------- report definitions

const REPORTS = [
  // ------------------------------------------------ sales
  {
    key: 'sales-register',
    group: 'Sales',
    title: 'Sales register',
    description: 'Every invoice with tax, received and due amounts.',
    permission: 'report.sales',
    filters: ['range', 'branch'],
    async run(p) {
      const sales = await completedSales(p);
      const rows = sales.map((s) => ({
        date: s.businessDate,
        invoiceNo: s.invoiceNo,
        customer: s.customer?.name ?? 'Walk-in',
        items: s.items.length,
        grossMg: sum(s.items, (i) => i.grossWeightMg),
        taxablePaise: s.totals.taxablePaise,
        gstPaise: s.totals.gstPaise,
        totalPaise: s.totals.grandTotalPaise,
        receivedPaise: received(s),
        duePaise: credit(s),
        _links: { invoiceNo: `/sales/${s._id}` },
      }));
      const totals = totalsOf(rows, ['items', 'grossMg', 'taxablePaise', 'gstPaise', 'totalPaise', 'receivedPaise', 'duePaise']);
      return {
        columns: [
          col('date', 'Date', 'date'),
          col('invoiceNo', 'Invoice'),
          col('customer', 'Customer'),
          col('items', 'Items', 'number'),
          col('grossMg', 'Gross wt', 'weight'),
          col('taxablePaise', 'Taxable', 'money'),
          col('gstPaise', 'GST', 'money'),
          col('totalPaise', 'Total', 'money', { strong: true }),
          col('receivedPaise', 'Received', 'money', { tone: 'paid' }),
          col('duePaise', 'Due', 'money', { tone: 'due' }),
        ],
        rows,
        totals,
        summary: [
          { label: 'Bills', value: rows.length, type: 'number' },
          { label: 'Sales value', value: totals.totalPaise, type: 'money' },
          { label: 'Received', value: totals.receivedPaise, type: 'money', tone: 'paid' },
          { label: 'Due', value: totals.duePaise, type: 'money', tone: 'due' },
        ],
      };
    },
  },
  {
    key: 'sales-daily',
    group: 'Sales',
    title: 'Day-wise sales',
    description: 'Bills, weight, discount, tax and value for each day.',
    permission: 'report.sales',
    filters: ['range', 'branch'],
    async run(p) {
      const sales = await completedSales(p);
      const rows = groupBy(
        sales,
        (s) => s.businessDate,
        (s) => ({ date: s.businessDate, bills: 0, items: 0, grossMg: 0, discountPaise: 0, taxablePaise: 0, gstPaise: 0, totalPaise: 0 }),
        (r, s) => {
          r.bills += 1;
          r.items += s.items.length;
          r.grossMg += sum(s.items, (i) => i.grossWeightMg);
          r.discountPaise += s.totals.discountPaise ?? 0;
          r.taxablePaise += s.totals.taxablePaise;
          r.gstPaise += s.totals.gstPaise;
          r.totalPaise += s.totals.grandTotalPaise;
        },
      );
      const totals = totalsOf(rows, ['bills', 'items', 'grossMg', 'discountPaise', 'taxablePaise', 'gstPaise', 'totalPaise']);
      return {
        columns: [
          col('date', 'Date', 'date'),
          col('bills', 'Bills', 'number'),
          col('items', 'Items', 'number'),
          col('grossMg', 'Gross wt', 'weight'),
          col('discountPaise', 'Discount', 'money'),
          col('taxablePaise', 'Taxable', 'money'),
          col('gstPaise', 'GST', 'money'),
          col('totalPaise', 'Total', 'money', { strong: true }),
        ],
        rows,
        totals,
        summary: [
          { label: 'Days with sales', value: rows.length, type: 'number' },
          { label: 'Bills', value: totals.bills, type: 'number' },
          { label: 'Sales value', value: totals.totalPaise, type: 'money' },
          { label: 'Average per day', value: rows.length ? Math.round(totals.totalPaise / rows.length) : 0, type: 'money' },
        ],
      };
    },
  },
  {
    key: 'sales-category',
    group: 'Sales',
    title: 'Category-wise sales',
    description: 'What sold: pieces, weight and value per category.',
    permission: 'report.sales',
    filters: ['range', 'branch'],
    async run(p) {
      const sales = await completedSales(p);
      const items = sales.flatMap((s) => s.items.filter((i) => !i.returned));
      const catOf = await categoryNames(items.map((i) => i.productId));
      const rows = groupBy(
        items,
        (i) => catOf(i.productId),
        (i, k) => ({ category: k, items: 0, grossMg: 0, netMg: 0, taxablePaise: 0, totalPaise: 0 }),
        (r, i) => {
          r.items += i.quantity ?? 1;
          r.grossMg += i.grossWeightMg ?? 0;
          r.netMg += i.netWeightMg ?? 0;
          r.taxablePaise += i.breakdown.taxablePaise;
          r.totalPaise += i.breakdown.totalPaise;
        },
      ).sort((a, b) => b.totalPaise - a.totalPaise);
      const totals = totalsOf(rows, ['items', 'grossMg', 'netMg', 'taxablePaise', 'totalPaise']);
      rows.forEach((r) => (r.share = pct(r.totalPaise, totals.totalPaise)));
      return {
        columns: [
          col('category', 'Category'),
          col('items', 'Pieces', 'number'),
          col('grossMg', 'Gross wt', 'weight'),
          col('netMg', 'Net wt', 'weight'),
          col('taxablePaise', 'Taxable', 'money'),
          col('totalPaise', 'Total', 'money', { strong: true }),
          col('share', 'Share', 'percent'),
        ],
        rows,
        totals: { ...totals, share: rows.length ? 100 : 0 },
        summary: [
          { label: 'Categories sold', value: rows.length, type: 'number' },
          { label: 'Pieces', value: totals.items, type: 'number' },
          { label: 'Gross weight', value: totals.grossMg, type: 'weight' },
          { label: 'Sales value', value: totals.totalPaise, type: 'money' },
        ],
      };
    },
  },
  {
    key: 'sales-metal',
    group: 'Sales',
    title: 'Metal & purity-wise sales',
    description: 'Gross, net and fine weight sold for each metal and purity.',
    permission: 'report.sales',
    filters: ['range', 'branch'],
    async run(p) {
      const sales = await completedSales(p);
      const items = sales.flatMap((s) => s.items.filter((i) => !i.returned));
      const rows = groupBy(
        items,
        (i) => `${i.metal}:${i.purity}`,
        (i) => ({ metal: metalPurity(i.metal, i.purity), items: 0, grossMg: 0, netMg: 0, fineMg: 0, totalPaise: 0 }),
        (r, i) => {
          r.items += i.quantity ?? 1;
          r.grossMg += i.grossWeightMg ?? 0;
          r.netMg += i.netWeightMg ?? 0;
          r.fineMg += i.fineWeightMg ?? 0;
          r.totalPaise += i.breakdown.totalPaise;
        },
      ).sort((a, b) => b.totalPaise - a.totalPaise);
      const totals = totalsOf(rows, ['items', 'grossMg', 'netMg', 'fineMg', 'totalPaise']);
      return {
        columns: [
          col('metal', 'Metal & purity'),
          col('items', 'Pieces', 'number'),
          col('grossMg', 'Gross wt', 'weight'),
          col('netMg', 'Net wt', 'weight'),
          col('fineMg', 'Fine wt', 'weight'),
          col('totalPaise', 'Total', 'money', { strong: true }),
        ],
        rows,
        totals,
        summary: [
          { label: 'Pieces', value: totals.items, type: 'number' },
          { label: 'Gross weight', value: totals.grossMg, type: 'weight' },
          { label: 'Fine weight', value: totals.fineMg, type: 'weight' },
          { label: 'Sales value', value: totals.totalPaise, type: 'money' },
        ],
      };
    },
  },
  {
    key: 'sales-payment',
    group: 'Sales',
    title: 'Payment mode summary',
    description: 'How customers paid: cash, card, UPI, bank, advance and credit.',
    permission: 'report.sales',
    filters: ['range', 'branch'],
    async run(p) {
      const sales = await completedSales(p);
      const entries = sales.flatMap((s) => [...s.payments.map((x) => ({ mode: x.mode, amount: x.amountPaise })), ...(s.advanceAdjustedPaise ? [{ mode: 'advance', amount: s.advanceAdjustedPaise }] : [])]);
      const rows = groupBy(
        entries,
        (e) => e.mode,
        (e) => ({ mode: modeLabel(e.mode), count: 0, amountPaise: 0, _tone: e.mode === 'credit' ? 'due' : 'paid' }),
        (r, e) => {
          r.count += 1;
          r.amountPaise += e.amount;
        },
      ).sort((a, b) => b.amountPaise - a.amountPaise);
      const total = sum(rows, (r) => r.amountPaise);
      rows.forEach((r) => (r.share = pct(r.amountPaise, total)));
      const cash = sum(entries.filter((e) => e.mode === 'cash'), (e) => e.amount);
      return {
        columns: [col('mode', 'Payment mode'), col('count', 'Payments', 'number'), col('amountPaise', 'Amount', 'money', { strong: true, toneFromRow: true }), col('share', 'Share', 'percent')],
        rows,
        totals: { count: sum(rows, (r) => r.count), amountPaise: total, share: rows.length ? 100 : 0 },
        summary: [
          { label: 'Total billed', value: total, type: 'money' },
          { label: 'Cash', value: cash, type: 'money', tone: 'paid' },
          { label: 'Bank / card / UPI', value: sum(entries.filter((e) => ['card', 'upi', 'bank'].includes(e.mode)), (e) => e.amount), type: 'money', tone: 'paid' },
          { label: 'On credit', value: sum(entries.filter((e) => e.mode === 'credit'), (e) => e.amount), type: 'money', tone: 'due' },
        ],
      };
    },
  },
  {
    key: 'sales-staff',
    group: 'Sales',
    title: 'Staff-wise sales',
    description: 'Bills and sales value made by each user.',
    permission: 'report.sales',
    filters: ['range', 'branch'],
    async run(p) {
      const sales = await completedSales(p);
      const maps = await nameMaps({ userIds: sales.map((s) => s.createdBy) });
      const rows = groupBy(
        sales,
        (s) => String(s.createdBy),
        (s) => ({ user: pick(maps.users, s.createdBy)?.name ?? 'Unknown', bills: 0, items: 0, totalPaise: 0, discountPaise: 0 }),
        (r, s) => {
          r.bills += 1;
          r.items += s.items.length;
          r.totalPaise += s.totals.grandTotalPaise;
          r.discountPaise += s.totals.discountPaise ?? 0;
        },
      ).sort((a, b) => b.totalPaise - a.totalPaise);
      rows.forEach((r) => (r.averagePaise = Math.round(r.totalPaise / r.bills)));
      const totals = totalsOf(rows, ['bills', 'items', 'totalPaise', 'discountPaise']);
      return {
        columns: [
          col('user', 'Billed by'),
          col('bills', 'Bills', 'number'),
          col('items', 'Items', 'number'),
          col('discountPaise', 'Discount given', 'money'),
          col('averagePaise', 'Average bill', 'money'),
          col('totalPaise', 'Sales value', 'money', { strong: true }),
        ],
        rows,
        totals: { ...totals, averagePaise: totals.bills ? Math.round(totals.totalPaise / totals.bills) : 0 },
        summary: [
          { label: 'Staff billing', value: rows.length, type: 'number' },
          { label: 'Bills', value: totals.bills, type: 'number' },
          { label: 'Sales value', value: totals.totalPaise, type: 'money' },
        ],
      };
    },
  },
  {
    key: 'sales-returns',
    group: 'Sales',
    title: 'Sales returns',
    description: 'Credit notes issued, with refund mode and reason.',
    permission: 'report.sales',
    filters: ['range', 'branch'],
    async run({ from, to, branchId }) {
      const list = await SalesReturn.find({ ...(await branchScope(branchId)), businessDate: { $gte: from, $lte: to } }).sort({ businessDate: 1 }).lean();
      const rows = list.map((r) => ({
        date: r.businessDate,
        creditNoteNo: r.creditNoteNo,
        invoiceNo: r.invoiceNo,
        items: r.productIds.length,
        taxablePaise: r.taxablePaise,
        gstPaise: r.gstPaise,
        amountPaise: r.amountPaise,
        refund: modeLabel(r.refundMode),
        reason: r.reason,
        _links: { invoiceNo: `/sales/${r.saleId}` },
      }));
      const totals = totalsOf(rows, ['items', 'taxablePaise', 'gstPaise', 'amountPaise']);
      return {
        columns: [
          col('date', 'Date', 'date'),
          col('creditNoteNo', 'Credit note'),
          col('invoiceNo', 'Invoice'),
          col('items', 'Items', 'number'),
          col('taxablePaise', 'Taxable', 'money'),
          col('gstPaise', 'GST', 'money'),
          col('amountPaise', 'Amount', 'money', { strong: true, tone: 'due' }),
          col('refund', 'Refund'),
          col('reason', 'Reason'),
        ],
        rows,
        totals,
        summary: [
          { label: 'Returns', value: rows.length, type: 'number' },
          { label: 'Items returned', value: totals.items, type: 'number' },
          { label: 'Refund value', value: totals.amountPaise, type: 'money', tone: 'due' },
        ],
      };
    },
  },
  {
    key: 'gst-hsn',
    group: 'Tax & finance',
    title: 'GST summary (HSN-wise)',
    description: 'Taxable value and CGST / SGST / IGST by HSN code — for GSTR-1.',
    permission: 'report.finance',
    filters: ['range', 'branch'],
    async run(p) {
      const sales = await completedSales(p);
      const lines = sales.flatMap((s) => s.items.map((i) => ({ ...i, interState: s.interState })));
      const rows = groupBy(
        lines,
        (i) => i.hsnCode || '—',
        (i, k) => ({ hsn: k, qty: 0, grossMg: 0, taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, taxPaise: 0 }),
        (r, i) => {
          const gst = i.breakdown.gstPaise;
          r.qty += i.quantity ?? 1;
          r.grossMg += i.grossWeightMg ?? 0;
          r.taxablePaise += i.breakdown.taxablePaise;
          if (i.interState) r.igstPaise += gst;
          else {
            r.cgstPaise += Math.floor(gst / 2);
            r.sgstPaise += gst - Math.floor(gst / 2);
          }
          r.taxPaise += gst;
        },
      ).sort((a, b) => b.taxablePaise - a.taxablePaise);
      const totals = totalsOf(rows, ['qty', 'grossMg', 'taxablePaise', 'cgstPaise', 'sgstPaise', 'igstPaise', 'taxPaise']);
      return {
        columns: [
          col('hsn', 'HSN'),
          col('qty', 'Qty', 'number'),
          col('grossMg', 'Gross wt', 'weight'),
          col('taxablePaise', 'Taxable value', 'money'),
          col('cgstPaise', 'CGST', 'money'),
          col('sgstPaise', 'SGST', 'money'),
          col('igstPaise', 'IGST', 'money'),
          col('taxPaise', 'Total tax', 'money', { strong: true }),
        ],
        rows,
        totals,
        summary: [
          { label: 'Taxable value', value: totals.taxablePaise, type: 'money' },
          { label: 'CGST + SGST', value: totals.cgstPaise + totals.sgstPaise, type: 'money' },
          { label: 'IGST', value: totals.igstPaise, type: 'money' },
          { label: 'Total tax', value: totals.taxPaise, type: 'money' },
        ],
        note: 'Invoice-level round-off is not included. Returns are shown separately in the Sales returns report.',
      };
    },
  },
  {
    key: 'profit',
    group: 'Tax & finance',
    title: 'Gross profit (invoice-wise)',
    description: 'Selling value before tax against the cost of the pieces sold.',
    permission: 'report.finance',
    extraPermission: 'product.viewCost',
    filters: ['range', 'branch'],
    async run(p) {
      const sales = await completedSales(p);
      const rows = sales.map((s) => {
        const items = s.items.filter((i) => !i.returned);
        const taxable = sum(items, (i) => i.breakdown.taxablePaise);
        const cost = sum(items, (i) => i.costPaise);
        return { date: s.businessDate, invoiceNo: s.invoiceNo, customer: s.customer?.name ?? 'Walk-in', taxablePaise: taxable, costPaise: cost, profitPaise: taxable - cost, margin: pct(taxable - cost, taxable), _links: { invoiceNo: `/sales/${s._id}` } };
      });
      const totals = totalsOf(rows, ['taxablePaise', 'costPaise', 'profitPaise']);
      return {
        columns: [
          col('date', 'Date', 'date'),
          col('invoiceNo', 'Invoice'),
          col('customer', 'Customer'),
          col('taxablePaise', 'Sale (before GST)', 'money'),
          col('costPaise', 'Cost', 'money'),
          col('profitPaise', 'Gross profit', 'money', { strong: true, signed: true }),
          col('margin', 'Margin', 'percent'),
        ],
        rows,
        totals: { ...totals, margin: pct(totals.profitPaise, totals.taxablePaise) },
        summary: [
          { label: 'Sales before GST', value: totals.taxablePaise, type: 'money' },
          { label: 'Cost of goods', value: totals.costPaise, type: 'money' },
          { label: 'Gross profit', value: totals.profitPaise, type: 'money', tone: totals.profitPaise >= 0 ? 'paid' : 'due' },
          { label: 'Margin', value: pct(totals.profitPaise, totals.taxablePaise), type: 'percent' },
        ],
        note: 'Pieces without a cost price count as zero cost, which overstates profit.',
      };
    },
  },

  // ------------------------------------------------ customers & orders
  {
    key: 'customer-outstanding',
    group: 'Customers & orders',
    title: 'Customer outstanding',
    description: 'Who owes you: credit on bills plus old dues, highest first.',
    permission: 'report.customer',
    filters: ['branch'],
    async run({ branchId }) {
      const sales = await Sale.find({ ...(await branchScope(branchId)), status: SALE_STATUS.COMPLETED, customerId: { $ne: null } }).select('customerId payments businessDate').lean();
      const byCust = new Map();
      for (const s of sales) {
        const r = byCust.get(String(s.customerId)) ?? { credit: 0, last: null };
        r.credit += credit(s);
        if (!r.last || s.businessDate > r.last) r.last = s.businessDate;
        byCust.set(String(s.customerId), r);
      }
      const withOld = allBranchView(branchId);
      const customers = await Customer.find({ isDeleted: false, $or: [{ _id: { $in: [...byCust.keys()] } }, ...(withOld ? [{ openingBalancePaise: { $gt: 0 } }] : [])] }).select('code name mobile openingBalancePaise').lean();
      const rows = customers
        .map((c) => {
          const s = byCust.get(String(c._id)) ?? { credit: 0, last: null };
          const old = withOld ? Math.max(0, c.openingBalancePaise ?? 0) : 0;
          return { customer: c.name, code: c.code, mobile: c.mobile, creditPaise: s.credit, oldDuePaise: old, duePaise: s.credit + old, lastPurchase: s.last, _links: { customer: `/customers/${c._id}` } };
        })
        .filter((r) => r.duePaise > 0)
        .sort((a, b) => b.duePaise - a.duePaise);
      const totals = totalsOf(rows, ['creditPaise', 'oldDuePaise', 'duePaise']);
      return {
        columns: [
          col('customer', 'Customer'),
          col('code', 'Code'),
          col('mobile', 'Mobile'),
          col('lastPurchase', 'Last bill', 'date'),
          col('creditPaise', 'Credit on bills', 'money'),
          col('oldDuePaise', 'Old due', 'money'),
          col('duePaise', 'Total due', 'money', { strong: true, tone: 'due' }),
        ],
        rows,
        totals,
        summary: [
          { label: 'Customers owing', value: rows.length, type: 'number' },
          { label: 'Total outstanding', value: totals.duePaise, type: 'money', tone: 'due' },
          { label: 'Largest due', value: rows[0]?.duePaise ?? 0, type: 'money', tone: 'due' },
        ],
        note: withOld ? null : 'Branch view shows credit on this branch’s bills only; old dues are organisation-wide and are left out.',
      };
    },
  },
  {
    key: 'top-customers',
    group: 'Customers & orders',
    title: 'Top customers',
    description: 'Customers ranked by purchase value in the period.',
    permission: 'report.customer',
    filters: ['range', 'branch'],
    async run(p) {
      const sales = (await completedSales(p)).filter((s) => s.customerId);
      const rows = groupBy(
        sales,
        (s) => String(s.customerId),
        (s) => ({ customer: s.customer.name, mobile: s.customer.mobile, bills: 0, items: 0, totalPaise: 0, lastPurchase: s.businessDate, _links: { customer: `/customers/${s.customerId}` } }),
        (r, s) => {
          r.bills += 1;
          r.items += s.items.length;
          r.totalPaise += s.totals.grandTotalPaise;
          if (s.businessDate > r.lastPurchase) r.lastPurchase = s.businessDate;
        },
      )
        .sort((a, b) => b.totalPaise - a.totalPaise)
        .map((r, i) => ({ rank: i + 1, ...r }));
      const totals = totalsOf(rows, ['bills', 'items', 'totalPaise']);
      return {
        columns: [col('rank', '#', 'number'), col('customer', 'Customer'), col('mobile', 'Mobile'), col('bills', 'Bills', 'number'), col('items', 'Items', 'number'), col('lastPurchase', 'Last bill', 'date'), col('totalPaise', 'Purchases', 'money', { strong: true })],
        rows,
        totals,
        summary: [
          { label: 'Customers', value: rows.length, type: 'number' },
          { label: 'Purchases', value: totals.totalPaise, type: 'money' },
          { label: 'Top customer share', value: pct(rows[0]?.totalPaise ?? 0, totals.totalPaise), type: 'percent' },
        ],
      };
    },
  },
  {
    key: 'orders-open',
    group: 'Customers & orders',
    title: 'Open orders',
    description: 'Orders not yet delivered, with due date, estimate and advance held.',
    permission: 'report.sales',
    extraPermission: 'order.view',
    filters: ['branch'],
    async run({ branchId }) {
      const today = (await todayContext()).businessDate;
      const orders = await Order.find({ ...(await branchScope(branchId)), status: { $in: OPEN_ORDER_STATUSES } }).sort({ expectedDate: 1 }).lean();
      const rows = orders.map((o) => {
        const overdue = o.expectedDate && o.expectedDate < today ? daysBetween(o.expectedDate, today) : 0;
        return {
          orderNo: o.orderNo,
          booked: o.businessDate,
          customer: o.customer.name,
          items: o.items.map((i) => i.description).join(', '),
          status: o.status.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
          priority: o.priority === 'urgent' ? 'Urgent' : 'Normal',
          expected: o.expectedDate,
          overdueDays: overdue,
          estimatePaise: o.estimatedPaise,
          advancePaise: o.advancePaise,
          _links: { orderNo: `/orders/${o._id}` },
          _tone: overdue ? 'due' : null,
        };
      });
      const totals = totalsOf(rows, ['estimatePaise', 'advancePaise']);
      return {
        columns: [
          col('orderNo', 'Order'),
          col('booked', 'Booked', 'date'),
          col('customer', 'Customer'),
          col('items', 'Items'),
          col('status', 'Status'),
          col('priority', 'Priority'),
          col('expected', 'Due', 'date'),
          col('overdueDays', 'Days late', 'days'),
          col('estimatePaise', 'Estimate', 'money'),
          col('advancePaise', 'Advance', 'money', { tone: 'paid' }),
        ],
        rows,
        totals,
        summary: [
          { label: 'Open orders', value: rows.length, type: 'number' },
          { label: 'Overdue', value: rows.filter((r) => r.overdueDays > 0).length, type: 'number', tone: rows.some((r) => r.overdueDays > 0) ? 'due' : undefined },
          { label: 'Estimated value', value: totals.estimatePaise, type: 'money' },
          { label: 'Advance held', value: totals.advancePaise, type: 'money', tone: 'paid' },
        ],
      };
    },
  },

  // ------------------------------------------------ inventory
  {
    key: 'stock-summary',
    group: 'Inventory',
    title: 'Stock summary (metal & purity)',
    description: 'Tagged pieces in stock now: count and weights per metal and purity.',
    permission: 'report.inventory',
    filters: ['branch'],
    async run({ branchId }) {
      const cost = can('product.viewCost');
      const products = await Product.find({ ...(await branchScope(branchId)), isDeleted: false, status: 'in_stock' }).select('metal purity quantity grossWeightMg netWeightMg fineWeightMg costPricePaise').lean();
      const rows = groupBy(
        products,
        (x) => `${x.metal}:${x.purity}`,
        (x) => ({ metal: metalPurity(x.metal, x.purity), items: 0, grossMg: 0, netMg: 0, fineMg: 0, costPaise: 0 }),
        (r, x) => {
          r.items += x.quantity ?? 1;
          r.grossMg += x.grossWeightMg ?? 0;
          r.netMg += x.netWeightMg ?? 0;
          r.fineMg += x.fineWeightMg ?? 0;
          r.costPaise += x.costPricePaise ?? 0;
        },
      ).sort((a, b) => b.fineMg - a.fineMg);
      const totals = totalsOf(rows, ['items', 'grossMg', 'netMg', 'fineMg', 'costPaise']);
      return {
        columns: [
          col('metal', 'Metal & purity'),
          col('items', 'Pieces', 'number'),
          col('grossMg', 'Gross wt', 'weight'),
          col('netMg', 'Net wt', 'weight'),
          col('fineMg', 'Fine wt', 'weight', { strong: true }),
          ...(cost ? [col('costPaise', 'Cost value', 'money')] : []),
        ],
        rows,
        totals,
        summary: [
          { label: 'Pieces in stock', value: totals.items, type: 'number' },
          { label: 'Gross weight', value: totals.grossMg, type: 'weight' },
          { label: 'Fine weight', value: totals.fineMg, type: 'weight' },
          ...(cost ? [{ label: 'Cost value', value: totals.costPaise, type: 'money' }] : []),
        ],
      };
    },
  },
  {
    key: 'stock-category',
    group: 'Inventory',
    title: 'Stock by category',
    description: 'Pieces and weight in stock for each category.',
    permission: 'report.inventory',
    filters: ['branch'],
    async run({ branchId }) {
      const cost = can('product.viewCost');
      const products = await Product.find({ ...(await branchScope(branchId)), isDeleted: false, status: 'in_stock' }).select('categoryId quantity grossWeightMg fineWeightMg costPricePaise').lean();
      const cats = new Map((await Category.find({ _id: { $in: products.map((x) => x.categoryId) } }).select('name').lean()).map((c) => [String(c._id), c.name]));
      const rows = groupBy(
        products,
        (x) => cats.get(String(x.categoryId)) ?? 'Uncategorised',
        (x, k) => ({ category: k, items: 0, grossMg: 0, fineMg: 0, costPaise: 0 }),
        (r, x) => {
          r.items += x.quantity ?? 1;
          r.grossMg += x.grossWeightMg ?? 0;
          r.fineMg += x.fineWeightMg ?? 0;
          r.costPaise += x.costPricePaise ?? 0;
        },
      ).sort((a, b) => b.grossMg - a.grossMg);
      const totals = totalsOf(rows, ['items', 'grossMg', 'fineMg', 'costPaise']);
      return {
        columns: [col('category', 'Category'), col('items', 'Pieces', 'number'), col('grossMg', 'Gross wt', 'weight', { strong: true }), col('fineMg', 'Fine wt', 'weight'), ...(cost ? [col('costPaise', 'Cost value', 'money')] : [])],
        rows,
        totals,
        summary: [
          { label: 'Categories in stock', value: rows.length, type: 'number' },
          { label: 'Pieces', value: totals.items, type: 'number' },
          { label: 'Gross weight', value: totals.grossMg, type: 'weight' },
        ],
      };
    },
  },
  {
    key: 'stock-ageing',
    group: 'Inventory',
    title: 'Stock ageing',
    description: 'How long each piece has been in stock — find slow movers.',
    permission: 'report.inventory',
    filters: ['branch'],
    async run({ branchId }) {
      const today = (await todayContext()).businessDate;
      const products = await Product.find({ ...(await branchScope(branchId)), isDeleted: false, status: 'in_stock' }).select('sku name metal purity grossWeightMg branchId costPricePaise createdAt').lean();
      const inbound = await StockMovement.aggregate([
        { $match: { productId: { $in: products.map((x) => x._id) }, direction: 1 } },
        { $group: { _id: '$productId', since: { $max: '$businessDate' } } },
      ]);
      const sinceOf = new Map(inbound.map((m) => [String(m._id), m.since]));
      const maps = await nameMaps({ branchIds: products.map((x) => x.branchId) });
      const bucket = (d) => (d <= 30 ? '0–30 days' : d <= 90 ? '31–90 days' : d <= 180 ? '91–180 days' : 'Over 180 days');
      const rows = products
        .map((x) => {
          const since = sinceOf.get(String(x._id)) ?? x.createdAt.toISOString().slice(0, 10);
          const days = daysBetween(since, today);
          return { sku: x.sku, name: x.name, metal: metalPurity(x.metal, x.purity), branch: pick(maps.branches, x.branchId)?.name ?? '', since, days, bucket: bucket(days), grossMg: x.grossWeightMg, _links: { sku: `/products/${x._id}` }, _tone: days > 180 ? 'due' : null };
        })
        .sort((a, b) => b.days - a.days);
      const count = (b) => rows.filter((r) => r.bucket === b).length;
      return {
        columns: [col('sku', 'SKU'), col('name', 'Item'), col('metal', 'Metal'), col('branch', 'Branch'), col('since', 'In stock since', 'date'), col('days', 'Age', 'days', { strong: true }), col('bucket', 'Bucket'), col('grossMg', 'Gross wt', 'weight')],
        rows,
        totals: { grossMg: sum(rows, (r) => r.grossMg) },
        summary: [
          { label: '0–30 days', value: count('0–30 days'), type: 'number' },
          { label: '31–90 days', value: count('31–90 days'), type: 'number' },
          { label: '91–180 days', value: count('91–180 days'), type: 'number' },
          { label: 'Over 180 days', value: count('Over 180 days'), type: 'number', tone: count('Over 180 days') ? 'due' : undefined },
        ],
      };
    },
  },
  {
    key: 'stock-movements',
    group: 'Inventory',
    title: 'Stock movement summary',
    description: 'Weight in and out for each kind of movement in the period.',
    permission: 'report.inventory',
    filters: ['range', 'branch'],
    async run({ from, to, branchId }) {
      const moves = await StockMovement.find({ ...(await branchScope(branchId)), businessDate: { $gte: from, $lte: to } }).select('type direction qty grossMg fineMg').lean();
      const rows = groupBy(
        moves,
        (m) => m.type,
        (m) => ({ type: MOVEMENT_TYPE_LABELS[m.type] ?? m.type, entries: 0, inMg: 0, outMg: 0, fineNetMg: 0 }),
        (r, m) => {
          r.entries += 1;
          if (m.direction > 0) r.inMg += m.grossMg;
          else r.outMg += m.grossMg;
          r.fineNetMg += m.direction * m.fineMg;
        },
      ).sort((a, b) => b.entries - a.entries);
      const totals = totalsOf(rows, ['entries', 'inMg', 'outMg', 'fineNetMg']);
      return {
        columns: [col('type', 'Movement'), col('entries', 'Entries', 'number'), col('inMg', 'Gross in', 'weight', { tone: 'paid' }), col('outMg', 'Gross out', 'weight', { tone: 'due' }), col('fineNetMg', 'Net fine', 'weight', { signed: true, strong: true })],
        rows,
        totals,
        summary: [
          { label: 'Movements', value: totals.entries, type: 'number' },
          { label: 'Gross in', value: totals.inMg, type: 'weight', tone: 'paid' },
          { label: 'Gross out', value: totals.outMg, type: 'weight', tone: 'due' },
          { label: 'Net fine change', value: totals.fineNetMg, type: 'weight' },
        ],
      };
    },
  },
  {
    key: 'metal-balance',
    group: 'Inventory',
    title: 'Metal balance (bullion, old gold, scrap)',
    description: 'Untagged metal held at each branch.',
    permission: 'report.inventory',
    filters: ['branch'],
    async run({ branchId }) {
      const cost = can('product.viewCost');
      const list = await MetalStock.find({ ...(await branchScope(branchId)), grossMg: { $gt: 0 } }).lean();
      const maps = await nameMaps({ branchIds: list.map((m) => m.branchId) });
      const kindLabel = (k) => METAL_POOL_KINDS.find((x) => x.value === k)?.label ?? k;
      const rows = list.map((m) => ({ branch: pick(maps.branches, m.branchId)?.name ?? '', kind: kindLabel(m.kind), metal: metalPurity(m.metal, m.purity), grossMg: m.grossMg, fineMg: m.fineMg, valuePaise: m.valuePaise })).sort((a, b) => b.fineMg - a.fineMg);
      const totals = totalsOf(rows, ['grossMg', 'fineMg', 'valuePaise']);
      return {
        columns: [col('branch', 'Branch'), col('kind', 'Type'), col('metal', 'Metal & purity'), col('grossMg', 'Gross wt', 'weight'), col('fineMg', 'Fine wt', 'weight', { strong: true }), ...(cost ? [col('valuePaise', 'Book value', 'money')] : [])],
        rows,
        totals,
        summary: [
          { label: 'Lots', value: rows.length, type: 'number' },
          { label: 'Gross weight', value: totals.grossMg, type: 'weight' },
          { label: 'Fine weight', value: totals.fineMg, type: 'weight' },
        ],
      };
    },
  },

  // ------------------------------------------------ HR
  {
    key: 'salary-register',
    group: 'HR & payroll',
    title: 'Salary register',
    description: 'Each employee’s pay for the month: days, earnings, deductions, net and payment.',
    permission: 'payroll.view',
    filters: ['month', 'branch'],
    async run({ month, branchId }) {
      const runs = await PayrollRun.find({ ...(await branchScope(branchId)), month }).lean();
      const maps = await nameMaps({ branchIds: runs.map((r) => r.branchId) });
      const rows = runs.flatMap((r) =>
        r.lines.map((l) => ({
          employee: l.name,
          code: l.code,
          branch: pick(maps.branches, r.branchId)?.name ?? '',
          days: `${Number.isInteger(l.payableDays) ? l.payableDays : `${Math.floor(l.payableDays)}½`} / ${l.daysInMonth}`,
          grossPaise: l.grossPaise,
          earnedPaise: l.earnedPaise,
          bonusPaise: l.bonusPaise,
          deductionPaise: l.otherDeductionPaise + l.advanceDeductionPaise,
          netPaise: l.netPaise,
          status: r.status === 'draft' ? 'Draft' : l.paid?.at ? 'Paid' : 'Unpaid',
          _links: { employee: `/hr/employees/${l.employeeId}` },
          _tone: r.status !== 'draft' && !l.paid?.at ? 'due' : null,
        })),
      );
      const totals = totalsOf(rows, ['grossPaise', 'earnedPaise', 'bonusPaise', 'deductionPaise', 'netPaise']);
      return {
        columns: [
          col('employee', 'Employee'),
          col('code', 'Code'),
          col('branch', 'Branch'),
          col('days', 'Paid days'),
          col('grossPaise', 'Gross', 'money'),
          col('earnedPaise', 'Earned', 'money'),
          col('bonusPaise', 'Bonus', 'money', { tone: 'paid' }),
          col('deductionPaise', 'Deductions', 'money', { tone: 'due' }),
          col('netPaise', 'Net pay', 'money', { strong: true }),
          col('status', 'Status'),
        ],
        rows,
        totals,
        summary: [
          { label: 'Employees', value: rows.length, type: 'number' },
          { label: 'Net salary', value: totals.netPaise, type: 'money' },
          { label: 'Paid', value: sum(rows.filter((r) => r.status === 'Paid'), (r) => r.netPaise), type: 'money', tone: 'paid' },
          { label: 'Unpaid', value: sum(rows.filter((r) => r.status === 'Unpaid'), (r) => r.netPaise), type: 'money', tone: 'due' },
        ],
        note: runs.length ? null : 'No payroll has been run for this month yet.',
      };
    },
  },
  {
    key: 'attendance-summary',
    group: 'HR & payroll',
    title: 'Attendance summary',
    description: 'Absent, half days, leave, holidays and paid days per employee for the month.',
    permission: 'attendance.view',
    filters: ['month', 'branch'],
    async run({ month, branchId }) {
      const { start, end } = monthBounds(month);
      const scope = await branchScope(branchId);
      const employees = await Employee.find({ ...scope, joiningDate: { $lte: end }, $or: [{ exitDate: null }, { exitDate: { $gte: start } }] }).sort({ name: 1 }).lean();
      const marks = await Attendance.find({ employeeId: { $in: employees.map((e) => e._id) }, date: { $gte: start, $lte: end } }).select('employeeId status date').lean();
      const offs = await offDays(employees.map((e) => e.branchId), start, end);
      const maps = await nameMaps({ branchIds: employees.map((e) => e.branchId) });
      const rows = employees.map((e) => {
        const c = Object.fromEntries(ATTENDANCE_STATUSES.map((s) => [s.value, 0]));
        const markedDays = new Set();
        for (const m of marks) {
          if (String(m.employeeId) !== String(e._id)) continue;
          c[m.status] += 1;
          markedDays.add(m.date);
        }
        // Unmarked weekly offs and holidays count as holiday.
        for (const d of offs.get(String(e.branchId))?.keys() ?? []) if (d >= e.joiningDate && (!e.exitDate || d <= e.exitDate) && !markedDays.has(d)) c.holiday += 1;
        const from = e.joiningDate > start ? e.joiningDate : start;
        const to = e.exitDate && e.exitDate < end ? e.exitDate : end;
        const eligible = daysBetween(from, to) + 1;
        const paid = eligible - c.absent - c.half_day * 0.5;
        return { employee: e.name, code: e.code, branch: pick(maps.branches, e.branchId)?.name ?? '', eligible, absent: c.absent, halfDay: c.half_day, leave: c.paid_leave, holiday: c.holiday, paidDays: paid, _links: { employee: `/hr/employees/${e._id}` }, _tone: c.absent ? 'due' : null };
      });
      const totals = totalsOf(rows, ['absent', 'halfDay', 'leave', 'holiday']);
      return {
        columns: [
          col('employee', 'Employee'),
          col('code', 'Code'),
          col('branch', 'Branch'),
          col('eligible', 'Days on rolls', 'number'),
          col('absent', 'Absent', 'number', { tone: 'due' }),
          col('halfDay', 'Half days', 'number'),
          col('leave', 'Paid leave', 'number'),
          col('holiday', 'Holidays', 'number'),
          col('paidDays', 'Paid days', 'days', { strong: true }),
        ],
        rows,
        totals,
        summary: [
          { label: 'Employees', value: rows.length, type: 'number' },
          { label: 'Absent days', value: totals.absent, type: 'number', tone: totals.absent ? 'due' : undefined },
          { label: 'Half days', value: totals.halfDay, type: 'number' },
          { label: 'Paid leave', value: totals.leave, type: 'number' },
        ],
        note: 'Days with no mark count as present; unmarked weekly offs and holidays count as holiday.',
      };
    },
  },
  {
    key: 'advances-outstanding',
    group: 'HR & payroll',
    title: 'Salary advances outstanding',
    description: 'Advances still being recovered from salary.',
    permission: 'payroll.view',
    filters: ['branch'],
    async run({ branchId }) {
      const list = await SalaryAdvance.find({ ...(await branchScope(branchId)), status: 'open' }).sort({ createdAt: 1 }).lean();
      const emps = new Map((await Employee.find({ _id: { $in: list.map((a) => a.employeeId) } }).select('name code').lean()).map((e) => [String(e._id), e]));
      const rows = list.map((a) => ({
        employee: emps.get(String(a.employeeId))?.name ?? '',
        code: emps.get(String(a.employeeId))?.code ?? '',
        advanceNo: a.advanceNo,
        date: a.businessDate,
        givenPaise: a.amountPaise,
        installmentPaise: a.installmentPaise,
        recoveredPaise: a.recoveredPaise,
        balancePaise: a.amountPaise - a.recoveredPaise,
        _links: { employee: `/hr/employees/${a.employeeId}` },
      }));
      const totals = totalsOf(rows, ['givenPaise', 'recoveredPaise', 'balancePaise']);
      return {
        columns: [
          col('employee', 'Employee'),
          col('code', 'Code'),
          col('advanceNo', 'Advance'),
          col('date', 'Given on', 'date'),
          col('givenPaise', 'Given', 'money'),
          col('installmentPaise', 'Per month', 'money'),
          col('recoveredPaise', 'Recovered', 'money', { tone: 'paid' }),
          col('balancePaise', 'Balance', 'money', { strong: true, tone: 'due' }),
        ],
        rows,
        totals,
        summary: [
          { label: 'Open advances', value: rows.length, type: 'number' },
          { label: 'Given', value: totals.givenPaise, type: 'money' },
          { label: 'Still to recover', value: totals.balancePaise, type: 'money', tone: 'due' },
        ],
      };
    },
  },

  // ------------------------------------------------ accounts
  {
    key: 'day-book',
    group: 'Tax & finance',
    title: 'Day book',
    description: 'Every accounting entry in the period, line by line.',
    permission: 'report.finance',
    filters: ['range', 'branch'],
    async run({ from, to, branchId }) {
      const scope = await lineBranches(branchId);
      const branchFilter = scope ? { 'lines.branchId': { $in: scope } } : {};
      const entries = await JournalEntry.find({ ...branchFilter, businessDate: { $gte: from, $lte: to } }).sort({ date: 1 }).limit(ROW_LIMIT).lean();
      const accounts = new Map((await Account.find().select('name code').lean()).map((a) => [String(a._id), a]));
      const rows = entries.flatMap((e) =>
        e.lines.map((l, i) => ({
          date: i === 0 ? e.businessDate : '',
          voucherNo: i === 0 ? e.voucherNo : '',
          narration: i === 0 ? (e.narration ?? e.source?.docNo ?? '') : '',
          account: accounts.get(String(l.accountId))?.name ?? '',
          debitPaise: l.debitPaise || null,
          creditPaise: l.creditPaise || null,
        })),
      );
      const totals = { debitPaise: sum(rows, (r) => r.debitPaise), creditPaise: sum(rows, (r) => r.creditPaise) };
      return {
        columns: [col('date', 'Date', 'date'), col('voucherNo', 'Voucher'), col('narration', 'Narration'), col('account', 'Account'), col('debitPaise', 'Debit', 'money'), col('creditPaise', 'Credit', 'money')],
        rows,
        totals,
        summary: [
          { label: 'Vouchers', value: entries.length, type: 'number' },
          { label: 'Total debit', value: totals.debitPaise, type: 'money' },
          { label: 'Total credit', value: totals.creditPaise, type: 'money' },
        ],
      };
    },
  },
  {
    key: 'cash-book',
    group: 'Tax & finance',
    title: 'Cash & bank book',
    description: 'Money in and out of cash or bank with running balance.',
    permission: 'report.finance',
    filters: ['range', 'branch', 'account'],
    async run({ from, to, branchId, account = 'cash' }) {
      const acc = await Account.findOne({ systemKey: account }).lean();
      if (!acc) return { columns: [], rows: [], totals: {}, summary: [], note: 'No entries yet.' };
      const scope = await lineBranches(branchId);
      const lineMatch = { 'lines.accountId': acc._id, ...(scope && { 'lines.branchId': { $in: scope } }) };
      const pipeline = (match) => [
        { $match: match },
        { $unwind: '$lines' },
        { $match: { 'lines.accountId': acc._id, ...(scope && { 'lines.branchId': { $in: scope } }) } },
      ];
      const [openingAgg, list] = await Promise.all([
        JournalEntry.aggregate([...pipeline({ ...lineMatch, businessDate: { $lt: from } }), { $group: { _id: null, dr: { $sum: '$lines.debitPaise' }, cr: { $sum: '$lines.creditPaise' } } }]),
        JournalEntry.aggregate([...pipeline({ ...lineMatch, businessDate: { $gte: from, $lte: to } }), { $sort: { date: 1 } }, { $limit: ROW_LIMIT }]),
      ]);
      const opening = (openingAgg[0]?.dr ?? 0) - (openingAgg[0]?.cr ?? 0);
      let balance = opening;
      const rows = [
        { date: from, voucherNo: '', narration: 'Opening balance', inPaise: null, outPaise: null, balancePaise: opening },
        ...list.map((e) => {
          balance += e.lines.debitPaise - e.lines.creditPaise;
          return { date: e.businessDate, voucherNo: e.voucherNo, narration: e.narration ?? e.source?.docNo ?? '', inPaise: e.lines.debitPaise || null, outPaise: e.lines.creditPaise || null, balancePaise: balance };
        }),
      ];
      const inTotal = sum(rows, (r) => r.inPaise);
      const outTotal = sum(rows, (r) => r.outPaise);
      return {
        columns: [col('date', 'Date', 'date'), col('voucherNo', 'Voucher'), col('narration', 'Narration'), col('inPaise', 'Money in', 'money', { tone: 'paid' }), col('outPaise', 'Money out', 'money', { tone: 'due' }), col('balancePaise', 'Balance', 'money', { strong: true, signed: true })],
        rows,
        totals: { inPaise: inTotal, outPaise: outTotal, balancePaise: balance },
        summary: [
          { label: 'Opening', value: opening, type: 'money' },
          { label: 'Money in', value: inTotal, type: 'money', tone: 'paid' },
          { label: 'Money out', value: outTotal, type: 'money', tone: 'due' },
          { label: 'Closing', value: balance, type: 'money' },
        ],
      };
    },
  },
  {
    key: 'trial-balance',
    group: 'Tax & finance',
    title: 'Trial balance',
    description: 'Balance of every ledger account up to the end date.',
    permission: 'report.finance',
    filters: ['asOf', 'branch'],
    async run({ to, branchId }) {
      const scope = await lineBranches(branchId);
      const agg = await JournalEntry.aggregate([
        { $match: { businessDate: { $lte: to } } },
        { $unwind: '$lines' },
        ...(scope ? [{ $match: { 'lines.branchId': { $in: scope } } }] : []),
        { $group: { _id: '$lines.accountId', dr: { $sum: '$lines.debitPaise' }, cr: { $sum: '$lines.creditPaise' } } },
      ]);
      const accounts = new Map((await Account.find().lean()).map((a) => [String(a._id), a]));
      const order = { asset: 1, liability: 2, equity: 3, income: 4, expense: 5 };
      const rows = agg
        .map((g) => {
          const a = accounts.get(String(g._id));
          const bal = g.dr - g.cr;
          return { code: a?.code ?? '', account: a?.name ?? '', group: (a?.group ?? '').replace(/^./, (c) => c.toUpperCase()), debitPaise: bal > 0 ? bal : null, creditPaise: bal < 0 ? -bal : null, _order: order[a?.group] ?? 9 };
        })
        .filter((r) => r.debitPaise || r.creditPaise)
        .sort((a, b) => a._order - b._order || a.code.localeCompare(b.code));
      const totals = { debitPaise: sum(rows, (r) => r.debitPaise), creditPaise: sum(rows, (r) => r.creditPaise) };
      return {
        columns: [col('code', 'Code'), col('account', 'Account'), col('group', 'Group'), col('debitPaise', 'Debit', 'money'), col('creditPaise', 'Credit', 'money')],
        rows,
        totals,
        summary: [
          { label: 'Accounts', value: rows.length, type: 'number' },
          { label: 'Total debit', value: totals.debitPaise, type: 'money' },
          { label: 'Total credit', value: totals.creditPaise, type: 'money' },
          { label: 'Difference', value: totals.debitPaise - totals.creditPaise, type: 'money', tone: totals.debitPaise === totals.creditPaise ? 'paid' : 'due' },
        ],
      };
    },
  },
];

const BY_KEY = new Map(REPORTS.map((r) => [r.key, r]));
const allowed = (r) => can(r.permission) && (!r.extraPermission || can(r.extraPermission));

/** The reports this user may run, grouped for the hub page. */
export function listReports() {
  return REPORTS.filter(allowed).map(({ key, group, title, description, filters }) => ({ key, group, title, description, filters }));
}

export async function runReport(key, query) {
  const report = BY_KEY.get(key);
  if (!report) throw ApiError.notFound('Report');
  if (!allowed(report)) throw ApiError.forbidden('You do not have access to this report');
  const today = await todayContext();
  const params = {
    from: query.from ?? `${today.businessDate.slice(0, 7)}-01`,
    to: query.to ?? today.businessDate,
    month: query.month ?? today.businessDate.slice(0, 7),
    branchId: query.branchId,
    account: query.account,
  };
  if (params.from > params.to) throw ApiError.badRequest('“From” date is after “To” date', [{ path: 'from', message: 'Must be on or before the To date' }], 'VALIDATION_ERROR');
  const result = await report.run(params);
  const truncated = result.rows.length > ROW_LIMIT;
  return {
    key,
    group: report.group,
    title: report.title,
    description: report.description,
    filters: report.filters,
    params,
    ...result,
    rows: truncated ? result.rows.slice(0, ROW_LIMIT) : result.rows,
    note: [result.note, truncated ? `Showing the first ${ROW_LIMIT} rows — narrow the dates or branch to see the rest.` : null].filter(Boolean).join(' ') || null,
    generatedAt: new Date(),
  };
}
