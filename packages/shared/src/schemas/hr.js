import { z } from 'zod';
import { ATTENDANCE_STATUSES, EMPLOYMENT_STATUS, SALARY_PAYMENT_MODES } from '../enums.js';
import { emailSchema, listQuerySchema, mobileSchema, objectIdSchema, optional, optionalText, panSchema, requiredText } from './common.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');
const paise = (label, { min = 0 } = {}) =>
  z.number({ error: `${label} is required` }).int(`${label} must be a whole number`).min(min, min ? `${label} must be more than zero` : `${label} cannot be negative`).max(1e11);

export const employeeSchema = z.object({
  name: requiredText('Name', { min: 2, max: 120 }),
  mobile: mobileSchema,
  email: optional(emailSchema),
  designation: requiredText('Designation', { max: 80 }),
  branchId: objectIdSchema,
  joiningDate: isoDate,
  basicPaise: paise('Basic salary', { min: 1 }),
  allowancePaise: paise('Allowance').default(0),
  pan: optional(panSchema),
  bank: z
    .object({ accountName: optionalText(120), accountNumber: optional(z.string().trim().regex(/^\d{6,20}$/, 'Enter a valid account number')), ifsc: optional(z.string().trim().toUpperCase().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Enter a valid IFSC')) })
    .default({}),
  address: optionalText(300),
  notes: optionalText(1000),
});

export const employeeStatusSchema = z.object({
  status: z.enum(Object.values(EMPLOYMENT_STATUS)),
  exitDate: optional(isoDate),
  rejoinDate: optional(isoDate),
  note: optionalText(200),
});

export const employeeListQuerySchema = listQuerySchema.extend({
  branchId: objectIdSchema.optional(),
  status: z.enum(Object.values(EMPLOYMENT_STATUS)).optional(),
});

export const attendanceQuerySchema = z.object({ branchId: objectIdSchema, date: isoDate });

export const attendanceSaveSchema = z.object({
  branchId: objectIdSchema,
  date: isoDate,
  entries: z
    .array(z.object({ employeeId: objectIdSchema, status: z.enum(ATTENDANCE_STATUSES.map((s) => s.value)), note: optionalText(120) }))
    .min(1, 'Nothing to save')
    .max(500),
});

export const attendanceRegisterQuerySchema = z.object({ branchId: objectIdSchema, month });

/** Monthly register edits. status null clears the mark (the day then counts as present). */
export const attendanceRegisterSaveSchema = z.object({
  branchId: objectIdSchema,
  month,
  entries: z
    .array(z.object({ employeeId: objectIdSchema, date: isoDate, status: z.enum(ATTENDANCE_STATUSES.map((s) => s.value)).nullable() }))
    .min(1, 'Nothing to save')
    .max(5000),
});

export const attendanceCalendarQuerySchema = z.object({ branchId: objectIdSchema });

export const attendanceCalendarSchema = z.object({
  branchId: objectIdSchema,
  weeklyOff: z.array(z.number().int().min(0).max(6)).max(6, 'Keep at least one working day').default([]),
  holidays: z
    .array(z.object({ date: isoDate, name: requiredText('Holiday name', { max: 60 }) }))
    .max(100)
    .default([])
    .refine((list) => new Set(list.map((h) => h.date)).size === list.length, 'Two holidays on the same date'),
});

export const advanceListQuerySchema = listQuerySchema.extend({
  employeeId: objectIdSchema.optional(),
  branchId: objectIdSchema.optional(),
  status: z.enum(['open', 'closed']).optional(),
});

const advanceFields = z.object({
  employeeId: objectIdSchema,
  amountPaise: paise('Amount', { min: 1 }),
  installmentPaise: paise('Monthly deduction', { min: 1 }),
  givenOn: isoDate.optional(),
  recoverFrom: month.optional(),
  mode: z.enum(SALARY_PAYMENT_MODES, { error: 'Select how it was paid' }),
  reference: optionalText(60),
  note: optionalText(300),
});
const instalmentWithinAmount = [(v) => v.installmentPaise <= v.amountPaise, { path: ['installmentPaise'], message: 'Cannot be more than the advance' }];

export const salaryAdvanceSchema = advanceFields.refine(...instalmentWithinAmount);

/** Editing an advance (same day only): the same fields, plus why it changed. */
export const salaryAdvanceUpdateSchema = advanceFields
  .omit({ employeeId: true })
  .extend({ givenOn: isoDate, reason: requiredText('Reason for the change', { min: 3, max: 200 }) })
  .refine(...instalmentWithinAmount);

export const payrollListQuerySchema = listQuerySchema.extend({ branchId: objectIdSchema.optional(), month: month.optional() });

export const payrollCreateSchema = z.object({ branchId: objectIdSchema, month });

export const payrollLineParamsSchema = z.object({ id: objectIdSchema, employeeId: objectIdSchema });

export const payrollLineSchema = z.object({
  bonusPaise: paise('Bonus').default(0),
  otherDeductionPaise: paise('Other deduction').default(0),
  advanceDeductionPaise: paise('Advance deduction').default(0),
  note: optionalText(200),
});

export const payrollPaySchema = z.object({
  employeeIds: z.array(objectIdSchema).max(500).optional(),
  mode: z.enum(SALARY_PAYMENT_MODES, { error: 'Select how salary was paid' }),
  reference: optionalText(60),
});

// Reports: every filter optional; the server fills sensible defaults (this month, all branches).
export const reportQuerySchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  month: month.optional(),
  branchId: objectIdSchema.optional(),
  account: z.enum(['cash', 'bank']).optional(),
});
export const reportParamsSchema = z.object({ key: z.string().regex(/^[a-z0-9-]{2,40}$/) });
