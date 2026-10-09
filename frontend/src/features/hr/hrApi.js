import { baseApi, unwrapData, unwrapList } from '../../services/baseApi.js';

const EMP_LIST = { type: 'Employee', id: 'LIST' };
const PAYROLL_LIST = { type: 'Payroll', id: 'LIST' };

export const hrApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    employeeList: build.query({
      query: (params) => ({ url: '/hr/employees', params }),
      transformResponse: unwrapList,
      providesTags: (r) => [EMP_LIST, ...(r?.items ?? []).map((e) => ({ type: 'Employee', id: e.id }))],
    }),
    employee: build.query({ query: (id) => ({ url: `/hr/employees/${id}` }), transformResponse: unwrapData, providesTags: (r, e, id) => [{ type: 'Employee', id }, 'Payroll', 'Attendance'] }),
    createEmployee: build.mutation({ query: (data) => ({ url: '/hr/employees', method: 'post', data }), transformResponse: unwrapData, invalidatesTags: [EMP_LIST, 'Audit'] }),
    updateEmployee: build.mutation({
      query: ({ id, ...data }) => ({ url: `/hr/employees/${id}`, method: 'put', data }),
      transformResponse: unwrapData,
      invalidatesTags: (r, e, { id }) => [{ type: 'Employee', id }, EMP_LIST, 'Audit'],
    }),
    setEmployeeStatus: build.mutation({
      query: ({ id, ...data }) => ({ url: `/hr/employees/${id}/status`, method: 'patch', data }),
      transformResponse: unwrapData,
      invalidatesTags: (r, e, { id }) => [{ type: 'Employee', id }, EMP_LIST, 'Attendance', 'Audit'],
    }),

    attendanceDay: build.query({ query: (params) => ({ url: '/hr/attendance', params }), transformResponse: unwrapData, providesTags: ['Attendance'] }),
    attendanceRegister: build.query({ query: (params) => ({ url: '/hr/attendance/register', params }), transformResponse: unwrapData, providesTags: ['Attendance'] }),
    saveAttendanceRegister: build.mutation({ query: (data) => ({ url: '/hr/attendance/register', method: 'put', data }), transformResponse: unwrapData, invalidatesTags: ['Attendance', 'Employee', 'Payroll', 'Audit'] }),
    attendanceCalendar: build.query({ query: (params) => ({ url: '/hr/attendance/calendar', params }), transformResponse: unwrapData, providesTags: ['Attendance'] }),
    saveAttendanceCalendar: build.mutation({ query: (data) => ({ url: '/hr/attendance/calendar', method: 'put', data }), transformResponse: unwrapData, invalidatesTags: ['Attendance', 'Payroll', 'Employee', 'Audit'] }),
    saveAttendance: build.mutation({ query: (data) => ({ url: '/hr/attendance', method: 'put', data }), transformResponse: unwrapData, invalidatesTags: ['Attendance', 'Employee', 'Audit'] }),

    advanceList: build.query({ query: (params) => ({ url: '/hr/advances', params }), transformResponse: unwrapList, providesTags: ['Payroll'] }),
    createAdvance: build.mutation({ query: (data) => ({ url: '/hr/advances', method: 'post', data }), transformResponse: unwrapData, invalidatesTags: ['Payroll', 'Employee', 'Audit'] }),

    payrollList: build.query({ query: (params) => ({ url: '/hr/payroll', params }), transformResponse: unwrapList, providesTags: [PAYROLL_LIST, 'Payroll'] }),
    payrollRun: build.query({ query: (id) => ({ url: `/hr/payroll/${id}` }), transformResponse: unwrapData, providesTags: (r, e, id) => [{ type: 'Payroll', id }] }),
    createPayroll: build.mutation({ query: (data) => ({ url: '/hr/payroll', method: 'post', data }), transformResponse: unwrapData, invalidatesTags: ['Payroll', 'Attendance', 'Audit'] }),
    recalculatePayroll: build.mutation({ query: (id) => ({ url: `/hr/payroll/${id}/recalculate`, method: 'post' }), transformResponse: unwrapData, invalidatesTags: ['Payroll'] }),
    updatePayrollLine: build.mutation({
      query: ({ id, employeeId, ...data }) => ({ url: `/hr/payroll/${id}/lines/${employeeId}`, method: 'put', data }),
      transformResponse: unwrapData,
      invalidatesTags: ['Payroll'],
    }),
    deletePayroll: build.mutation({ query: (id) => ({ url: `/hr/payroll/${id}`, method: 'delete' }), invalidatesTags: ['Payroll', 'Attendance', 'Audit'] }),
    finalisePayroll: build.mutation({ query: (id) => ({ url: `/hr/payroll/${id}/finalise`, method: 'post' }), transformResponse: unwrapData, invalidatesTags: ['Payroll', 'Employee', 'Attendance', 'Audit'] }),
    payPayroll: build.mutation({ query: ({ id, ...data }) => ({ url: `/hr/payroll/${id}/pay`, method: 'post', data }), transformResponse: unwrapData, invalidatesTags: ['Payroll', 'Employee', 'Audit'] }),
  }),
});

export const {
  useEmployeeListQuery,
  useEmployeeQuery,
  useCreateEmployeeMutation,
  useUpdateEmployeeMutation,
  useSetEmployeeStatusMutation,
  useAttendanceDayQuery,
  useSaveAttendanceMutation,
  useAttendanceCalendarQuery,
  useSaveAttendanceCalendarMutation,
  useAttendanceRegisterQuery,
  useSaveAttendanceRegisterMutation,
  useAdvanceListQuery,
  useCreateAdvanceMutation,
  usePayrollListQuery,
  usePayrollRunQuery,
  useCreatePayrollMutation,
  useRecalculatePayrollMutation,
  useUpdatePayrollLineMutation,
  useDeletePayrollMutation,
  useFinalisePayrollMutation,
  usePayPayrollMutation,
} = hrApi;
