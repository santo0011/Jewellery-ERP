import mongoose from 'mongoose';
import { EMPLOYMENT_STATUS, PAYROLL_STATUS } from '@jerp/shared';
import { tenantPlugin } from '../../core/tenancy/tenantPlugin.js';

const { ObjectId } = mongoose.Schema.Types;

const employeeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true },
    name: { type: String, required: true },
    mobile: { type: String, required: true },
    email: { type: String, default: null },
    designation: { type: String, required: true },
    branchId: { type: ObjectId, ref: 'Branch', required: true },
    joiningDate: { type: String, required: true },
    exitDate: { type: String, default: null },
    status: { type: String, enum: Object.values(EMPLOYMENT_STATUS), default: EMPLOYMENT_STATUS.ACTIVE },
    basicPaise: { type: Number, required: true },
    allowancePaise: { type: Number, default: 0 },
    pan: { type: String, default: null },
    bank: { accountName: { type: String, default: null }, accountNumber: { type: String, default: null }, ifsc: { type: String, default: null } },
    address: { type: String, default: null },
    notes: { type: String, default: null },
    photoFileId: { type: ObjectId, ref: 'FileAsset', default: null },
    // Joined / left / rejoined, oldest first. Older employees have none; their history is read from the dates.
    history: {
      type: [
        new mongoose.Schema(
          { event: { type: String, enum: ['joined', 'left', 'rejoined'], required: true }, date: { type: String, required: true }, note: { type: String, default: null }, by: { type: ObjectId, ref: 'User', default: null }, at: { type: Date, default: Date.now } },
          { _id: false },
        ),
      ],
      default: [],
    },
    // Days off the rolls between leaving and rejoining (both dates included): not shown in attendance, not paid.
    breaks: { type: [new mongoose.Schema({ from: String, to: String }, { _id: false })], default: [] },
    createdBy: { type: ObjectId, ref: 'User', default: null },
    updatedBy: { type: ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);
employeeSchema.plugin(tenantPlugin);
employeeSchema.index({ organisationId: 1, code: 1 }, { unique: true });
employeeSchema.index({ organisationId: 1, mobile: 1 }, { unique: true });
employeeSchema.index({ organisationId: 1, branchId: 1, status: 1 });

/** One row per employee per day. Days without a row count as present. */
const attendanceSchema = new mongoose.Schema(
  {
    employeeId: { type: ObjectId, ref: 'Employee', required: true },
    branchId: { type: ObjectId, ref: 'Branch', required: true },
    date: { type: String, required: true },
    status: { type: String, required: true },
    note: { type: String, default: null },
    markedBy: { type: ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);
attendanceSchema.plugin(tenantPlugin);
attendanceSchema.index({ organisationId: 1, employeeId: 1, date: 1 }, { unique: true });
attendanceSchema.index({ organisationId: 1, branchId: 1, date: 1 });

/** A branch's weekly off days (0 = Sunday … 6 = Saturday) and its holiday list. Unmarked days on these count as holiday. */
const attendanceCalendarSchema = new mongoose.Schema(
  {
    branchId: { type: ObjectId, ref: 'Branch', required: true },
    weeklyOff: { type: [Number], default: [0] },
    holidays: { type: [{ _id: false, date: String, name: String }], default: [] },
    updatedBy: { type: ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);
attendanceCalendarSchema.plugin(tenantPlugin);
attendanceCalendarSchema.index({ organisationId: 1, branchId: 1 }, { unique: true });

const recoverySchema = new mongoose.Schema(
  { runId: { type: ObjectId, ref: 'PayrollRun', required: true }, runNo: String, month: String, amountPaise: Number, at: Date },
  { _id: false },
);

/** Money given to staff ahead of salary, recovered in monthly instalments from payroll. */
const salaryAdvanceSchema = new mongoose.Schema(
  {
    advanceNo: { type: String, required: true },
    employeeId: { type: ObjectId, ref: 'Employee', required: true },
    branchId: { type: ObjectId, ref: 'Branch', required: true },
    amountPaise: { type: Number, required: true },
    installmentPaise: { type: Number, required: true },
    recoveredPaise: { type: Number, default: 0 },
    mode: { type: String, required: true },
    reference: { type: String, default: null },
    note: { type: String, default: null },
    businessDate: { type: String, required: true }, // the day the advance was given
    // First salary month (YYYY-MM) it is deducted from; null on older advances = due from any month.
    recoverFrom: { type: String, default: null },
    status: { type: String, enum: ['open', 'closed'], default: 'open' },
    recoveries: { type: [recoverySchema], default: [] },
    // Business day it was entered — it can be edited only on that day.
    recordedOn: { type: String, default: null },
    // Every edit: who, when, why and what changed.
    edits: {
      type: [
        new mongoose.Schema(
          { at: Date, by: { type: ObjectId, ref: 'User' }, byName: String, reason: String, changes: [{ _id: false, field: String, from: mongoose.Schema.Types.Mixed, to: mongoose.Schema.Types.Mixed }] },
          { _id: false },
        ),
      ],
      default: [],
    },
    createdBy: { type: ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);
salaryAdvanceSchema.plugin(tenantPlugin);
salaryAdvanceSchema.index({ organisationId: 1, employeeId: 1, status: 1 });

const payrollLineSchema = new mongoose.Schema(
  {
    employeeId: { type: ObjectId, ref: 'Employee', required: true },
    code: String,
    name: String,
    designation: String,
    basicPaise: Number,
    allowancePaise: Number,
    grossPaise: Number,
    daysInMonth: Number,
    days: { present: Number, absent: Number, halfDay: Number, paidLeave: Number, holiday: Number, unmarked: Number },
    payableDays: Number,
    earnedPaise: Number,
    bonusPaise: { type: Number, default: 0 },
    otherDeductionPaise: { type: Number, default: 0 },
    advanceBalancePaise: { type: Number, default: 0 },
    advanceDeductionPaise: { type: Number, default: 0 },
    // Advances due this month, as they stood when the payroll was calculated (for the payslip and review).
    advances: { type: [mongoose.Schema.Types.Mixed], default: [] },
    // Open advances set to be recovered from a later month — shown, not deducted.
    advanceUpcomingPaise: { type: Number, default: 0 },
    netPaise: Number,
    note: { type: String, default: null },
    paid: { mode: String, reference: String, at: Date, by: { type: ObjectId, ref: 'User' } },
  },
  { _id: false },
);

/** A branch's salary for one month: draft (editable) -> finalised (booked in the ledger) -> paid. */
const payrollRunSchema = new mongoose.Schema(
  {
    runNo: { type: String, required: true },
    branchId: { type: ObjectId, ref: 'Branch', required: true },
    month: { type: String, required: true },
    status: { type: String, enum: Object.values(PAYROLL_STATUS), default: PAYROLL_STATUS.DRAFT },
    lines: { type: [payrollLineSchema], default: [] },
    finalisedAt: { type: Date, default: null },
    finalisedBy: { type: ObjectId, ref: 'User', default: null },
    createdBy: { type: ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);
payrollRunSchema.plugin(tenantPlugin);
payrollRunSchema.index({ organisationId: 1, branchId: 1, month: 1 }, { unique: true });

export const Employee = mongoose.model('Employee', employeeSchema);
export const Attendance = mongoose.model('Attendance', attendanceSchema);
export const AttendanceCalendar = mongoose.model('AttendanceCalendar', attendanceCalendarSchema);
export const SalaryAdvance = mongoose.model('SalaryAdvance', salaryAdvanceSchema);
export const PayrollRun = mongoose.model('PayrollRun', payrollRunSchema);
