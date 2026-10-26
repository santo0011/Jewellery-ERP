import { sameValues } from '../undo/undo.helpers.js';
import { Expense, ExpenseCategory } from './expense.model.js';
import { renameCategory, updateExpense, voidExpense } from './expense.service.js';

const formOf = (x) => ({ categoryId: String(x.categoryId), date: x.date, amountPaise: x.amountPaise, mode: x.mode, reference: x.reference ?? null, note: x.note ?? null });

export const expenseUndoHandlers = [
  {
    // Voided, not deleted: its entry is reversed and it stays on the list, marked void.
    type: 'expense.create',
    title: 'Expense recorded',
    mode: 'reversal',
    permission: 'expense.delete',
    async check(entry) {
      const e = await Expense.findById(entry.recordId).lean();
      if (!e || e.status !== 'active') return { superseded: true, reason: 'Already voided' };
      return { ok: true, effect: `Voids ${e.expenseNo} and reverses its entry (the money comes back).` };
    },
    run: async (entry, { reason }) => {
      await voidExpense(entry.recordId, { reason });
    },
  },
  {
    // Corrected back: its entry is reversed and posted again with the earlier figures; the edit stays in its history.
    type: 'expense.update',
    title: 'Expense corrected',
    mode: 'undo',
    permission: 'expense.edit',
    async check(entry) {
      const e = await Expense.findById(entry.recordId).lean();
      if (!e || e.status !== 'active') return { superseded: true, reason: 'The expense was voided' };
      if (!sameValues(formOf(e), entry.data.after)) return { ok: false, reason: 'It was corrected again since.' };
      if (!(await ExpenseCategory.exists({ _id: entry.data.before.categoryId, status: 'active' }))) return { ok: false, reason: 'Its earlier category is no longer active.' };
      return { ok: true, effect: 'Puts the expense back as it was (its entry is reposted).' };
    },
    run: async (entry, { reason }) => {
      await updateExpense(entry.recordId, { ...entry.data.before, reason: `Undo: ${reason}` });
    },
  },
  {
    type: 'expenseCategory.create',
    title: 'Expense category added',
    mode: 'undo',
    permission: 'expense.edit',
    async check(entry) {
      if (!(await ExpenseCategory.exists({ _id: entry.recordId }))) return { superseded: true, reason: 'Already removed' };
      const used = await Expense.countDocuments({ categoryId: entry.recordId });
      if (used) return { ok: false, reason: `${used} expense${used === 1 ? ' is' : 's are'} recorded under it.` };
      return { ok: true, effect: `Removes the category ${entry.label}.` };
    },
    run: async (entry) => {
      await ExpenseCategory.deleteOne({ _id: entry.recordId });
    },
  },
  {
    type: 'expenseCategory.rename',
    title: 'Expense category renamed',
    mode: 'undo',
    permission: 'expense.edit',
    async check(entry) {
      const cat = await ExpenseCategory.findById(entry.recordId).lean();
      if (!cat) return { superseded: true, reason: 'It was removed' };
      if (cat.name !== entry.data.to) return { ok: false, reason: 'It was renamed again since.' };
      return { ok: true, effect: `Renames it back to ${entry.data.from}.` };
    },
    run: async (entry) => {
      await renameCategory(entry.recordId, { name: entry.data.from });
    },
  },
];
