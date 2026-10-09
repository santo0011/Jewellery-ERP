import { baseApi, unwrapData, unwrapList } from '../../services/baseApi.js';

const listTag = { type: 'User', id: 'LIST' };

export const userApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    users: build.query({
      query: (params) => ({ url: '/users', params }),
      transformResponse: unwrapList,
      providesTags: (result) => [listTag, ...(result?.items ?? []).map((u) => ({ type: 'User', id: u.id }))],
    }),
    createUser: build.mutation({
      query: (data) => ({ url: '/users', method: 'post', data }),
      transformResponse: unwrapData,
      invalidatesTags: [listTag, { type: 'Role', id: 'LIST' }, 'Audit'],
    }),
    updateUser: build.mutation({
      query: ({ id, ...data }) => ({ url: `/users/${id}`, method: 'put', data }),
      transformResponse: unwrapData,
      invalidatesTags: (r, e, { id }) => [{ type: 'User', id }, listTag, { type: 'Role', id: 'LIST' }, 'Me', 'Audit'],
    }),
    setUserStatus: build.mutation({
      query: ({ id, status }) => ({ url: `/users/${id}/status`, method: 'patch', data: { status } }),
      transformResponse: unwrapData,
      invalidatesTags: (r, e, { id }) => [{ type: 'User', id }, listTag, 'Audit'],
    }),
    resetUserPassword: build.mutation({
      query: ({ id, password }) => ({ url: `/users/${id}/reset-password`, method: 'post', data: { password } }),
      invalidatesTags: (r, e, { id }) => [{ type: 'User', id }, 'Audit'],
    }),
  }),
});

export const { useUsersQuery, useCreateUserMutation, useUpdateUserMutation, useSetUserStatusMutation, useResetUserPasswordMutation } = userApi;
