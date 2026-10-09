import { baseApi, unwrapData, unwrapList } from '../../services/baseApi.js';

/** Catalogue items: saved once, picked on purchases and orders. */
export const itemApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    itemList: build.query({ query: (params) => ({ url: '/items', params }), transformResponse: unwrapList, providesTags: ['Item'] }),
    createItem: build.mutation({ query: (data) => ({ url: '/items', method: 'post', data }), transformResponse: unwrapData, invalidatesTags: ['Item', 'Audit'] }),
    updateItem: build.mutation({ query: ({ id, ...data }) => ({ url: `/items/${id}`, method: 'put', data }), transformResponse: unwrapData, invalidatesTags: ['Item', 'Audit'] }),
    setItemStatus: build.mutation({ query: ({ id, status }) => ({ url: `/items/${id}/status`, method: 'patch', data: { status } }), transformResponse: unwrapData, invalidatesTags: ['Item', 'Audit'] }),
  }),
});

export const { useItemListQuery, useCreateItemMutation, useUpdateItemMutation, useSetItemStatusMutation } = itemApi;
