import { baseApi, unwrapData, unwrapList } from '../../services/baseApi.js';

const changed = (r, e, { id }) => [{ type: 'Order', id }, { type: 'Order', id: 'LIST' }, 'Audit'];

export const orderApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    orders: build.query({
      query: (params) => ({ url: '/orders', params }),
      transformResponse: unwrapList,
      providesTags: (result) => [{ type: 'Order', id: 'LIST' }, ...(result?.items ?? []).map((o) => ({ type: 'Order', id: o.id }))],
    }),
    order: build.query({ query: (id) => ({ url: `/orders/${id}` }), transformResponse: unwrapData, providesTags: (r, e, id) => [{ type: 'Order', id }] }),
    createOrder: build.mutation({ query: (data) => ({ url: '/orders', method: 'post', data }), transformResponse: unwrapData, invalidatesTags: [{ type: 'Order', id: 'LIST' }, 'Audit'] }),
    updateOrder: build.mutation({ query: ({ id, ...data }) => ({ url: `/orders/${id}`, method: 'put', data }), transformResponse: unwrapData, invalidatesTags: changed }),
    addOrderAdvance: build.mutation({ query: ({ id, ...data }) => ({ url: `/orders/${id}/advances`, method: 'post', data }), transformResponse: unwrapData, invalidatesTags: changed }),
    // The customer's own gold: received after booking, or an entry made by mistake given back.
    addCustomerMetal: build.mutation({ query: ({ id, ...data }) => ({ url: `/orders/${id}/customer-metal`, method: 'post', data }), transformResponse: unwrapData, invalidatesTags: (r, e, { id }) => [{ type: 'Order', id }, { type: 'Order', id: 'LIST' }, 'Stock', 'Audit'] }),
    removeCustomerMetal: build.mutation({ query: ({ id, lineId }) => ({ url: `/orders/${id}/customer-metal/${lineId}`, method: 'delete' }), transformResponse: unwrapData, invalidatesTags: (r, e, { id }) => [{ type: 'Order', id }, { type: 'Order', id: 'LIST' }, 'Stock', 'Audit'] }),
    setOrderStatus: build.mutation({ query: ({ id, ...data }) => ({ url: `/orders/${id}/status`, method: 'patch', data }), transformResponse: unwrapData, invalidatesTags: changed }),
    finishOrderItem: build.mutation({
      query: ({ id, index, ...data }) => ({ url: `/orders/${id}/items/${index}/finish`, method: 'post', data }),
      transformResponse: unwrapData,
      invalidatesTags: (r, e, { id }) => [{ type: 'Order', id }, { type: 'Order', id: 'LIST' }, 'Product', 'Stock', 'Audit'],
    }),
    estimateOrder: build.mutation({ query: (data) => ({ url: '/orders/estimate', method: 'post', data }), transformResponse: unwrapData }),
    // A new order's starting point: the customer's advance from before (adjusted on booking) and dues from before.
    orderCustomerBalance: build.query({ query: (customerId) => ({ url: `/orders/customer-balance/${customerId}` }), transformResponse: unwrapData, providesTags: ['Customer', 'Sale', { type: 'Order', id: 'LIST' }] }),
    addOrderImage: build.mutation({
      query: ({ id, file }) => {
        const data = new FormData();
        data.append('image', file);
        return { url: `/orders/${id}/images`, method: 'post', data };
      },
      transformResponse: unwrapData,
      invalidatesTags: (r, e, { id }) => [{ type: 'Order', id }],
    }),
    removeOrderImage: build.mutation({
      query: ({ id, fileId }) => ({ url: `/orders/${id}/images/${fileId}`, method: 'delete' }),
      transformResponse: unwrapData,
      invalidatesTags: (r, e, { id }) => [{ type: 'Order', id }],
    }),
    cancelOrder: build.mutation({ query: ({ id, ...data }) => ({ url: `/orders/${id}/cancel`, method: 'post', data }), transformResponse: unwrapData, invalidatesTags: changed }),
  }),
});

export const { useOrdersQuery, useOrderQuery, useCreateOrderMutation, useUpdateOrderMutation, useAddOrderAdvanceMutation, useAddCustomerMetalMutation, useRemoveCustomerMetalMutation, useSetOrderStatusMutation, useCancelOrderMutation, useFinishOrderItemMutation, useEstimateOrderMutation, useOrderCustomerBalanceQuery, useAddOrderImageMutation, useRemoveOrderImageMutation } = orderApi;
