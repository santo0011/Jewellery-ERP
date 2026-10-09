import { baseApi, unwrapData, unwrapList } from '../../services/baseApi.js';

export const saleApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    sales: build.query({
      query: (params) => ({ url: '/sales', params }),
      transformResponse: unwrapList,
      providesTags: (result) => [{ type: 'Sale', id: 'LIST' }, ...(result?.items ?? []).map((s) => ({ type: 'Sale', id: s.id }))],
    }),
    sale: build.query({ query: (id) => ({ url: `/sales/${id}` }), transformResponse: unwrapData, providesTags: (r, e, id) => [{ type: 'Sale', id }] }),
    // A mutation so the bill re-prices on demand without caching stale rates.
    quoteSale: build.mutation({ query: (data) => ({ url: '/sales/quote', method: 'post', data }), transformResponse: unwrapData }),
    createSale: build.mutation({
      query: ({ idempotencyKey, ...data }) => ({ url: '/sales', method: 'post', data, headers: { 'Idempotency-Key': idempotencyKey } }),
      transformResponse: unwrapData,
      invalidatesTags: [{ type: 'Sale', id: 'LIST' }, { type: 'Order', id: 'LIST' }, 'Order', 'Product', 'Stock', 'Audit'],
    }),
    cancelSale: build.mutation({
      query: ({ id, reason }) => ({ url: `/sales/${id}/cancel`, method: 'post', data: { reason } }),
      transformResponse: unwrapData,
      invalidatesTags: (r, e, { id }) => [{ type: 'Sale', id }, { type: 'Sale', id: 'LIST' }, 'Order', 'Product', 'Stock', 'Audit'],
    }),
    setProductHuid: build.mutation({
      query: ({ id, huid }) => ({ url: `/products/${id}/huid`, method: 'patch', data: { huid } }),
      transformResponse: unwrapData,
      invalidatesTags: (r, e, { id }) => [{ type: 'Product', id }, { type: 'Product', id: 'LIST' }, 'Order', 'Audit'],
    }),
    lookupProduct: build.query({ query: (code) => ({ url: `/products/lookup/${encodeURIComponent(code)}` }), transformResponse: unwrapData }),
  }),
});

export const { useSalesQuery, useSaleQuery, useQuoteSaleMutation, useCreateSaleMutation, useCancelSaleMutation, useLazyLookupProductQuery, useSetProductHuidMutation } = saleApi;
