import { baseApi, unwrapData, unwrapList } from '../../services/baseApi.js';

// Old gold moves stock (the old-gold pool) and money, so stock pages and the books refetch too.
const oldGoldChange = ['OldGold', 'Stock', 'Finance', 'Customer', 'Audit'];

export const oldGoldApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    oldGoldList: build.query({ query: (params) => ({ url: '/old-gold', params }), transformResponse: unwrapList, providesTags: ['OldGold'] }),
    oldGold: build.query({ query: (id) => ({ url: `/old-gold/${id}` }), transformResponse: unwrapData, providesTags: ['OldGold'] }),
    buyOldGold: build.mutation({ query: (data) => ({ url: '/old-gold', method: 'post', data }), transformResponse: unwrapData, invalidatesTags: oldGoldChange }),
    cancelOldGold: build.mutation({ query: ({ id, reason }) => ({ url: `/old-gold/${id}/cancel`, method: 'post', data: { reason } }), transformResponse: unwrapData, invalidatesTags: oldGoldChange }),
  }),
});

export const { useOldGoldListQuery, useOldGoldQuery, useBuyOldGoldMutation, useCancelOldGoldMutation } = oldGoldApi;
