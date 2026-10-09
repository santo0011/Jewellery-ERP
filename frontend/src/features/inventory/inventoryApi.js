import { baseApi, unwrapData, unwrapList } from '../../services/baseApi.js';

const stockChange = ['Stock', 'Product', 'Audit', 'Approval'];

export const inventoryApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    stockSummary: build.query({ query: (params) => ({ url: '/inventory/summary', params }), transformResponse: unwrapData, providesTags: ['Stock'] }),
    stockMovements: build.query({ query: (params) => ({ url: '/inventory/movements', params }), transformResponse: unwrapList, providesTags: ['Stock'] }),
    openingEntries: build.query({ query: (params) => ({ url: '/inventory/opening', params }), transformResponse: unwrapList, providesTags: ['Stock'] }),
    adjustments: build.query({ query: (params) => ({ url: '/inventory/adjustments', params }), transformResponse: unwrapList, providesTags: ['Stock'] }),
    transfers: build.query({ query: (params) => ({ url: '/inventory/transfers', params }), transformResponse: unwrapList, providesTags: ['Stock'] }),
    createOpening: build.mutation({ query: (data) => ({ url: '/inventory/opening', method: 'post', data }), transformResponse: unwrapData, invalidatesTags: stockChange }),
    createAdjustment: build.mutation({ query: (data) => ({ url: '/inventory/adjustments', method: 'post', data }), transformResponse: unwrapData, invalidatesTags: stockChange }),
    createTransfer: build.mutation({ query: (data) => ({ url: '/inventory/transfers', method: 'post', data }), transformResponse: unwrapData, invalidatesTags: stockChange }),
    receiveTransfer: build.mutation({ query: (id) => ({ url: `/inventory/transfers/${id}/receive`, method: 'post' }), transformResponse: unwrapData, invalidatesTags: stockChange }),
    rejectTransfer: build.mutation({
      query: ({ id, reason }) => ({ url: `/inventory/transfers/${id}/reject`, method: 'post', data: { reason } }),
      transformResponse: unwrapData,
      invalidatesTags: stockChange,
    }),
  }),
});

export const {
  useStockSummaryQuery,
  useStockMovementsQuery,
  useOpeningEntriesQuery,
  useAdjustmentsQuery,
  useTransfersQuery,
  useCreateOpeningMutation,
  useCreateAdjustmentMutation,
  useCreateTransferMutation,
  useReceiveTransferMutation,
  useRejectTransferMutation,
} = inventoryApi;
