import { PAYROLL_STATUS } from '@jerp/shared';
import { Account } from '../../core/ledger/account.model.js';
import { ensureSystemAccounts } from '../../core/ledger/posting.service.js';
import { JournalEntry } from '../../core/ledger/journalEntry.model.js';
import { businessDateFor, todayContext } from '../../utils/businessDate.js';
import { accessibleBranchFilter, oid, requireBranch } from '../inventory/inventory.helpers.js';
import { PayrollRun } from '../hr/hr.models.js';
import { LIVE_BILL, Purchase } from '../purchases/purchase.model.js';
import { Supplier } from '../suppliers/supplier.model.js';
import { SupplierPayment } from '../suppliers/supplierPayment.model.js';
import { openingDueLeft } from '../suppliers/supplierPayment.service.js';
import { Expense } from './expense.model.js';

/*
 * Profit & expenses, every figure counted once and from where it is really recorded:
 *   Sales          — the sales account in the ledger: bills before GST, less sales returns (GST is the government's).
 *   Cost of goods  — the cost of the pieces sold (cogs account), less pieces returned. Purchases are stock, not an
 *                    expense: they reach profit only as cost of goods when sold, so they are never counted again.
 *   Shop expenses  — expense entries (electricity, rent, …), voided ones excluded.
 *   Salary         — finalised payroll, in the month the salary is for (earned + bonus − other deductions).
 *   Other          — stock written off or found (adjustments) and round-off on bills.
 * Gross profit = sales − cost of goods; net profit = gross profit − shop expenses − salary − other.
 * Customer advances and receipts, supplier dues and payments move cash, not profit — they are shown apart, as cash.
 */

const LEDGER_KEYS = ['sales', 'cogs', 'stock_loss', 'stock_gain', 'round_off'];
const monthBounds = (month) => {
  const [y, m] = month.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(days).padStart(2, '0')}`, days };
};
const shiftMonth = (month, by) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
};
const dayList = (from, to) => {
  const out = [];
  for (let d = new Date(`${from}T00:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
};

async function scopeFor(branchId) {
  if (!branchId) return { lines: accessibleBranchFilter('lines.branchId'), docs: accessibleBranchFilter() };
  await requireBranch(branchId, { active: false });
  return { lines: { 'lines.branchId': oid(branchId) }, docs: { branchId: oid(branchId) } };
}

/** Per-day figures from `from` to `to`: { [date]: { sales, cogs, shop, salary, other } } (paise). */
async function dailyFigures(from, to, scope, today) {
  await ensureSystemAccounts();
  const accounts = await Account.find({ systemKey: { $in: LEDGER_KEYS } }).select('systemKey').lean();
  const keyById = new Map(accounts.map((a) => [String(a._id), a.systemKey]));
  const [ledger, expenses, runs] = await Promise.all([
    JournalEntry.aggregate([
      { $match: { businessDate: { $gte: from, $lte: to }, 'lines.accountId': { $in: accounts.map((a) => a._id) } } },
      { $unwind: '$lines' },
      { $match: { 'lines.accountId': { $in: accounts.map((a) => a._id) }, ...scope.lines } },
      { $group: { _id: { date: '$businessDate', account: '$lines.accountId' }, debit: { $sum: '$lines.debitPaise' }, credit: { $sum: '$lines.creditPaise' } } },
    ]),
    Expense.aggregate([{ $match: { status: 'active', date: { $gte: from, $lte: to }, ...scope.docs } }, { $group: { _id: '$date', amount: { $sum: '$amountPaise' } } }]),
    PayrollRun.find({ status: { $in: [PAYROLL_STATUS.FINALISED, PAYROLL_STATUS.PAID] }, month: { $gte: from.slice(0, 7), $lte: to.slice(0, 7) }, ...scope.docs }).select('month lines finalisedAt').lean(),
  ]);

  const days = {};
  const day = (d) => (days[d] ??= { sales: 0, cogs: 0, shop: 0, salary: 0, other: 0 });
  for (const r of ledger) {
    const d = day(r._id.date);
    const key = keyById.get(String(r._id.account));
    if (key === 'sales') d.sales += r.credit - r.debit;
    else if (key === 'cogs') d.cogs += r.debit - r.credit;
    else d.other += r.debit - r.credit; // stock loss (debit) is a cost; stock gain and round-off received (credit) reduce it
  }
  for (const r of expenses) day(r._id).shop += r.amount;
  // A month's salary is that month's cost: placed on the day it was finalised if that falls in the month, else on the
  // month's last day (or today, for the running month).
  for (const run of runs) {
    const amount = run.lines.reduce((n, l) => n + (l.earnedPaise ?? 0) + (l.bonusPaise ?? 0) - (l.otherDeductionPaise ?? 0), 0);
    const { from: mFrom, to: mTo } = monthBounds(run.month);
    const finalised = run.finalisedAt ? businessDateFor(run.finalisedAt, today.timezone) : null;
    const on = finalised && finalised >= mFrom && finalised <= mTo ? finalised : mTo < today.businessDate ? mTo : today.businessDate;
    day(on).salary += amount;
  }
  return days;
}

function totalsOf(days, dates) {
  const t = { salesPaise: 0, cogsPaise: 0, shopExpensesPaise: 0, salaryPaise: 0, otherPaise: 0 };
  for (const d of dates) {
    const x = days[d];
    if (!x) continue;
    t.salesPaise += x.sales;
    t.cogsPaise += x.cogs;
    t.shopExpensesPaise += x.shop;
    t.salaryPaise += x.salary;
    t.otherPaise += x.other;
  }
  t.grossProfitPaise = t.salesPaise - t.cogsPaise;
  t.expensesPaise = t.shopExpensesPaise + t.salaryPaise;
  t.netProfitPaise = t.grossProfitPaise - t.expensesPaise - t.otherPaise;
  return t;
}

/** Money paid to suppliers in the period (bill payments and payments on their old balance) — cash, not profit. */
async function supplierCash(from, to, scope) {
  const [bills, purchases, oldBalance, suppliers] = await Promise.all([
    Purchase.aggregate([{ $match: { ...scope.docs, ...LIVE_BILL } }, { $unwind: '$payments' }, { $match: { 'payments.date': { $gte: from, $lte: to } } }, { $group: { _id: null, amount: { $sum: '$payments.amountPaise' } } }]),
    Purchase.aggregate([{ $match: { ...scope.docs, ...LIVE_BILL, billDate: { $gte: from, $lte: to } } }, { $group: { _id: null, amount: { $sum: '$totals.totalPaise' }, bills: { $sum: 1 } } }]),
    SupplierPayment.aggregate([{ $match: { ...scope.docs, status: { $ne: 'void' }, date: { $gte: from, $lte: to } } }, { $unwind: '$allocations' }, { $match: { 'allocations.purchaseId': null } }, { $group: { _id: null, amount: { $sum: '$allocations.amountPaise' } } }]),
    Supplier.find({ isDeleted: false }).select('openingBalancePaise openingDuePaidPaise').lean(),
  ]);
  const [due] = await Purchase.aggregate([{ $match: { ...scope.docs, ...LIVE_BILL, paymentStatus: { $ne: 'paid' } } }, { $group: { _id: null, amount: { $sum: { $subtract: ['$totals.totalPaise', '$paidPaise'] } } } }]);
  return {
    purchasesPaise: purchases[0]?.amount ?? 0,
    purchaseBills: purchases[0]?.bills ?? 0,
    paidToSuppliersPaise: (bills[0]?.amount ?? 0) + (oldBalance[0]?.amount ?? 0),
    // Old balances are owed by the business, not a branch: included only when looking at every branch.
    supplierDuePaise: (due?.amount ?? 0) + (Object.keys(scope.docs).length ? 0 : suppliers.reduce((n, s) => n + openingDueLeft(s), 0)),
  };
}

/** Shop expenses by category in the period, biggest first. */
async function byCategory(from, to, scope) {
  const rows = await Expense.aggregate([
    { $match: { status: 'active', date: { $gte: from, $lte: to }, ...scope.docs } },
    { $group: { _id: '$categoryName', amount: { $sum: '$amountPaise' }, count: { $sum: 1 } } },
    { $sort: { amount: -1 } },
  ]);
  return rows.map((r) => ({ name: r._id, amountPaise: r.amount, count: r.count }));
}

/**
 * One month at a glance: daily sales and expenses (for the chart), the month's profit lines, last month's for
 * comparison, the last six months' trend, expenses by category, and money to and from suppliers.
 */
export async function financeSummary({ month: chosen, branchId }) {
  const today = await todayContext();
  const month = chosen ?? today.businessDate.slice(0, 7);
  const scope = await scopeFor(branchId);
  const { from, to } = monthBounds(month);
  const trendFrom = monthBounds(shiftMonth(month, -5)).from;
  const days = await dailyFigures(trendFrom, to, scope, today);
  const dates = dayList(from, to);
  const prev = monthBounds(shiftMonth(month, -1));

  const [categories, cash] = await Promise.all([byCategory(from, to, scope), supplierCash(from, to, scope)]);
  return {
    month,
    from,
    to,
    today: today.businessDate,
    days: dates.map((d) => ({ date: d, future: d > today.businessDate, salesPaise: days[d]?.sales ?? 0, expensesPaise: (days[d]?.shop ?? 0) + (days[d]?.salary ?? 0) })),
    totals: totalsOf(days, dates),
    previous: { month: shiftMonth(month, -1), ...totalsOf(days, dayList(prev.from, prev.to)) },
    months: Array.from({ length: 6 }, (_, i) => {
      const m = shiftMonth(month, i - 5);
      const b = monthBounds(m);
      return { month: m, ...totalsOf(days, dayList(b.from, b.to)) };
    }),
    byCategory: categories,
    cash,
  };
}
