import { baseApi, unwrapList } from '../../services/baseApi.js';

export const auditApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    auditLogs: build.query({
      query: (params) => ({ url: '/audit-logs', params }),
      transformResponse: unwrapList,
      providesTags: ['Audit'],
    }),
  }),
});

export const { useAuditLogsQuery } = auditApi;
