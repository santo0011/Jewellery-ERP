import { z } from 'zod';
import { EXPENSE_PAY_MODES, METAL_OPTIONS, SELECTABLE_METAL_POOL_KINDS, PURITIES } from '../enums.js';
import { listQuerySchema, objectIdSchema, optionalText, requiredText } from './common.js';

const values = (list) => list.map((o) => o.value);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date');
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');
const paise = (label, { min = 0 } = {}) => z.number({ error: `${label} is required` }).int().min(min, min ? `${label} must be more than zero` : `${label} cannot be negative`).max(1e13);
const mg = (label) => z.number({ error: `${label} is required` }).int().min(1, `${label} must be more than zero`).max(1e9);

// ---------------------------------------------------------------- shop expenses

export const expenseCategorySchema = z.object({ name: requiredText('Category name', { min: 2, max: 60 }) });

/** A shop expense, paid when it is entered (cash / UPI / bank / card). Salary is not entered here — Payroll books it. */
export const expenseSchema = z.object({
  branchId: objectIdSchema,
  categoryId: objectIdSchema,
  date: isoDate,
  amountPaise: paise('Amount', { min: 1 }),
  mode: z.enum(values(EXPENSE_PAY_MODES), { error: 'Select how it was paid' }),
  reference: optionalText(60),
  note: optionalText(300),
});

export const expenseUpdateSchema = expenseSchema.omit({ branchId: true }).extend({ reason: requiredText('Reason', { min: 3, max: 200 }) });
export const expenseVoidSchema = z.object({ reason: requiredText('Reason', { min: 3, max: 200 }) });

export const expenseListQuerySchema = listQuerySchema.extend({
  from: isoDate.optional(),
  to: isoDate.optional(),
  categoryId: objectIdSchema.optional(),
  branchId: objectIdSchema.optional(),
  status: z.enum(['active', 'void']).optional(),
});

/** Profit & expenses for one month (daily figures inside it), optionally one branch. */
export const financeSummaryQuerySchema = z.object({ month: month.optional(), branchId: objectIdSchema.optional() });

// ---------------------------------------------------------------- making jewellery from raw metal

const metalUseSchema = z
  .object({
    metal: z.enum(values(METAL_OPTIONS)),
    purity: z.number().int(),
    kind: z.enum(values(SELECTABLE_METAL_POOL_KINDS)),
    grossWeightMg: mg('Weight'),
  })
  .refine((l) => (PURITIES[l.metal] ?? []).some((p) => p.fineness === l.purity), { message: 'Pick a valid purity', path: ['purity'] });

const madePieceSchema = z.object({
  itemId: objectIdSchema,
  grossWeightMg: mg('Weight'),
  huid: z.string().trim().regex(/^[A-Za-z0-9]{6}$/, 'HUID is 6 letters or digits').optional(),
});

/**
 * Jewellery made from the raw metal stock: the metal used comes out of the metal stock, the pieces made go into
 * Products (ready to sell) at the metal's cost plus the making charge.
 */
export const productionSchema = z.object({
  branchId: objectIdSchema,
  metalUsed: z.array(metalUseSchema).min(1, 'Add the metal used').max(20),
  pieces: z.array(madePieceSchema).min(1, 'Add the pieces made').max(100),
  makingPaise: paise('Making charge').default(0),
  makingMode: z.enum(['cash', 'bank', 'upi']).optional(),
  note: optionalText(300),
});
