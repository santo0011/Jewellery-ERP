import { DEFAULT_EXPENSE_CATEGORIES } from '@jerp/shared';
import { withTransaction } from '../../config/db.js';
import { AUDIT_ACTIONS, recordAudit } from '../../core/audit/audit.service.js';
import { requireContext } from '../../core/context/requestContext.js';
import { PAYMENT_ACCOUNT } from '../../core/ledger/paymentAccounts.js';
import { postJournal, reverseJournalsFor } from '../../core/ledger/posting.service.js';
import { nextDocumentNo } from '../../core/numbering/numbering.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { financialYearLabel, todayContext } from '../../utils/businessDate.js';
import { paginate } from '../../utils/pagination.js';
import { accessibleBranchFilter, nameMaps, oid, pick, requireBranch } from '../inventory/inventory.helpers.js';
import { Expense, ExpenseCategory } from './expense.model.js';

/*
 * Shop expenses: electricity, rent, transport and the like, paid when entered. Each one is a journal on its own date
 * (shop expenses Dr / cash or bank Cr), so the books, the cash book and the profit report all see it once. Salary is
 * not an expense here — Payroll books it — and purchases are stock, not expenses (they reach profit as cost of goods).
 */

const keyOf = (name) => name.trim().toLowerCase().replace(/\s+/g, ' ');
const at = (date, today) => (date === today.businessDate ? today.now : new Date(`${date}T12:00:00+05:30`));
const FIELD_LABEL = { categoryName: 'Category', date: 'Date', amountPaise: 'Amount', mode: 'Paid by', reference: 'Reference', note: 'Description' };

// ---------------------------------------------------------------- categories

/** The standard heads, added the first time an organisation opens expenses (and any it is missing later). */
async function ensureDefaults() {
  const have = new Set((await ExpenseCategory.find({}).select('key').lean()).map((c) => c.key));
  const missing = DEFAULT_EXPENSE_CATEGORIES.filter((n) => !have.has(keyOf(n)));
  if (missing.length && have.size === 0) {
    await ExpenseCategory.insertMany(missing.map((name) => ({ name, key: keyOf(name), isSystem: true })), { ordered: false }).catch(() => {});
  }
}

const serializeCategory = (c, usage) => ({ id: c._id, name: c.name, isSystem: c.isSystem, status: c.status, used: usage?.get(String(c._id)) ?? 0 });

export async function listCategories() {
  await ensureDefaults();
  const [list, used] = await Promise.all([
    ExpenseCategory.find({}).sort({ isSystem: -1, name: 1 }).lean(),
    Expense.aggregate([{ $match: { status: 'active' } }, { $group: { _id: '$categoryId', n: { $sum: 1 } } }]),
  ]);
  const usage = new Map(used.map((u) => [String(u._id), u.n]));
  return list.map((c) => serializeCategory(c, usage));
}

async function assertNameFree(name, exceptId) {
  const clash = await ExpenseCategory.findOne({ key: keyOf(name), ...(exceptId && { _id: { $ne: exceptId } }) }).lean();
  if (clash) throw ApiError.conflict(`${clash.name} already exists`, 'DUPLICATE', [{ path: 'name', message: 'Already exists' }]);
}

export async function createCategory({ name }) {
  await assertNameFree(name);
  const doc = await ExpenseCategory.create({ name: name.trim(), key: keyOf(name), createdBy: requireContext().userId });
  await recordAudit({ action: AUDIT_ACTIONS.CREATE, module: 'expense', recordType: 'ExpenseCategory', recordId: doc._id, meta: { name: doc.name } });
  return serializeCategory(doc.toObject());
}

export async function renameCategory(id, { name }) {
  const cat = await ExpenseCategory.findById(id);
  if (!cat) throw ApiError.notFound('Category');
  await assertNameFree(name, cat._id);
  const from = cat.name;
  cat.set({ name: name.trim(), key: keyOf(name) });
  await cat.save();
  // Past expenses keep the name they were entered under only as a snapshot; show the new name on them too.
  await Expense.updateMany({ categoryId: cat._id }, { $set: { categoryName: cat.name } });
  await recordAudit({ action: AUDIT_ACTIONS.UPDATE, module: 'expense', recordType: 'ExpenseCategory', recordId: cat._id, meta: { name: cat.name }, changes: [{ field: 'name', from, to: cat.name }] });
  return serializeCategory(cat.toObject());
}

async function activeCategory(id) {
  const cat = await ExpenseCategory.findOne({ _id: id, status: 'active' }).lean();
  if (!cat) throw ApiError.badRequest('Pick a category', [{ path: 'categoryId', message: 'Unknown category' }], 'VALIDATION_ERROR');
  return cat;
}

// ---------------------------------------------------------------- expenses

function serialize(e, maps) {
  return {
    id: e._id,
    expenseNo: e.expenseNo,
    branch: pick(maps.branches, e.branchId) ?? { id: e.branchId },
    category: { id: e.categoryId, name: e.categoryName },
    date: e.date,
    amountPaise: e.amountPaise,
    mode: e.mode,
    reference: e.reference,
    note: e.note,
    status: e.status,
    history: (e.history ?? []).map((h) => ({ action: h.action, at: h.at, by: pick(maps.users, h.by) ?? null, reason: h.reason, changes: h.changes ?? [] })),
    createdBy: pick(maps.users, e.createdBy) ?? null,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

const mapsFor = (list) => nameMaps({ branchIds: list.map((e) => e.branchId), userIds: list.flatMap((e) => [e.createdBy, ...(e.history ?? []).map((h) => h.by)]) });

export async function listExpenses({ page, limit, q, from, to, categoryId, branchId, status }) {
  await ensureDefaults();
  const filter = { ...accessibleBranchFilter() };
  if (branchId) filter.branchId = oid(branchId);
  if (categoryId) filter.categoryId = oid(categoryId);
  if (from || to) filter.date = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ expenseNo: rx }, { categoryName: rx }, { note: rx }, { reference: rx }];
  }
  const listFilter = { ...filter, ...(status && { status }) };
  const { items, meta } = await paginate(Expense.find(listFilter).sort({ date: -1, createdAt: -1 }), Expense.countDocuments(listFilter), { page, limit });
  // The summary is over the whole filter (not just this page), active expenses only.
  const [summary] = await Expense.aggregate([
    { $match: { ...filter, status: 'active' } },
    { $facet: { total: [{ $group: { _id: null, amount: { $sum: '$amountPaise' }, count: { $sum: 1 } } }], byCategory: [{ $group: { _id: '$categoryName', amount: { $sum: '$amountPaise' }, count: { $sum: 1 } } }, { $sort: { amount: -1 } }] } },
  ]);
  const maps = await mapsFor(items);
  return {
    items: items.map((e) => serialize(e, maps)),
    meta: {
      ...meta,
      summary: {
        totalPaise: summary.total[0]?.amount ?? 0,
        count: summary.total[0]?.count ?? 0,
        byCategory: summary.byCategory.map((c) => ({ name: c._id, amountPaise: c.amount, count: c.count })),
      },
    },
  };
}

async function findExpense(id) {
  const e = await Expense.findOne({ _id: id, ...accessibleBranchFilter() });
  if (!e) throw ApiError.notFound('Expense');
  return e;
}

export async function getExpense(id) {
  const e = (await findExpense(id)).toObject();
  return serialize(e, await mapsFor([e]));
}

async function postExpense(e, today, { session }) {
  await postJournal(
    {
      voucherType: 'expense',
      date: at(e.date, today),
      businessDate: e.date,
      financialYear: financialYearLabel(e.date, today.fyStartMonth),
      narration: `${e.categoryName}${e.note ? ` · ${e.note}` : ''} (${e.expenseNo})`,
      source: { docType: 'expense', docId: e._id, docNo: e.expenseNo },
      lines: [
        { account: 'shop_expenses', debit: e.amountPaise, branchId: e.branchId },
        { account: PAYMENT_ACCOUNT[e.mode] ?? 'cash', credit: e.amountPaise, branchId: e.branchId },
      ],
    },
    { session },
  );
}

/** Reverses an expense's journal on its own date, so the month it belongs to stays right. */
async function unpostExpense(e, today, narration, { session }) {
  await reverseJournalsFor({ docType: 'expense', docId: e._id }, { date: at(e.date, today), businessDate: e.date, financialYear: financialYearLabel(e.date, today.fyStartMonth), narration }, { session });
}

function assertDate(date, today) {
  if (date > today.businessDate) throw ApiError.badRequest('Expense date cannot be in the future', [{ path: 'date', message: 'Pick today or an earlier date' }], 'VALIDATION_ERROR');
}

export async function createExpense(input) {
  const { userId } = requireContext();
  const branch = await requireBranch(input.branchId);
  const cat = await activeCategory(input.categoryId);
  const today = await todayContext();
  assertDate(input.date, today);
  const doc = await withTransaction(async (session) => {
    const expenseNo = await nextDocumentNo({ prefix: 'EXP', branchCode: branch.code, financialYear: financialYearLabel(input.date, today.fyStartMonth) }, { session });
    const [e] = await Expense.create(
      [
        {
          expenseNo,
          branchId: branch._id,
          categoryId: cat._id,
          categoryName: cat.name,
          date: input.date,
          amountPaise: input.amountPaise,
          mode: input.mode,
          reference: input.reference ?? null,
          note: input.note ?? null,
          history: [{ action: 'created', at: today.now, by: userId }],
          createdBy: userId,
        },
      ],
      { session },
    );
    await postExpense(e, today, { session });
    await recordAudit({ action: AUDIT_ACTIONS.CREATE, module: 'expense', recordType: 'Expense', recordId: e._id, meta: { name: expenseNo, category: cat.name, amountPaise: e.amountPaise } }, { session });
    return e;
  });
  return getExpense(doc._id);
}

/** Corrects an expense: its journal is reversed and posted again on the (new) date, with the reason kept. */
export async function updateExpense(id, { reason, ...input }) {
  const { userId } = requireContext();
  const e = await findExpense(id);
  if (e.status !== 'active') throw ApiError.conflict('A voided expense cannot be edited', 'INVALID_STATE');
  const cat = await activeCategory(input.categoryId);
  const today = await todayContext();
  assertDate(input.date, today);
  const next = { categoryId: cat._id, categoryName: cat.name, date: input.date, amountPaise: input.amountPaise, mode: input.mode, reference: input.reference ?? null, note: input.note ?? null };
  const changes = Object.keys(FIELD_LABEL)
    .filter((k) => String(e[k] ?? '') !== String(next[k] ?? ''))
    .map((k) => ({ field: FIELD_LABEL[k], from: e[k] ?? null, to: next[k] ?? null }));
  if (!changes.length) throw ApiError.badRequest('Nothing was changed', [{ path: 'amountPaise', message: 'Change something to save' }], 'NO_CHANGES');

  await withTransaction(async (session) => {
    await unpostExpense(e, today, `Corrected ${e.expenseNo}: ${reason}`, { session });
    e.set({ ...next, updatedBy: userId });
    e.history.push({ action: 'edited', at: today.now, by: userId, reason, changes });
    await e.save({ session });
    await postExpense(e, today, { session });
    await recordAudit({ action: AUDIT_ACTIONS.UPDATE, module: 'expense', recordType: 'Expense', recordId: e._id, meta: { name: e.expenseNo, reason }, changes: changes.map((c) => ({ field: c.field, from: c.from, to: c.to })) }, { session });
  });
  return getExpense(id);
}

/** Cancels an expense: its journal is reversed on its date; the record stays (marked void, with the reason). */
export async function voidExpense(id, { reason }) {
  const { userId } = requireContext();
  const e = await findExpense(id);
  if (e.status !== 'active') throw ApiError.conflict('This expense is already voided', 'INVALID_STATE');
  const today = await todayContext();
  await withTransaction(async (session) => {
    await unpostExpense(e, today, `Voided ${e.expenseNo}: ${reason}`, { session });
    e.set({ status: 'void', updatedBy: userId });
    e.history.push({ action: 'voided', at: today.now, by: userId, reason });
    await e.save({ session });
    await recordAudit({ action: AUDIT_ACTIONS.CANCEL, module: 'expense', recordType: 'Expense', recordId: e._id, meta: { name: e.expenseNo, reason, amountPaise: e.amountPaise } }, { session });
  });
  return getExpense(id);
}
