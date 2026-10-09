import { baseApi, unwrapData } from '../../services/baseApi.js';

export const roleApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    roles: build.query({
      query: () => ({ url: '/roles' }),
      transformResponse: unwrapData,
      providesTags: (result) => [{ type: 'Role', id: 'LIST' }, ...(result ?? []).map((r) => ({ type: 'Role', id: r.id }))],
    }),
    role: build.query({ query: (id) => ({ url: `/roles/${id}` }), transformResponse: unwrapData, providesTags: (r, e, id) => [{ type: 'Role', id }] }),
    createRole: build.mutation({
      query: (data) => ({ url: '/roles', method: 'post', data }),
      transformResponse: unwrapData,
      invalidatesTags: [{ type: 'Role', id: 'LIST' }, 'Audit'],
    }),
    updateRole: build.mutation({
      query: ({ id, ...data }) => ({ url: `/roles/${id}`, method: 'put', data }),
      transformResponse: unwrapData,
      invalidatesTags: (r, e, { id }) => [{ type: 'Role', id }, { type: 'Role', id: 'LIST' }, 'Me', 'Audit'],
    }),
    duplicateRole: build.mutation({
      query: (id) => ({ url: `/roles/${id}/duplicate`, method: 'post' }),
      transformResponse: unwrapData,
      invalidatesTags: [{ type: 'Role', id: 'LIST' }, 'Audit'],
    }),
    deleteRole: build.mutation({
      query: (id) => ({ url: `/roles/${id}`, method: 'delete' }),
      invalidatesTags: [{ type: 'Role', id: 'LIST' }, 'Audit'],
    }),
  }),
});

export const { useRolesQuery, useRoleQuery, useCreateRoleMutation, useUpdateRoleMutation, useDuplicateRoleMutation, useDeleteRoleMutation } = roleApi;
