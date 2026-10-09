import { sendCreated, sendOk } from '../../utils/response.js';
import * as hr from './hr.service.js';

const listed = (fn) => async (req, res) => {
  const { items, meta } = await fn(req.valid.query);
  sendOk(res, items, { meta });
};

export const listEmployees = listed(hr.listEmployees);
export const getEmployee = async (req, res) => sendOk(res, await hr.getEmployee(req.valid.params.id));
export async function createEmployee(req, res) {
  const emp = await hr.createEmployee(req.valid.body);
  sendCreated(res, emp, { message: `Employee ${emp.code} added` });
}
export const updateEmployee = async (req, res) => sendOk(res, await hr.updateEmployee(req.valid.params.id, req.valid.body), { message: 'Employee updated' });
export const setEmployeeStatus = async (req, res) => sendOk(res, await hr.setEmployeeStatus(req.valid.params.id, req.valid.body), { message: 'Employee updated' });

export const getAttendance = async (req, res) => sendOk(res, await hr.getAttendanceDay(req.valid.query));
export const saveAttendance = async (req, res) => sendOk(res, await hr.saveAttendance(req.valid.body), { message: 'Attendance saved' });

export const getRegister = async (req, res) => sendOk(res, await hr.getAttendanceRegister(req.valid.query));
export const saveRegister = async (req, res) => sendOk(res, await hr.saveAttendanceRegister(req.valid.body), { message: 'Attendance saved' });

export const getCalendar = async (req, res) => sendOk(res, await hr.getAttendanceCalendar(req.valid.query));
export const saveCalendar = async (req, res) => sendOk(res, await hr.saveAttendanceCalendar(req.valid.body), { message: 'Holidays and weekly off saved' });

export const listAdvances = listed(hr.listAdvances);
export async function createAdvance(req, res) {
  const adv = await hr.createAdvance(req.valid.body);
  sendCreated(res, adv, { message: `Advance ${adv.advanceNo} recorded` });
}

export const listPayroll = listed(hr.listPayrollRuns);
export const getPayroll = async (req, res) => sendOk(res, await hr.getPayrollRun(req.valid.params.id));
export async function createPayroll(req, res) {
  const run = await hr.createPayrollRun(req.valid.body);
  sendCreated(res, run, { message: `Payroll ${run.runNo} created` });
}
export const recalculatePayroll = async (req, res) => sendOk(res, await hr.recalculatePayrollRun(req.valid.params.id), { message: 'Payroll recalculated' });
export const updatePayrollLine = async (req, res) =>
  sendOk(res, await hr.updatePayrollLine(req.valid.params.id, req.valid.params.employeeId, req.valid.body), { message: 'Salary updated' });
export async function deletePayroll(req, res) {
  await hr.deletePayrollRun(req.valid.params.id);
  sendOk(res, null, { message: 'Draft payroll deleted' });
}
export const finalisePayroll = async (req, res) => sendOk(res, await hr.finalisePayrollRun(req.valid.params.id), { message: 'Payroll finalised' });
export const payPayroll = async (req, res) => sendOk(res, await hr.payPayrollRun(req.valid.params.id, req.valid.body), { message: 'Salary payment recorded' });
