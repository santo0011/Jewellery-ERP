import { baseApi, unwrapData, unwrapList } from '../../services/baseApi.js';

export const approvalApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    approvals: build.query({ query: (params) => ({ url: '/approvals', params }), transformResponse: unwrapList, providesTags: ['Approval'] }),
    pendingApprovals: build.query({ query: () => ({ url: '/approvals/pending-count' }), transformResponse: (r) => r.data.count, providesTags: ['Approval'] }),
    decideApproval: build.mutation({
      query: ({ id, decision, comment }) => ({ url: `/approvals/${id}/decision`, method: 'post', data: { decision, comment } }),
      transformResponse: unwrapData,
      invalidatesTags: ['Approval', 'Stock', 'Product', 'Audit'],
    }),
  }),
});

export const { useApprovalsQuery, usePendingApprovalsQuery, useDecideApprovalMutation } = approvalApi;
