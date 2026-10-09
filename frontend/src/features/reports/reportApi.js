import { baseApi, unwrapData } from '../../services/baseApi.js';

export const reportApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    reportList: build.query({ query: () => ({ url: '/reports' }), transformResponse: unwrapData }),
    // Reports read across sales, stock, HR and accounts, so refetch whenever any of them change.
    report: build.query({
      query: ({ key, ...params }) => ({ url: `/reports/${key}`, params }),
      transformResponse: unwrapData,
      providesTags: ['Sale', 'Stock', 'Product', 'Customer', 'Order', 'Payroll', 'Attendance', 'Employee'],
    }),
  }),
});

export const { useReportListQuery, useReportQuery } = reportApi;
