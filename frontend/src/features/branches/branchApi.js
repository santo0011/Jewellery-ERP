import { baseApi, unwrapData, unwrapList } from '../../services/baseApi.js';

export const branchApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    branches: build.query({
      query: (params) => ({ url: '/branches', params }),
      transformResponse: unwrapList,
      providesTags: (result) => [{ type: 'Branch', id: 'LIST' }, ...(result?.items ?? []).map((b) => ({ type: 'Branch', id: b._id }))],
    }),
    branchUsage: build.query({ query: () => ({ url: '/branches/usage' }), transformResponse: unwrapData, providesTags: [{ type: 'Branch', id: 'USAGE' }] }),
    setBranchPermissions: build.mutation({
      query: ({ id, permissions }) => ({ url: `/branches/${id}/permissions`, method: 'put', data: { permissions } }),
      transformResponse: unwrapData,
      invalidatesTags: (r, e, { id }) => [{ type: 'Branch', id }, { type: 'Branch', id: 'LIST' }, 'Me', 'Audit'],
    }),
    setBranchLogin: build.mutation({
      query: ({ id, ...data }) => ({ url: `/branches/${id}/login`, method: 'put', data }),
      transformResponse: unwrapData,
      invalidatesTags: (r, e, { id }) => [{ type: 'Branch', id }, { type: 'Branch', id: 'LIST' }, 'User', 'Audit'],
    }),
    branchDirectory: build.query({ query: () => ({ url: '/branches/directory' }), transformResponse: unwrapData, providesTags: [{ type: 'Branch', id: 'LIST' }] }),
    createBranch: build.mutation({
      query: (data) => ({ url: '/branches', method: 'post', data }),
      transformResponse: unwrapData,
      invalidatesTags: [{ type: 'Branch', id: 'LIST' }, { type: 'Branch', id: 'USAGE' }, 'Me', 'Audit'],
    }),
    updateBranch: build.mutation({
      query: ({ id, ...data }) => ({ url: `/branches/${id}`, method: 'put', data }),
      transformResponse: unwrapData,
      invalidatesTags: (r, e, { id }) => [{ type: 'Branch', id }, 'Me', 'Audit'],
    }),
    setBranchStatus: build.mutation({
      query: ({ id, status }) => ({ url: `/branches/${id}/status`, method: 'patch', data: { status } }),
      transformResponse: unwrapData,
      invalidatesTags: (r, e, { id }) => [{ type: 'Branch', id }, { type: 'Branch', id: 'LIST' }, { type: 'Branch', id: 'USAGE' }, 'Me', 'Audit'],
    }),
  }),
});

export const { useBranchUsageQuery, useSetBranchPermissionsMutation, useBranchDirectoryQuery, useBranchesQuery, useCreateBranchMutation, useUpdateBranchMutation, useSetBranchStatusMutation, useSetBranchLoginMutation } = branchApi;
