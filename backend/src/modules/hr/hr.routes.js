import { Router } from 'express';
import {
  advanceListQuerySchema, attendanceCalendarQuerySchema, attendanceCalendarSchema, attendanceQuerySchema, attendanceRegisterQuerySchema, attendanceRegisterSaveSchema, attendanceSaveSchema, employeeListQuerySchema, employeeSchema, employeeStatusSchema, idParamsSchema,
  payrollCreateSchema, payrollLineParamsSchema, payrollLineSchema, payrollListQuerySchema, payrollPaySchema, salaryAdvanceSchema, salaryAdvanceUpdateSchema,
} from '@jerp/shared/schemas';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { singleImageUpload } from '../../middleware/upload.js';
import { validate } from '../../middleware/validate.js';
import * as c from './hr.controller.js';

const router = Router();
router.use(authenticate);

router.get('/employees', authorize('employee.view'), validate({ query: employeeListQuerySchema }), c.listEmployees);
router.post('/employees', authorize('employee.create'), validate({ body: employeeSchema }), c.createEmployee);
router.get('/employees/:id', authorize('employee.view'), validate({ params: idParamsSchema }), c.getEmployee);
router.put('/employees/:id', authorize('employee.edit'), validate({ params: idParamsSchema, body: employeeSchema }), c.updateEmployee);
router.put('/employees/:id/photo', authorize('employee.edit'), validate({ params: idParamsSchema }), singleImageUpload('photo', { maxBytes: 2 * 1024 * 1024 }), c.setEmployeePhoto);
router.delete('/employees/:id/photo', authorize('employee.edit'), validate({ params: idParamsSchema }), c.removeEmployeePhoto);
router.patch('/employees/:id/status', authorize('employee.edit'), validate({ params: idParamsSchema, body: employeeStatusSchema }), c.setEmployeeStatus);

router.get('/attendance', authorize('attendance.view'), validate({ query: attendanceQuerySchema }), c.getAttendance);
router.put('/attendance', authorize('attendance.mark'), validate({ body: attendanceSaveSchema }), c.saveAttendance);
router.get('/attendance/calendar', authorize('attendance.view'), validate({ query: attendanceCalendarQuerySchema }), c.getCalendar);
router.put('/attendance/calendar', authorize('attendance.edit'), validate({ body: attendanceCalendarSchema }), c.saveCalendar);
router.get('/attendance/register', authorize('attendance.view'), validate({ query: attendanceRegisterQuerySchema }), c.getRegister);
router.put('/attendance/register', authorize('attendance.mark'), validate({ body: attendanceRegisterSaveSchema }), c.saveRegister);

router.get('/advances', authorize('payroll.view'), validate({ query: advanceListQuerySchema }), c.listAdvances);
router.post('/advances', authorize('payroll.process'), validate({ body: salaryAdvanceSchema }), c.createAdvance);
router.put('/advances/:id', authorize('payroll.process'), validate({ params: idParamsSchema, body: salaryAdvanceUpdateSchema }), c.updateAdvance);

router.get('/payroll', authorize('payroll.view'), validate({ query: payrollListQuerySchema }), c.listPayroll);
router.post('/payroll', authorize('payroll.process'), validate({ body: payrollCreateSchema }), c.createPayroll);
router.get('/payroll/:id', authorize('payroll.view'), validate({ params: idParamsSchema }), c.getPayroll);
router.delete('/payroll/:id', authorize('payroll.process'), validate({ params: idParamsSchema }), c.deletePayroll);
router.post('/payroll/:id/recalculate', authorize('payroll.process'), validate({ params: idParamsSchema }), c.recalculatePayroll);
router.put('/payroll/:id/lines/:employeeId', authorize('payroll.process'), validate({ params: payrollLineParamsSchema, body: payrollLineSchema }), c.updatePayrollLine);
router.post('/payroll/:id/finalise', authorize('payroll.approve'), validate({ params: idParamsSchema }), c.finalisePayroll);
router.post('/payroll/:id/pay', authorize('payroll.approve'), validate({ params: idParamsSchema, body: payrollPaySchema }), c.payPayroll);

export default router;
