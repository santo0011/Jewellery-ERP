import mongoose from 'mongoose';
import { tenantPlugin } from '../../core/tenancy/tenantPlugin.js';

const { ObjectId } = mongoose.Schema.Types;

/** An expense head (Electricity, Shop rent, …). Organisations start with a standard set and can add their own. */
const expenseCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    key: { type: String, required: true }, // lower-case name, for uniqueness
    isSystem: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    createdBy: { type: ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);
expenseCategorySchema.plugin(tenantPlugin);
expenseCategorySchema.index({ organisationId: 1, key: 1 }, { unique: true });

/** What changed on an expense, and why (edits and voids keep the books' history). */
const historySchema = new mongoose.Schema(
  { action: { type: String, enum: ['created', 'edited', 'voided'], required: true }, at: { type: Date, required: true }, by: { type: ObjectId, ref: 'User' }, reason: { type: String, default: null }, changes: { type: [mongoose.Schema.Types.Mixed], default: [] } },
  { _id: false },
);

/**
 * A shop expense, paid when entered: shop expenses debited, cash / bank credited, on the expense's date. Editing reposts
 * it on the same date; voiding reverses it (kept, with the reason). Salary is not entered here — Payroll books it.
 */
const expenseSchema = new mongoose.Schema(
  {
    expenseNo: { type: String, required: true },
    branchId: { type: ObjectId, ref: 'Branch', required: true },
    categoryId: { type: ObjectId, ref: 'ExpenseCategory', required: true },
    categoryName: { type: String, required: true },
    date: { type: String, required: true }, // business date (YYYY-MM-DD)
    amountPaise: { type: Number, required: true },
    mode: { type: String, required: true },
    reference: { type: String, default: null },
    note: { type: String, default: null },
    status: { type: String, enum: ['active', 'void'], default: 'active' },
    history: { type: [historySchema], default: [] },
    createdBy: { type: ObjectId, ref: 'User', required: true },
    updatedBy: { type: ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);
expenseSchema.plugin(tenantPlugin);
expenseSchema.index({ organisationId: 1, expenseNo: 1 }, { unique: true });
expenseSchema.index({ organisationId: 1, branchId: 1, date: -1 });
expenseSchema.index({ organisationId: 1, categoryId: 1, date: -1 });

export const ExpenseCategory = mongoose.model('ExpenseCategory', expenseCategorySchema);
export const Expense = mongoose.model('Expense', expenseSchema);
