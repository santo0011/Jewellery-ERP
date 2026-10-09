import { ATTENDANCE_STATUSES, EMPLOYMENT_STATUS, hasPermission, PAYROLL_STATUS } from '@jerp/shared';
import { withTransaction } from '../../config/db.js';
import { AUDIT_ACTIONS, recordAudit } from '../../core/audit/audit.service.js';
import { requireContext } from '../../core/context/requestContext.js';
import { postJournal, reverseJournalsFor } from '../../core/ledger/posting.service.js';
import { nextCode, nextDocumentNo } from '../../core/numbering/numbering.service.js';
import { FileAsset } from '../../core/storage/fileAsset.model.js';
import { detectImageType, storage } from '../../core/storage/storage.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { randomToken } from '../../utils/crypto.js';
import { businessDateFor, financialYearLabel, todayContext } from '../../utils/businessDate.js';
import { paginate, searchFilter } from '../../utils/pagination.js';
import { accessibleBranchFilter, nameMaps, oid, pick, requireBranch } from '../inventory/inventory.helpers.js';
import { Attendance, AttendanceCalendar, Employee, PayrollRun, SalaryAdvance } from './hr.models.js';

// ---------------------------------------------------------------- helpers

const can = (permission) => hasPermission(requireContext().permissions, permission);
// Salary, bank and PAN are for people who run payroll or manage employee records.
const canSeePay = () => can('payroll.view') || can('employee.create') || can('employee.edit');
const MONEY_ACCOUNT = { cash: 'cash', bank: 'bank', upi: 'bank' };
const PAID_FRACTION = Object.fromEntries(ATTENDANCE_STATUSES.map((s) => [s.value, s.paidFraction]));
const sum = (list, fn) => list.reduce((s, x) => s + fn(x), 0);

export function monthBounds(month) {
  const [y, m] = month.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(days).padStart(2, '0')}`, days };
}

const dayNumber = (iso) => Date.parse(`${iso}T00:00:00Z`) / 86400000;
const monthLabel = (month) => new Date(`${month}-01T00:00:00Z`).toLocaleString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Days of `month` the employee was on the rolls (joining and exit dates included, breaks after a rejoin left out). */
function eligibleDays(emp, month) {
  const { start, end } = monthBounds(month);
  const from = emp.joiningDate > start ? emp.joiningDate : start;
  const to = emp.exitDate && emp.exitDate < end ? emp.exitDate : end;
  if (from > to) return 0;
  const away = (emp.breaks ?? []).reduce((n, b) => {
    const a = b.from > from ? b.from : from;
    const z = b.to < to ? b.to : to;
    return a > z ? n : n + dayNumber(z) - dayNumber(a) + 1;
  }, 0);
  return dayNumber(to) - dayNumber(from) + 1 - away;
}

/** Was the employee on the rolls on this date? */
const onRollsOn = (emp, date) => date >= emp.joiningDate && (!emp.exitDate || date <= emp.exitDate) && !(emp.breaks ?? []).some((b) => date >= b.from && date <= b.to);

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const weekday = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const dayAfter = (iso) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
const dayBefore = (iso) => new Date(Date.parse(`${iso}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);

/** Weekly off days and holidays per branch between two dates: Map(branchId -> Map(date -> name)). */
export async function offDays(branchIds, from, to) {
  const ids = [...new Set(branchIds.map(String))];
  const calendars = await AttendanceCalendar.find({ branchId: { $in: ids } }).lean();
  const byBranch = new Map(calendars.map((c) => [String(c.branchId), c]));
  const result = new Map();
  for (const id of ids) {
    // Branches that never set a calendar get Sunday off, the common default.
    const cal = byBranch.get(id) ?? { weeklyOff: [0], holidays: [] };
    const map = new Map();
    for (let d = from; d <= to; d = dayAfter(d)) if (cal.weeklyOff.includes(weekday(d))) map.set(d, `Weekly off (${WEEKDAY_NAMES[weekday(d)]})`);
    for (const h of cal.holidays) if (h.date >= from && h.date <= to) map.set(h.date, h.name);
    result.set(id, map);
  }
  return result;
}

/**
 * Attendance counts per employee for a month (optionally only up to a date). A weekly off or holiday with no
 * mark counts as holiday; a day the employee was marked on keeps its mark.
 */
async function attendanceCounts(employees, month, { until } = {}) {
  const { start, end } = monthBounds(month);
  const last = until && until < end ? until : end;
  const rows = await Attendance.find({ employeeId: { $in: employees.map((e) => e._id) }, date: { $gte: start, $lte: last } })
    .select('employeeId status date')
    .lean();
  const counts = new Map();
  const marked = new Set();
  const blank = () => ({ present: 0, absent: 0, half_day: 0, paid_leave: 0, holiday: 0 });
  for (const r of rows) {
    const c = counts.get(String(r.employeeId)) ?? blank();
    c[r.status] = (c[r.status] ?? 0) + 1;
    counts.set(String(r.employeeId), c);
    marked.add(`${r.employeeId}|${r.date}`);
  }
  if (last >= start) {
    const offs = await offDays(employees.map((e) => e.branchId), start, last);
    for (const e of employees) {
      for (const d of offs.get(String(e.branchId))?.keys() ?? []) {
        if (!onRollsOn(e, d) || marked.has(`${e._id}|${d}`)) continue;
        const c = counts.get(String(e._id)) ?? blank();
        c.holiday += 1;
        counts.set(String(e._id), c);
      }
    }
  }
  return counts;
}

// ---------------------------------------------------------------- weekly off & holidays

export async function getAttendanceCalendar({ branchId }) {
  await requireBranch(branchId, { active: false });
  const cal = await AttendanceCalendar.findOne({ branchId: oid(branchId) }).lean();
  return { branchId, weeklyOff: cal?.weeklyOff ?? [0], holidays: [...(cal?.holidays ?? [])].sort((a, b) => a.date.localeCompare(b.date)), saved: Boolean(cal) };
}

export async function saveAttendanceCalendar({ branchId, weeklyOff, holidays }) {
  const { userId, organisationId } = requireContext();
  await requireBranch(branchId, { active: false });
  await AttendanceCalendar.updateOne(
    { organisationId: oid(organisationId), branchId: oid(branchId) },
    { $set: { weeklyOff: [...new Set(weeklyOff)].sort(), holidays: [...holidays].sort((a, b) => a.date.localeCompare(b.date)), updatedBy: userId } },
    { upsert: true },
  );
  await recordAudit({ action: AUDIT_ACTIONS.UPDATE, module: 'attendance', recordType: 'AttendanceCalendar', recordId: oid(branchId), meta: { name: 'Holidays & weekly off', weeklyOff, holidays: holidays.length } });
  return getAttendanceCalendar({ branchId });
}

/** An advance is due in a salary month once that month reaches its "recover from" month (older advances: always). */
const dueIn = (a, month) => !month || !a.recoverFrom || a.recoverFrom <= month;
const dueFilter = (month) => ({ $or: [{ recoverFrom: null }, { recoverFrom: { $lte: month } }] });

/**
 * Open advances per employee. With a salary month: what is due that month (balance, this month's instalment and
 * each advance in detail, oldest first) and what is set for later months. Without one: everything outstanding.
 */
async function openAdvanceBalances(employeeIds, month, session) {
  const advances = await SalaryAdvance.find({ employeeId: { $in: employeeIds }, status: 'open' }).sort({ businessDate: 1, createdAt: 1 }).session(session ?? null).lean();
  const map = new Map();
  for (const a of advances) {
    const m = map.get(String(a.employeeId)) ?? { balancePaise: 0, installmentPaise: 0, upcomingPaise: 0, advances: [] };
    const balance = a.amountPaise - a.recoveredPaise;
    if (dueIn(a, month)) {
      const due = Math.min(a.installmentPaise, balance);
      m.balancePaise += balance;
      m.installmentPaise += due;
      m.advances.push({ advanceId: a._id, advanceNo: a.advanceNo, givenOn: a.businessDate, recoverFrom: a.recoverFrom, amountPaise: a.amountPaise, recoveredPaise: a.recoveredPaise, balancePaise: balance, duePaise: due });
    } else m.upcomingPaise += balance;
    map.set(String(a.employeeId), m);
  }
  return map;
}

async function findEmployee(id, session) {
  const emp = await Employee.findOne({ _id: id, ...accessibleBranchFilter() }).session(session ?? null);
  if (!emp) throw ApiError.notFound('Employee');
  return emp;
}

function serializeEmployee(e, maps) {
  const pay = canSeePay();
  return {
    id: e._id,
    code: e.code,
    name: e.name,
    mobile: e.mobile,
    email: e.email,
    designation: e.designation,
    branch: pick(maps.branches, e.branchId) ?? { id: e.branchId },
    joiningDate: e.joiningDate,
    exitDate: e.exitDate,
    status: e.status,
    address: e.address,
    notes: e.notes,
    photoFileId: e.photoFileId ?? null,
    payVisible: pay,
    ...(pay && {
      basicPaise: e.basicPaise,
      allowancePaise: e.allowancePaise,
      grossPaise: e.basicPaise + e.allowancePaise,
      pan: e.pan,
      bank: e.bank ?? {},
    }),
    createdAt: e.createdAt,
  };
}

// ---------------------------------------------------------------- employees

export async function listEmployees({ page, limit, q, branchId, status }) {
  const filter = { ...accessibleBranchFilter(), ...searchFilter(q, ['name', 'mobile', 'code', 'designation']) };
  if (branchId) filter.branchId = oid(branchId);
  if (status) filter.status = status;
  const { items, meta } = await paginate(Employee.find(filter).sort({ status: 1, name: 1 }), Employee.countDocuments(filter), { page, limit });
  const maps = await nameMaps({ branchIds: items.map((e) => e.branchId) });
  const advances = canSeePay() ? await openAdvanceBalances(items.map((e) => e._id)) : new Map();
  return { items: items.map((e) => ({ ...serializeEmployee(e, maps), ...(canSeePay() && { advanceBalancePaise: advances.get(String(e._id))?.balancePaise ?? 0 }) })), meta: { ...meta, summary: await employeeSummary(branchId) } };
}

/** Header cards: staff working and left, the monthly salary bill and advances still out (pay figures only if allowed). */
async function employeeSummary(branchId) {
  const scope = { ...accessibleBranchFilter(), ...(branchId && { branchId: oid(branchId) }) };
  const [rows, adv] = await Promise.all([
    Employee.aggregate([{ $match: scope }, { $group: { _id: '$status', count: { $sum: 1 }, grossPaise: { $sum: { $add: ['$basicPaise', { $ifNull: ['$allowancePaise', 0] }] } } } }]),
    canSeePay() ? SalaryAdvance.aggregate([{ $match: { ...scope, status: 'open' } }, { $group: { _id: null, balance: { $sum: { $subtract: ['$amountPaise', '$recoveredPaise'] } }, people: { $addToSet: '$employeeId' } } }]) : [],
  ]);
  const by = Object.fromEntries(rows.map((r) => [r._id, r]));
  return {
    working: by[EMPLOYMENT_STATUS.ACTIVE]?.count ?? 0,
    left: by[EMPLOYMENT_STATUS.LEFT]?.count ?? 0,
    ...(canSeePay() && { salaryPaise: by[EMPLOYMENT_STATUS.ACTIVE]?.grossPaise ?? 0, advancePaise: adv[0]?.balance ?? 0, advancePeople: adv[0]?.people?.length ?? 0 }),
  };
}

export async function getEmployee(id) {
  const emp = (await findEmployee(id)).toObject();
  const history = employmentHistory(emp);
  const maps = await nameMaps({ branchIds: [emp.branchId], userIds: history.map((h) => h.by).filter(Boolean) });
  const today = await todayContext();
  const month = today.businessDate.slice(0, 7);
  const result = {
    ...serializeEmployee(emp, maps),
    history: history.map((h) => ({ ...h, by: pick(maps.users, h.by) ?? null })),
    breaks: (emp.breaks ?? []).map((x) => ({ from: x.from, to: x.to })),
    attendance: null,
    advances: null,
    payslips: null,
  };

  if (can('attendance.view')) {
    const counts = (await attendanceCounts([emp], month, { until: today.businessDate })).get(String(emp._id)) ?? {};
    const recent = await Attendance.find({ employeeId: emp._id, date: { $gte: monthBounds(month).start } }).sort({ date: 1 }).select('date status note').lean();
    result.attendance = {
      month,
      absent: counts.absent ?? 0,
      halfDay: counts.half_day ?? 0,
      paidLeave: counts.paid_leave ?? 0,
      holiday: counts.holiday ?? 0,
      days: recent.map((r) => ({ date: r.date, status: r.status, note: r.note })),
    };
  }
  if (can('payroll.view')) {
    const [advances, runs] = await Promise.all([
      SalaryAdvance.find({ employeeId: emp._id }).sort({ createdAt: -1 }).lean(),
      PayrollRun.find({ 'lines.employeeId': emp._id }).sort({ month: -1 }).limit(24).lean(),
    ]);
    result.advances = advances.map((a) => serializeAdvance(a, null, today.businessDate));
    result.advanceBalancePaise = sum(advances.filter((a) => a.status === 'open'), (a) => a.amountPaise - a.recoveredPaise);
    result.payslips = runs.map((r) => {
      const line = r.lines.find((l) => String(l.employeeId) === String(emp._id));
      return { runId: r._id, runNo: r.runNo, month: r.month, status: r.status, payableDays: line.payableDays, daysInMonth: line.daysInMonth, netPaise: line.netPaise, paid: Boolean(line.paid?.at), paidAt: line.paid?.at ?? null };
    });
  }
  return result;
}

async function assertMobileFree(mobile, exceptId) {
  const clash = await Employee.findOne({ mobile, ...(exceptId && { _id: { $ne: exceptId } }) }).select('code name').lean();
  if (clash) throw ApiError.conflict(`Mobile already used by ${clash.name} (${clash.code})`, 'DUPLICATE', [{ path: 'mobile', message: 'Already used by another employee' }]);
}

export async function createEmployee(input) {
  const { userId } = requireContext();
  await requireBranch(input.branchId);
  await assertMobileFree(input.mobile);
  const emp = await withTransaction(async (session) => {
    const code = await nextCode('employee', 'E', 4, { session });
    const [doc] = await Employee.create([{ ...input, code, history: [{ event: 'joined', date: input.joiningDate, by: userId }], createdBy: userId, updatedBy: userId }], { session });
    await recordAudit({ action: AUDIT_ACTIONS.CREATE, module: 'employee', recordType: 'Employee', recordId: doc._id, meta: { name: doc.name, code } }, { session });
    return doc;
  });
  return getEmployee(emp._id);
}

export async function updateEmployee(id, input) {
  const { userId } = requireContext();
  const emp = await findEmployee(id);
  if (String(emp.branchId) !== input.branchId) await requireBranch(input.branchId);
  if (input.mobile !== emp.mobile) await assertMobileFree(input.mobile, emp._id);
  const before = { basicPaise: emp.basicPaise, allowancePaise: emp.allowancePaise, branchId: String(emp.branchId), designation: emp.designation };
  emp.set({ ...input, bank: { accountName: null, accountNumber: null, ifsc: null, ...input.bank }, updatedBy: userId });
  await emp.save();
  const changes = Object.entries(before)
    .filter(([k, v]) => String(v) !== String(emp[k]))
    .map(([field, from]) => ({ field, from, to: String(emp[field]) }));
  await recordAudit({ action: AUDIT_ACTIONS.UPDATE, module: 'employee', recordType: 'Employee', recordId: emp._id, meta: { name: emp.name }, changes });
  return getEmployee(id);
}

/** Replaces the employee's photo (PNG, JPEG or WebP); the old file is deleted. */
export async function setEmployeePhoto(id, file) {
  const { organisationId, userId } = requireContext();
  const emp = await findEmployee(id);
  const type = detectImageType(file.buffer);
  if (!type) throw ApiError.badRequest('Photo must be a PNG, JPEG or WebP image', undefined, 'UNSUPPORTED_FILE');
  const key = `${organisationId}/employees/${emp._id}/${randomToken(12)}.${type.ext}`;
  await storage.put(key, file.buffer);
  const asset = await FileAsset.create({ key, purpose: 'employee_photo', mimeType: type.mime, size: file.size, originalName: file.originalname?.slice(0, 200) ?? null, uploadedBy: userId });
  const previousId = emp.photoFileId;
  emp.set({ photoFileId: asset._id, updatedBy: userId });
  await emp.save();
  await recordAudit({ action: AUDIT_ACTIONS.UPDATE, module: 'employee', recordType: 'Employee', recordId: emp._id, meta: { name: emp.name }, changes: [{ field: 'photo', from: previousId, to: asset._id }] });
  if (previousId) await deleteFile(previousId);
  return getEmployee(id);
}

export async function removeEmployeePhoto(id) {
  const { userId } = requireContext();
  const emp = await findEmployee(id);
  const previousId = emp.photoFileId;
  if (!previousId) return getEmployee(id);
  emp.set({ photoFileId: null, updatedBy: userId });
  await emp.save();
  await recordAudit({ action: AUDIT_ACTIONS.UPDATE, module: 'employee', recordType: 'Employee', recordId: emp._id, meta: { name: emp.name }, changes: [{ field: 'photo', from: previousId, to: null }] });
  await deleteFile(previousId);
  return getEmployee(id);
}

async function deleteFile(id) {
  const asset = await FileAsset.findByIdAndDelete(id).lean();
  if (asset) await storage.remove(asset.key);
}

/** Leaving sets the exit date; rejoining reopens from the rejoin date, and the days away become a break (unpaid). */
export async function setEmployeeStatus(id, { status, exitDate, rejoinDate, note }) {
  const { userId } = requireContext();
  const emp = await findEmployee(id);
  if (emp.status === status) return getEmployee(id);
  const today = await todayContext();
  const from = emp.status;
  // Employees from before history existed: start their record from what the dates say.
  if (!emp.history?.length) emp.history = employmentHistory(emp);

  if (status === EMPLOYMENT_STATUS.LEFT) {
    const date = exitDate ?? today.businessDate;
    if (date < emp.joiningDate) throw ApiError.badRequest('Exit date is before joining date', [{ path: 'exitDate', message: 'Must be on or after the joining date' }], 'VALIDATION_ERROR');
    const lastReturn = emp.history.filter((h) => h.event === 'rejoined').at(-1)?.date;
    if (lastReturn && date < lastReturn) throw ApiError.badRequest('Exit date is before the rejoin date', [{ path: 'exitDate', message: `Must be on or after ${lastReturn}` }], 'VALIDATION_ERROR');
    emp.exitDate = date;
    emp.history.push({ event: 'left', date, note: note ?? null, by: userId, at: new Date() });
  } else {
    const date = rejoinDate ?? today.businessDate;
    if (emp.exitDate && date <= emp.exitDate) throw ApiError.badRequest('Rejoin date must be after the exit date', [{ path: 'rejoinDate', message: `Must be after ${emp.exitDate}` }], 'VALIDATION_ERROR');
    if (date > today.businessDate) throw ApiError.badRequest('Rejoin date cannot be in the future', [{ path: 'rejoinDate', message: 'Pick today or an earlier date' }], 'VALIDATION_ERROR');
    if (emp.exitDate && dayAfter(emp.exitDate) < date) emp.breaks.push({ from: dayAfter(emp.exitDate), to: dayBefore(date) });
    emp.exitDate = null;
    emp.history.push({ event: 'rejoined', date, note: note ?? null, by: userId, at: new Date() });
  }
  emp.status = status;
  emp.updatedBy = userId;
  await emp.save();
  await recordAudit({ action: AUDIT_ACTIONS.STATUS_CHANGE, module: 'employee', recordType: 'Employee', recordId: emp._id, meta: { name: emp.name }, changes: [{ field: 'status', from, to: status }] });
  return getEmployee(id);
}

/** Stored history, or for older employees the joined / left events their dates imply. */
function employmentHistory(e) {
  if (e.history?.length) return e.history.map((h) => ({ event: h.event, date: h.date, note: h.note ?? null, by: h.by ?? null, at: h.at ?? null }));
  return [{ event: 'joined', date: e.joiningDate, note: null, by: null, at: null }, ...(e.exitDate ? [{ event: 'left', date: e.exitDate, note: null, by: null, at: null }] : [])];
}

// ---------------------------------------------------------------- attendance

/** Who was on the rolls on `date` (joined by then, not yet left). */
const onRollsFilter = (branchId, from, to = from) => ({
  branchId: oid(branchId),
  joiningDate: { $lte: to },
  $or: [{ exitDate: null }, { exitDate: { $gte: from } }],
  // A single day inside a break (between leaving and rejoining) is off the rolls.
  ...(from === to && { breaks: { $not: { $elemMatch: { from: { $lte: from }, to: { $gte: from } } } } }),
});

export async function getAttendanceDay({ branchId, date }) {
  await requireBranch(branchId, { active: false });
  const today = await todayContext();
  const employees = await Employee.find(onRollsFilter(branchId, date)).sort({ name: 1 }).lean();
  const ids = employees.map((e) => e._id);
  const month = date.slice(0, 7);
  const [records, counts, run, offs] = await Promise.all([
    Attendance.find({ employeeId: { $in: ids }, date }).lean(),
    attendanceCounts(employees, month, { until: date > today.businessDate ? date : today.businessDate }),
    PayrollRun.findOne({ branchId: oid(branchId), month }).select('status runNo').lean(),
    offDays([branchId], date, date),
  ]);
  const byEmp = new Map(records.map((r) => [String(r.employeeId), r]));
  return {
    date,
    today: today.businessDate,
    locked: Boolean(run && run.status !== PAYROLL_STATUS.DRAFT),
    lockedBy: run && run.status !== PAYROLL_STATUS.DRAFT ? run.runNo : null,
    // Name of the weekly off / holiday when this date is one: unmarked staff count as on holiday.
    dayOff: offs.get(String(branchId))?.get(date) ?? null,
    employees: employees.map((e) => {
      const c = counts.get(String(e._id)) ?? {};
      return {
        id: e._id,
        code: e.code,
        name: e.name,
        designation: e.designation,
        photoFileId: e.photoFileId ?? null,
        status: byEmp.get(String(e._id))?.status ?? null,
        note: byEmp.get(String(e._id))?.note ?? null,
        month: { absent: c.absent ?? 0, halfDay: c.half_day ?? 0, paidLeave: c.paid_leave ?? 0, holiday: c.holiday ?? 0 },
      };
    }),
  };
}

export async function saveAttendance({ branchId, date, entries }) {
  const { userId } = requireContext();
  await requireBranch(branchId, { active: false });
  const today = await todayContext();
  if (date > today.businessDate) throw ApiError.badRequest('Attendance cannot be marked for a future date', [{ path: 'date', message: 'Pick today or an earlier date' }], 'VALIDATION_ERROR');
  if (date < today.businessDate && !can('attendance.edit')) throw ApiError.forbidden('You can mark only today’s attendance. Changing past days needs the "Edit attendance" permission.');
  const run = await PayrollRun.findOne({ branchId: oid(branchId), month: date.slice(0, 7) }).select('status runNo').lean();
  if (run && run.status !== PAYROLL_STATUS.DRAFT) {
    throw ApiError.conflict(`Payroll ${run.runNo} for ${monthLabel(date.slice(0, 7))} is already finalised, so this month’s attendance is locked.`, 'PAYROLL_LOCKED');
  }
  const ids = entries.map((e) => e.employeeId);
  const valid = await Employee.find({ _id: { $in: ids }, ...onRollsFilter(branchId, date) }).select('_id').lean();
  if (valid.length !== new Set(ids).size) throw ApiError.badRequest('Some employees are not on this branch’s rolls for that date', undefined, 'VALIDATION_ERROR');

  await Attendance.bulkWrite(
    entries.map((e) => ({
      updateOne: {
        filter: { organisationId: oid(requireContext().organisationId), employeeId: oid(e.employeeId), date },
        update: { $set: { branchId: oid(branchId), status: e.status, note: e.note ?? null, markedBy: userId } },
        upsert: true,
      },
    })),
  );
  await recordAudit({ action: AUDIT_ACTIONS.UPDATE, module: 'attendance', recordType: 'Attendance', recordId: oid(branchId), meta: { name: `Attendance ${date}`, entries: entries.length } });
  return getAttendanceDay({ branchId, date });
}

// ---------------------------------------------------------------- salary advances

/** Why an advance can no longer be edited, or null when it still can (same business day, nothing deducted). */
function advanceLock(a, todayDate) {
  const recordedOn = a.recordedOn ?? businessDateFor(a.createdAt);
  if (a.recoveredPaise > 0 || a.status !== 'open') return 'Already deducted from salary';
  if (!todayDate || recordedOn !== todayDate) return `Could only be edited on ${recordedOn}, the day it was entered`;
  return null;
}

function serializeAdvance(a, maps, todayDate) {
  const lock = advanceLock(a, todayDate);
  return {
    editable: !lock,
    lockedReason: lock,
    recordedOn: a.recordedOn ?? businessDateFor(a.createdAt),
    edits: (a.edits ?? []).map((x) => ({ at: x.at, by: x.byName ?? null, reason: x.reason, changes: x.changes ?? [] })),
    id: a._id,
    advanceNo: a.advanceNo,
    employee: maps ? (pick(maps.employees, a.employeeId) ?? { id: a.employeeId }) : { id: a.employeeId },
    branch: maps ? pick(maps.branches, a.branchId) : null,
    amountPaise: a.amountPaise,
    installmentPaise: a.installmentPaise,
    recoverFrom: a.recoverFrom ?? null,
    // Months needed at the set instalment, counting from the first recovery month.
    instalments: Math.ceil(a.amountPaise / a.installmentPaise),
    recoveredPaise: a.recoveredPaise,
    balancePaise: a.amountPaise - a.recoveredPaise,
    mode: a.mode,
    reference: a.reference,
    note: a.note,
    status: a.status,
    businessDate: a.businessDate,
    recoveries: a.recoveries.map((r) => ({ runId: r.runId, runNo: r.runNo, month: r.month, amountPaise: r.amountPaise, at: r.at })),
    createdAt: a.createdAt,
  };
}

async function employeeMap(ids) {
  const rows = await Employee.find({ _id: { $in: ids } }).select('code name designation').lean();
  return new Map(rows.map((e) => [String(e._id), { id: e._id, code: e.code, name: e.name, designation: e.designation }]));
}

export async function listAdvances({ page, limit, q, employeeId, branchId, status }) {
  const filter = { ...accessibleBranchFilter(), ...searchFilter(q, ['advanceNo', 'note', 'reference']) };
  if (employeeId) filter.employeeId = oid(employeeId);
  if (branchId) filter.branchId = oid(branchId);
  if (status) filter.status = status;
  const { items, meta } = await paginate(SalaryAdvance.find(filter).sort({ createdAt: -1 }), SalaryAdvance.countDocuments(filter), { page, limit });
  const [maps, employees] = await Promise.all([nameMaps({ branchIds: items.map((a) => a.branchId) }), employeeMap(items.map((a) => a.employeeId))]);
  maps.employees = employees;
  const outstanding = await SalaryAdvance.aggregate([{ $match: { ...accessibleBranchFilter(), status: 'open' } }, { $group: { _id: null, total: { $sum: { $subtract: ['$amountPaise', '$recoveredPaise'] } } } }]);
  const today = await todayContext();
  return { items: items.map((a) => serializeAdvance(a, maps, today.businessDate)), meta: { ...meta, outstandingPaise: outstanding[0]?.total ?? 0 } };
}

export async function createAdvance({ employeeId, amountPaise, installmentPaise, givenOn, recoverFrom, mode, reference, note }) {
  const { userId } = requireContext();
  const emp = await findEmployee(employeeId);
  if (emp.status !== EMPLOYMENT_STATUS.ACTIVE) throw ApiError.conflict(`${emp.name} has left; advances can only be given to current staff.`, 'INVALID_STATE');
  const branch = await requireBranch(emp.branchId, { active: false });
  const today = await todayContext();
  const date = givenOn ?? today.businessDate;
  if (date > today.businessDate) throw ApiError.badRequest('An advance cannot be dated in the future', [{ path: 'givenOn', message: 'Pick today or an earlier date' }], 'VALIDATION_ERROR');
  // Without a month the advance is due from the next payroll run, as before.
  const fromMonth = recoverFrom ?? null;
  const closed = fromMonth && (await PayrollRun.findOne({ branchId: emp.branchId, month: fromMonth, status: { $ne: PAYROLL_STATUS.DRAFT } }).select('runNo').lean());
  if (closed) throw ApiError.badRequest(`${monthLabel(fromMonth)} salary is already finalised (${closed.runNo})`, [{ path: 'recoverFrom', message: 'Pick a later month' }], 'VALIDATION_ERROR');
  const financialYear = financialYearLabel(date, today.fyStartMonth);
  const advance = await withTransaction(async (session) => {
    const advanceNo = await nextDocumentNo({ prefix: 'ADV', branchCode: branch.code, financialYear }, { session });
    const [doc] = await SalaryAdvance.create(
      [{ advanceNo, employeeId: emp._id, branchId: emp.branchId, amountPaise, installmentPaise, recoverFrom: fromMonth, mode, reference: reference ?? null, note: note ?? null, businessDate: date, recordedOn: today.businessDate, createdBy: userId }],
      { session },
    );
    await postAdvanceJournal(doc, emp, today, session);
    await recordAudit({ action: AUDIT_ACTIONS.CREATE, module: 'payroll', recordType: 'SalaryAdvance', recordId: doc._id, meta: { name: advanceNo, employee: emp.name, amountPaise } }, { session });
    return doc;
  });
  const maps = await nameMaps({ branchIds: [advance.branchId] });
  maps.employees = await employeeMap([emp._id]);
  return serializeAdvance(advance.toObject(), maps, today.businessDate);
}

/** Money out to the employee: staff advances (asset) against cash / bank, dated the day it was given. */
async function postAdvanceJournal(doc, emp, today, session) {
  const date = doc.businessDate;
  await postJournal(
    {
      voucherType: 'salary_advance',
      date: date === today.businessDate ? today.now : new Date(`${date}T12:00:00+05:30`),
      businessDate: date,
      financialYear: financialYearLabel(date, today.fyStartMonth),
      narration: `Salary advance ${doc.advanceNo} to ${emp.name}`,
      source: { docType: 'salary_advance', docId: doc._id, docNo: doc.advanceNo },
      lines: [
        { account: 'staff_advances', debit: doc.amountPaise, party: { type: 'employee', id: emp._id }, branchId: emp.branchId },
        { account: MONEY_ACCOUNT[doc.mode], credit: doc.amountPaise, branchId: emp.branchId },
      ],
    },
    { session },
  );
}

const ADVANCE_FIELDS = { amountPaise: 'Amount', installmentPaise: 'Cut each month', businessDate: 'Given on', recoverFrom: 'Cut from salary of', mode: 'Paid by', reference: 'Reference', note: 'Reason' };

/**
 * Corrects an advance on the day it was entered, before any salary has deducted it. Money changes (amount, date,
 * how it was paid) reverse the old accounting entry and post a new one; every edit is kept with its reason.
 */
export async function updateAdvance(id, { amountPaise, installmentPaise, givenOn, recoverFrom, mode, reference, note, reason }) {
  const { userId } = requireContext();
  const today = await todayContext();
  const adv = await SalaryAdvance.findOne({ _id: id, ...accessibleBranchFilter() });
  if (!adv) throw ApiError.notFound('Advance');
  const lock = advanceLock(adv, today.businessDate);
  if (lock) throw ApiError.conflict(`Advance ${adv.advanceNo} can no longer be edited: ${lock.toLowerCase()}.`, 'EDIT_LOCKED');
  if (givenOn > today.businessDate) throw ApiError.badRequest('An advance cannot be dated in the future', [{ path: 'givenOn', message: 'Pick today or an earlier date' }], 'VALIDATION_ERROR');
  const fromMonth = recoverFrom ?? adv.recoverFrom ?? null;
  if (fromMonth && fromMonth !== adv.recoverFrom) {
    const closed = await PayrollRun.findOne({ branchId: adv.branchId, month: fromMonth, status: { $ne: PAYROLL_STATUS.DRAFT } }).select('runNo').lean();
    if (closed) throw ApiError.badRequest(`${monthLabel(fromMonth)} salary is already finalised (${closed.runNo})`, [{ path: 'recoverFrom', message: 'Pick a later month' }], 'VALIDATION_ERROR');
  }

  const next = { amountPaise, installmentPaise, businessDate: givenOn, recoverFrom: fromMonth, mode, reference: reference ?? null, note: note ?? null };
  const changes = Object.entries(next)
    .filter(([k, v]) => (adv[k] ?? null) !== v)
    .map(([field, to]) => ({ field: ADVANCE_FIELDS[field], from: adv[field] ?? null, to }));
  if (!changes.length) throw ApiError.badRequest('Nothing was changed', undefined, 'NO_CHANGES');
  const moneyChanged = ['amountPaise', 'businessDate', 'mode'].some((k) => adv[k] !== next[k]);

  const emp = await Employee.findById(adv.employeeId).lean();
  const byName = (await nameMaps({ userIds: [userId] })).users.get(String(userId))?.name ?? null;
  await withTransaction(async (session) => {
    if (moneyChanged) {
      await reverseJournalsFor(
        { docType: 'salary_advance', docId: adv._id },
        { date: today.now, businessDate: today.businessDate, financialYear: today.financialYear, narration: `Advance ${adv.advanceNo} corrected — old entry reversed` },
        { session },
      );
    }
    adv.set(next);
    adv.edits.push({ at: today.now, by: userId, byName, reason, changes });
    await adv.save({ session });
    if (moneyChanged) await postAdvanceJournal(adv, emp, today, session);
    await recordAudit({ action: AUDIT_ACTIONS.UPDATE, module: 'payroll', recordType: 'SalaryAdvance', recordId: adv._id, meta: { name: adv.advanceNo, employee: emp.name, reason }, changes: changes.map((c) => ({ field: c.field, from: c.from, to: c.to })) }, { session });
  });
  const maps = await nameMaps({ branchIds: [adv.branchId] });
  maps.employees = await employeeMap([adv.employeeId]);
  return serializeAdvance(adv.toObject(), maps, today.businessDate);
}

// ---------------------------------------------------------------- payroll

/** Pay for one employee for the month. `keep` carries the manual figures (bonus, deductions, note) of a draft line. */
function buildLine(emp, month, counts, advance, keep = {}) {
  const { days: daysInMonth } = monthBounds(month);
  const c = counts.get(String(emp._id)) ?? {};
  const eligible = eligibleDays(emp, month);
  const marked = (c.present ?? 0) + (c.absent ?? 0) + (c.half_day ?? 0) + (c.paid_leave ?? 0) + (c.holiday ?? 0);
  const days = {
    present: c.present ?? 0,
    absent: c.absent ?? 0,
    halfDay: c.half_day ?? 0,
    paidLeave: c.paid_leave ?? 0,
    holiday: c.holiday ?? 0,
    unmarked: Math.max(0, eligible - marked),
  };
  const unpaid = days.absent * (1 - PAID_FRACTION.absent) + days.halfDay * (1 - PAID_FRACTION.half_day);
  const payableDays = Math.max(0, eligible - unpaid);
  const grossPaise = emp.basicPaise + emp.allowancePaise;
  const earnedPaise = Math.round((grossPaise * payableDays) / daysInMonth);
  const bonusPaise = keep.bonusPaise ?? 0;
  const otherDeductionPaise = Math.min(keep.otherDeductionPaise ?? 0, earnedPaise + bonusPaise);
  const advanceBalancePaise = advance?.balancePaise ?? 0;
  const room = earnedPaise + bonusPaise - otherDeductionPaise;
  const advanceDeductionPaise = Math.min(keep.advanceDeductionPaise ?? advance?.installmentPaise ?? 0, advanceBalancePaise, room);
  return {
    employeeId: emp._id,
    code: emp.code,
    name: emp.name,
    designation: emp.designation,
    basicPaise: emp.basicPaise,
    allowancePaise: emp.allowancePaise,
    grossPaise,
    daysInMonth,
    days,
    payableDays,
    earnedPaise,
    bonusPaise,
    otherDeductionPaise,
    advanceBalancePaise,
    advanceDeductionPaise,
    advances: advance?.advances ?? [],
    advanceUpcomingPaise: advance?.upcomingPaise ?? 0,
    netPaise: room - advanceDeductionPaise,
    note: keep.note ?? null,
  };
}

async function findRun(id, session) {
  const run = await PayrollRun.findOne({ _id: id, ...accessibleBranchFilter() }).session(session ?? null);
  if (!run) throw ApiError.notFound('Payroll');
  return run;
}

const assertDraft = (run) => {
  if (run.status !== PAYROLL_STATUS.DRAFT) throw ApiError.conflict(`Payroll ${run.runNo} is already finalised`, 'INVALID_STATE');
};

const totalsOf = (lines) => ({
  employees: lines.length,
  grossPaise: sum(lines, (l) => l.grossPaise),
  earnedPaise: sum(lines, (l) => l.earnedPaise),
  bonusPaise: sum(lines, (l) => l.bonusPaise),
  otherDeductionPaise: sum(lines, (l) => l.otherDeductionPaise),
  advanceDeductionPaise: sum(lines, (l) => l.advanceDeductionPaise),
  netPaise: sum(lines, (l) => l.netPaise),
  paidPaise: sum(lines.filter((l) => l.paid?.at), (l) => l.netPaise),
  unpaidCount: lines.filter((l) => !l.paid?.at).length,
});

function serializeRun(r, maps) {
  return {
    id: r._id,
    runNo: r.runNo,
    month: r.month,
    monthLabel: monthLabel(r.month),
    status: r.status,
    branch: pick(maps.branches, r.branchId),
    totals: totalsOf(r.lines),
    createdAt: r.createdAt,
    finalisedAt: r.finalisedAt,
    finalisedBy: pick(maps.users, r.finalisedBy),
  };
}

export async function listPayrollRuns({ page, limit, branchId, month }) {
  const filter = { ...accessibleBranchFilter() };
  if (branchId) filter.branchId = oid(branchId);
  if (month) filter.month = month;
  const { items, meta } = await paginate(PayrollRun.find(filter).sort({ month: -1, createdAt: -1 }), PayrollRun.countDocuments(filter), { page, limit });
  const maps = await nameMaps({ branchIds: items.map((r) => r.branchId), userIds: items.map((r) => r.finalisedBy) });
  return { items: items.map((r) => serializeRun(r, maps)), meta };
}

export async function getPayrollRun(id) {
  const run = (await findRun(id)).toObject();
  const maps = await nameMaps({ branchIds: [run.branchId], userIds: [run.finalisedBy, ...run.lines.map((l) => l.paid?.by)] });
  const photos = new Map((await Employee.find({ _id: { $in: run.lines.map((l) => l.employeeId) } }).select('photoFileId').lean()).map((e) => [String(e._id), e.photoFileId ?? null]));
  return {
    ...serializeRun(run, maps),
    lines: run.lines.map((l) => ({
      ...l,
      photoFileId: photos.get(String(l.employeeId)) ?? null,
      paid: l.paid?.at ? { mode: l.paid.mode, reference: l.paid.reference, at: l.paid.at, by: pick(maps.users, l.paid.by) } : null,
    })),
  };
}

async function rosterFor(branchId, month) {
  const { start, end } = monthBounds(month);
  return Employee.find(onRollsFilter(branchId, start, end)).sort({ name: 1 }).lean();
}

export async function createPayrollRun({ branchId, month }) {
  const { userId } = requireContext();
  const branch = await requireBranch(branchId, { active: false });
  const today = await todayContext();
  if (month > today.businessDate.slice(0, 7)) throw ApiError.badRequest('Payroll cannot be run for a future month', [{ path: 'month', message: 'Pick this month or an earlier one' }], 'VALIDATION_ERROR');
  const existing = await PayrollRun.findOne({ branchId: oid(branchId), month }).select('runNo').lean();
  if (existing) throw ApiError.conflict(`Payroll for ${monthLabel(month)} at ${branch.name} already exists (${existing.runNo})`, 'DUPLICATE', [{ path: 'month', message: 'Already created' }]);
  const employees = await rosterFor(branchId, month);
  if (!employees.length) throw ApiError.badRequest(`No employees were on ${branch.name}’s rolls in ${monthLabel(month)}`, [{ path: 'branchId', message: 'No employees' }], 'VALIDATION_ERROR');
  const ids = employees.map((e) => e._id);
  const [counts, advances] = await Promise.all([attendanceCounts(employees, month), openAdvanceBalances(ids, month)]);

  const run = await withTransaction(async (session) => {
    const runNo = await nextDocumentNo({ prefix: 'PAY', branchCode: branch.code, financialYear: today.financialYear }, { session });
    const [doc] = await PayrollRun.create([{ runNo, branchId: branch._id, month, lines: employees.map((e) => buildLine(e, month, counts, advances.get(String(e._id)))), createdBy: userId }], { session });
    await recordAudit({ action: AUDIT_ACTIONS.CREATE, module: 'payroll', recordType: 'PayrollRun', recordId: doc._id, meta: { name: runNo, month } }, { session });
    return doc;
  });
  return getPayrollRun(run._id);
}

/** Re-read attendance, advances and salaries (e.g. after correcting attendance), keeping manual figures. */
export async function recalculatePayrollRun(id) {
  const run = await findRun(id);
  assertDraft(run);
  const employees = await rosterFor(run.branchId, run.month);
  const ids = employees.map((e) => e._id);
  const [counts, advances] = await Promise.all([attendanceCounts(employees, run.month), openAdvanceBalances(ids, run.month)]);
  const kept = new Map(run.lines.map((l) => [String(l.employeeId), l]));
  run.lines = employees.map((e) => {
    const k = kept.get(String(e._id));
    return buildLine(e, run.month, counts, advances.get(String(e._id)), k ? { bonusPaise: k.bonusPaise, otherDeductionPaise: k.otherDeductionPaise, advanceDeductionPaise: k.advanceDeductionPaise, note: k.note } : {});
  });
  await run.save();
  return getPayrollRun(id);
}

export async function updatePayrollLine(id, employeeId, { bonusPaise, otherDeductionPaise, advanceDeductionPaise, note }) {
  const run = await findRun(id);
  assertDraft(run);
  const line = run.lines.find((l) => String(l.employeeId) === employeeId);
  if (!line) throw ApiError.notFound('Employee in this payroll');
  if (advanceDeductionPaise > line.advanceBalancePaise) {
    throw ApiError.badRequest('More than the advance outstanding', [{ path: 'advanceDeductionPaise', message: `Outstanding advance is only ₹${(line.advanceBalancePaise / 100).toLocaleString('en-IN')}` }], 'VALIDATION_ERROR');
  }
  const net = line.earnedPaise + bonusPaise - otherDeductionPaise - advanceDeductionPaise;
  if (net < 0) throw ApiError.badRequest('Deductions are more than the salary', [{ path: 'otherDeductionPaise', message: 'Net pay cannot be below zero' }], 'VALIDATION_ERROR');
  Object.assign(line, { bonusPaise, otherDeductionPaise, advanceDeductionPaise, note: note ?? null, netPaise: net });
  run.markModified('lines');
  await run.save();
  return getPayrollRun(id);
}

export async function deletePayrollRun(id) {
  const run = await findRun(id);
  assertDraft(run);
  await run.deleteOne();
  await recordAudit({ action: AUDIT_ACTIONS.DELETE, module: 'payroll', recordType: 'PayrollRun', recordId: run._id, meta: { name: run.runNo } });
}

/** Books the month's salary: expense against salaries payable, and recovers advances. Attendance for the month locks. */
export async function finalisePayrollRun(id) {
  const { userId } = requireContext();
  const today = await todayContext();
  await withTransaction(async (session) => {
    const run = await findRun(id, session);
    assertDraft(run);
    const lines = run.lines;
    const label = monthLabel(run.month);

    // Recover advances oldest first; fail if someone else recovered them meanwhile.
    for (const line of lines.filter((l) => l.advanceDeductionPaise > 0)) {
      let left = line.advanceDeductionPaise;
      const open = await SalaryAdvance.find({ employeeId: line.employeeId, status: 'open', ...dueFilter(run.month) }).sort({ businessDate: 1, createdAt: 1 }).session(session);
      for (const adv of open) {
        if (!left) break;
        const take = Math.min(left, adv.amountPaise - adv.recoveredPaise);
        adv.recoveredPaise += take;
        adv.recoveries.push({ runId: run._id, runNo: run.runNo, month: run.month, amountPaise: take, at: today.now });
        if (adv.recoveredPaise >= adv.amountPaise) adv.status = 'closed';
        await adv.save({ session });
        left -= take;
      }
      if (left > 0) throw ApiError.conflict(`${line.name}’s advance balance has changed. Recalculate the payroll and try again.`, 'STALE');
    }

    const branchId = run.branchId;
    await postJournal(
      {
        voucherType: 'payroll',
        date: today.now,
        businessDate: today.businessDate,
        financialYear: today.financialYear,
        narration: `Salary for ${label} (${run.runNo})`,
        source: { docType: 'payroll', docId: run._id, docNo: run.runNo },
        lines: [
          { account: 'salaries', debit: sum(lines, (l) => l.earnedPaise + l.bonusPaise - l.otherDeductionPaise), branchId },
          ...lines.map((l) => ({ account: 'salary_payable', credit: l.netPaise, party: { type: 'employee', id: l.employeeId }, branchId })),
          ...lines.map((l) => ({ account: 'staff_advances', credit: l.advanceDeductionPaise, party: { type: 'employee', id: l.employeeId }, branchId })),
        ],
      },
      { session },
    );
    // Nothing to pay out for a zero line.
    for (const l of lines) if (l.netPaise === 0) l.paid = { mode: null, reference: 'Nothing payable', at: today.now, by: userId };
    run.status = lines.every((l) => l.paid?.at) ? PAYROLL_STATUS.PAID : PAYROLL_STATUS.FINALISED;
    run.finalisedAt = today.now;
    run.finalisedBy = userId;
    run.markModified('lines');
    await run.save({ session });
    await recordAudit({ action: AUDIT_ACTIONS.STATUS_CHANGE, module: 'payroll', recordType: 'PayrollRun', recordId: run._id, meta: { name: run.runNo }, changes: [{ field: 'status', from: 'draft', to: run.status }] }, { session });
  });
  return getPayrollRun(id);
}

/** Pays out finalised salary (all unpaid, or the chosen employees): salaries payable against cash/bank. */
export async function payPayrollRun(id, { employeeIds, mode, reference }) {
  const { userId } = requireContext();
  const today = await todayContext();
  await withTransaction(async (session) => {
    const run = await findRun(id, session);
    if (run.status === PAYROLL_STATUS.DRAFT) throw ApiError.conflict('Finalise the payroll before paying salaries', 'INVALID_STATE');
    const wanted = employeeIds?.length ? new Set(employeeIds) : null;
    const toPay = run.lines.filter((l) => !l.paid?.at && (!wanted || wanted.has(String(l.employeeId))));
    if (!toPay.length) throw ApiError.conflict('Nothing left to pay for the selected employees', 'INVALID_STATE');
    const total = sum(toPay, (l) => l.netPaise);
    await postJournal(
      {
        voucherType: 'salary_payment',
        date: today.now,
        businessDate: today.businessDate,
        financialYear: today.financialYear,
        narration: `Salary paid for ${monthLabel(run.month)} (${run.runNo}) — ${toPay.length} employee${toPay.length > 1 ? 's' : ''}`,
        source: { docType: 'payroll', docId: run._id, docNo: run.runNo },
        lines: [
          ...toPay.map((l) => ({ account: 'salary_payable', debit: l.netPaise, party: { type: 'employee', id: l.employeeId }, branchId: run.branchId })),
          { account: MONEY_ACCOUNT[mode], credit: total, branchId: run.branchId },
        ],
      },
      { session },
    );
    for (const l of toPay) l.paid = { mode, reference: reference ?? null, at: today.now, by: userId };
    if (run.lines.every((l) => l.paid?.at)) run.status = PAYROLL_STATUS.PAID;
    run.markModified('lines');
    await run.save({ session });
    await recordAudit({ action: AUDIT_ACTIONS.UPDATE, module: 'payroll', recordType: 'PayrollRun', recordId: run._id, meta: { name: run.runNo, paid: toPay.length, amountPaise: total } }, { session });
  });
  return getPayrollRun(id);
}

// ---------------------------------------------------------------- monthly register

/** The whole month for a branch: every employee on the rolls, every day's mark, and the pay-day totals. */
export async function getAttendanceRegister({ branchId, month }) {
  await requireBranch(branchId, { active: false });
  const today = await todayContext();
  const { start, end, days } = monthBounds(month);
  const employees = await Employee.find(onRollsFilter(branchId, start, end)).sort({ name: 1 }).lean();
  const ids = employees.map((e) => e._id);
  const [records, run, offs] = await Promise.all([
    Attendance.find({ employeeId: { $in: ids }, date: { $gte: start, $lte: end } }).select('employeeId date status note').lean(),
    PayrollRun.findOne({ branchId: oid(branchId), month }).select('status runNo').lean(),
    offDays([branchId], start, end),
  ]);
  const byEmp = new Map();
  for (const r of records) {
    const m = byEmp.get(String(r.employeeId)) ?? {};
    m[r.date] = r.status;
    byEmp.set(String(r.employeeId), m);
  }
  const locked = Boolean(run && run.status !== PAYROLL_STATUS.DRAFT);
  return {
    month,
    days,
    today: today.businessDate,
    locked,
    lockedBy: locked ? run.runNo : null,
    payrollStatus: run?.status ?? null,
    offDays: Object.fromEntries(offs.get(String(branchId)) ?? []),
    employees: employees.map((e) => ({
      id: e._id,
      code: e.code,
      name: e.name,
      designation: e.designation,
      photoFileId: e.photoFileId ?? null,
      // Days outside these dates are not on the rolls and cannot be marked.
      from: e.joiningDate > start ? e.joiningDate : start,
      to: e.exitDate && e.exitDate < end ? e.exitDate : end,
      eligibleDays: eligibleDays(e, month),
      breaks: (e.breaks ?? []).filter((b) => b.to >= start && b.from <= end).map((b) => ({ from: b.from, to: b.to })),
      marks: byEmp.get(String(e._id)) ?? {},
    })),
  };
}

export async function saveAttendanceRegister({ branchId, month, entries }) {
  const { userId, organisationId } = requireContext();
  await requireBranch(branchId, { active: false });
  const today = await todayContext();
  const { start, end } = monthBounds(month);
  const bad = entries.find((e) => e.date < start || e.date > end);
  if (bad) throw ApiError.badRequest(`${bad.date} is not in ${monthLabel(month)}`, undefined, 'VALIDATION_ERROR');
  if (entries.some((e) => e.date > today.businessDate)) throw ApiError.badRequest('Attendance cannot be marked for future dates', undefined, 'VALIDATION_ERROR');
  if (entries.some((e) => e.date < today.businessDate) && !can('attendance.edit')) {
    throw ApiError.forbidden('Changing past days needs the "Edit attendance" permission.');
  }
  const run = await PayrollRun.findOne({ branchId: oid(branchId), month }).select('status runNo').lean();
  if (run && run.status !== PAYROLL_STATUS.DRAFT) {
    throw ApiError.conflict(`Payroll ${run.runNo} for ${monthLabel(month)} is already finalised, so this month’s attendance is locked.`, 'PAYROLL_LOCKED');
  }
  const employees = await Employee.find({ _id: { $in: [...new Set(entries.map((e) => e.employeeId))] }, ...onRollsFilter(branchId, start, end) }).lean();
  const byId = new Map(employees.map((e) => [String(e._id), e]));
  for (const e of entries) {
    const emp = byId.get(e.employeeId);
    if (!emp) throw ApiError.badRequest('Some employees are not on this branch’s rolls this month', undefined, 'VALIDATION_ERROR');
    if (!onRollsOn(emp, e.date)) {
      throw ApiError.badRequest(`${emp.name} was not on the rolls on ${e.date}`, undefined, 'VALIDATION_ERROR');
    }
  }
  const org = oid(organisationId);
  await Attendance.bulkWrite(
    entries.map((e) =>
      e.status
        ? { updateOne: { filter: { organisationId: org, employeeId: oid(e.employeeId), date: e.date }, update: { $set: { branchId: oid(branchId), status: e.status, markedBy: userId } }, upsert: true } }
        : { deleteOne: { filter: { organisationId: org, employeeId: oid(e.employeeId), date: e.date } } },
    ),
  );
  await recordAudit({ action: AUDIT_ACTIONS.UPDATE, module: 'attendance', recordType: 'Attendance', recordId: oid(branchId), meta: { name: `Attendance register ${month}`, entries: entries.length } });
  return getAttendanceRegister({ branchId, month });
}
