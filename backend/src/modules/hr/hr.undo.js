import { PAYROLL_STATUS } from '@jerp/shared';
import { employeeSchema } from '@jerp/shared/schemas';
import { todayContext } from '../../utils/businessDate.js';
import { sameValues, undoCreate, undoDelete, undoEdit } from '../undo/undo.helpers.js';
import { AttendanceCalendar, Employee, PayrollRun, SalaryAdvance } from './hr.models.js';
import {
  advanceCancelBlock,
  advanceLock,
  cancelAdvance,
  deletePayrollRun,
  lockedPayroll,
  marksNow,
  reopenBlock,
  reopenPayrollRun,
  restoreAttendance,
  restoreAttendanceCalendar,
  unpayPayrollRun,
  updateAdvance,
  updateEmployee,
} from './hr.service.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

export const hrUndoHandlers = [
  undoCreate({ type: 'employee.create', title: 'Employee added', deleteType: 'employee', permission: 'employee.delete', exists: (id) => Employee.exists({ _id: id }) }),
  undoEdit({ type: 'employee.update', title: 'Employee edited', permission: 'employee.edit', schema: employeeSchema, load: (id) => Employee.findById(id).lean(), apply: updateEmployee }),
  undoDelete({
    type: 'employee.delete',
    title: 'Employee deleted',
    permission: 'employee.create',
    model: Employee,
    prepare: (doc) => ({ ...doc, photoFileId: null }), // the photo was deleted with them
    clash: async (doc) => ((await Employee.exists({ mobile: doc.mobile })) ? `Another employee now has the mobile ${doc.mobile}.` : null),
  }),
  {
    // Left / rejoined: the employment record goes back to what it was (status, exit date, history and breaks).
    type: 'employee.status',
    title: 'Employee left / rejoined',
    mode: 'undo',
    permission: 'employee.edit',
    async check(entry) {
      const emp = await Employee.findById(entry.recordId).lean();
      if (!emp) return { superseded: true, reason: 'The employee was deleted' };
      if (emp.status !== entry.data.to || (emp.history?.length ?? 0) !== entry.data.historyLength) return { ok: false, reason: 'Their employment record was changed again since.' };
      return { ok: true, effect: entry.data.to === 'left' ? 'Marks them as working here again, as before.' : 'Marks them as left again, as before.' };
    },
    run: async (entry) => {
      const { before } = entry.data;
      await Employee.updateOne({ _id: entry.recordId }, { $set: { status: before.status, exitDate: before.exitDate, history: before.history, breaks: before.breaks } });
    },
  },
  {
    type: 'attendance.save',
    title: 'Attendance marked',
    mode: 'undo',
    permission: 'attendance.edit',
    async check(entry) {
      const { marks } = entry.data;
      const locked = await lockedPayroll(entry.branchId, marks.map((m) => m.date.slice(0, 7)));
      if (locked) return { ok: false, reason: `Payroll ${locked.runNo} for that month is finalised, so its attendance is locked.` };
      const now = await marksNow(marks);
      const moved = marks.filter((m) => {
        const cur = now.get(`${m.employeeId}|${m.date}`) ?? null;
        return !sameValues(cur && { status: cur.status, note: cur.note }, m.after && { status: m.after.status, note: m.after.note ?? null });
      });
      if (moved.length) return { ok: false, reason: `${plural(moved.length, 'mark')} changed again since.` };
      return { ok: true, effect: `Puts ${plural(marks.length, 'attendance mark')} back as they were.` };
    },
    run: (entry) => restoreAttendance(entry.data.marks, entry.branchId),
  },
  {
    type: 'attendance.calendar',
    title: 'Holidays & weekly off changed',
    mode: 'undo',
    permission: 'attendance.edit',
    async check(entry) {
      const cal = await AttendanceCalendar.findOne({ branchId: entry.branchId }).lean();
      if (!sameValues(cal && { weeklyOff: cal.weeklyOff, holidays: cal.holidays }, entry.data.after)) return { ok: false, reason: 'The holidays were changed again since.' };
      return { ok: true, effect: 'Puts the weekly off and holidays back as they were.' };
    },
    run: (entry) => restoreAttendanceCalendar(entry.branchId, entry.data.before),
  },
  {
    // Money left the shop: the advance is cancelled and its entry reversed (it stays on record).
    type: 'advance.create',
    title: 'Salary advance given',
    mode: 'reversal',
    permission: 'payroll.process',
    async check(entry) {
      const adv = await SalaryAdvance.findById(entry.recordId).lean();
      if (!adv || adv.status === 'cancelled') return { superseded: true, reason: 'Already cancelled' };
      const block = await advanceCancelBlock(adv);
      if (block) return { ok: false, reason: block };
      return { ok: true, effect: `Cancels advance ${adv.advanceNo} and reverses its entry (the money comes back to ${adv.mode === 'cash' ? 'cash' : 'the bank'}).` };
    },
    run: (entry, { reason }) => cancelAdvance(entry.recordId, reason),
  },
  {
    type: 'advance.update',
    title: 'Salary advance corrected',
    mode: 'undo',
    permission: 'payroll.process',
    async check(entry) {
      const adv = await SalaryAdvance.findById(entry.recordId).lean();
      if (!adv || adv.status === 'cancelled') return { superseded: true, reason: 'The advance was cancelled' };
      const lock = advanceLock(adv, (await todayContext()).businessDate);
      if (lock) return { ok: false, reason: `It can no longer be edited: ${lock.toLowerCase()}.` };
      const now = { amountPaise: adv.amountPaise, installmentPaise: adv.installmentPaise, givenOn: adv.businessDate, recoverFrom: adv.recoverFrom ?? null, mode: adv.mode, reference: adv.reference ?? null, note: adv.note ?? null };
      if (!sameValues(now, entry.data.after)) return { ok: false, reason: 'It was corrected again since.' };
      return { ok: true, effect: 'Puts the advance back as it was (its accounting entry follows).' };
    },
    run: (entry, { reason }) => updateAdvance(entry.recordId, { ...entry.data.before, reason: `Undo: ${reason}` }),
  },
  {
    type: 'payroll.create',
    title: 'Payroll created',
    mode: 'undo',
    permission: 'payroll.process',
    async check(entry) {
      const run = await PayrollRun.findById(entry.recordId).lean();
      if (!run) return { superseded: true, reason: 'Already deleted' };
      if (run.status !== PAYROLL_STATUS.DRAFT) return { ok: false, reason: `${run.runNo} is finalised — undo the finalising first.` };
      return { ok: true, effect: `Deletes draft payroll ${run.runNo}.` };
    },
    run: (entry) => deletePayrollRun(entry.recordId),
  },
  undoDelete({
    type: 'payroll.delete',
    title: 'Draft payroll deleted',
    permission: 'payroll.process',
    model: PayrollRun,
    clash: async (doc) => ((await PayrollRun.exists({ branchId: doc.branchId, month: doc.month })) ? 'Payroll for that month has been created again since.' : null),
  }),
  {
    // The salary booking is reversed and deducted advances are owed again; the run is a draft once more.
    type: 'payroll.finalise',
    title: 'Payroll finalised',
    mode: 'reversal',
    permission: ['payroll.process', 'payroll.approve'],
    async check(entry) {
      const run = await PayrollRun.findById(entry.recordId).lean();
      if (!run || run.status === PAYROLL_STATUS.DRAFT) return { superseded: true, reason: 'It is a draft again' };
      const block = reopenBlock(run);
      if (block) return { ok: false, reason: block };
      return { ok: true, effect: `Reopens ${run.runNo} as a draft: the salary booking is reversed and advances it deducted are owed again.` };
    },
    run: (entry, { reason }) => reopenPayrollRun(entry.recordId, reason),
  },
  {
    type: 'payroll.pay',
    title: 'Salary paid',
    mode: 'reversal',
    permission: ['payroll.process', 'payroll.approve'],
    async check(entry) {
      const run = await PayrollRun.findById(entry.recordId).lean();
      if (!run) return { superseded: true, reason: 'The payroll was deleted' };
      const ids = new Set(entry.data.employeeIds);
      const lines = run.lines.filter((l) => ids.has(String(l.employeeId)));
      if (lines.some((l) => !l.paid?.at || new Date(l.paid.at).getTime() !== new Date(entry.data.at).getTime())) return { superseded: true, reason: 'This payment was already changed' };
      return { ok: true, effect: `Takes back the salary paid to ${plural(lines.length, 'employee')}: the payment entry is reversed and they show as unpaid.` };
    },
    run: (entry, { reason }) => unpayPayrollRun(entry.recordId, entry.data, reason),
  },
];
