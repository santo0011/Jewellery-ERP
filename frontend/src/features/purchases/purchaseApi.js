import { baseApi, unwrapData, unwrapList } from '../../services/baseApi.js';

/** Supplier bills (purchases) and orders placed with suppliers. Receiving a bill also moves stock. */
export const purchaseApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    purchaseList: build.query({ query: (params) => ({ url: '/purchases', params }), transformResponse: unwrapList, providesTags: ['Purchase'] }),
    purchase: build.query({ query: (id) => ({ url: `/purchases/${id}` }), transformResponse: unwrapData, providesTags: ['Purchase'] }),
    createPurchase: build.mutation({ query: (data) => ({ url: '/purchases', method: 'post', data }), transformResponse: unwrapData, invalidatesTags: ['Purchase', 'Product', 'Stock', 'Supplier', 'Audit'] }),
    addBillImage: build.mutation({
      query: ({ id, file }) => {
        const data = new FormData();
        data.append('image', file);
        return { url: `/purchases/${id}/bill-images`, method: 'post', data };
      },
      transformResponse: unwrapData,
      invalidatesTags: ['Purchase', 'Audit'],
    }),
    removeBillImage: build.mutation({
      query: ({ id, fileId }) => ({ url: `/purchases/${id}/bill-images/${fileId}`, method: 'delete' }),
      transformResponse: unwrapData,
      invalidatesTags: ['Purchase', 'Audit'],
    }),
    payPurchase: build.mutation({ query: ({ id, ...data }) => ({ url: `/purchases/${id}/payments`, method: 'post', data }), transformResponse: unwrapData, invalidatesTags: ['Purchase', 'Supplier', 'Audit'] }),
    purchaseOrderList: build.query({ query: (params) => ({ url: '/purchases/orders', params }), transformResponse: unwrapList, providesTags: ['Purchase'] }),
    purchaseOrder: build.query({ query: (id) => ({ url: `/purchases/orders/${id}` }), transformResponse: unwrapData, providesTags: ['Purchase'] }),
    createPurchaseOrder: build.mutation({ query: (data) => ({ url: '/purchases/orders', method: 'post', data }), transformResponse: unwrapData, invalidatesTags: ['Purchase', 'Audit'] }),
    cancelPurchaseOrder: build.mutation({ query: ({ id, ...data }) => ({ url: `/purchases/orders/${id}/cancel`, method: 'post', data }), transformResponse: unwrapData, invalidatesTags: ['Purchase', 'Audit'] }),
  }),
});

export const {
  usePurchaseListQuery,
  usePurchaseQuery,
  useCreatePurchaseMutation,
  useAddBillImageMutation,
  useRemoveBillImageMutation,
  usePayPurchaseMutation,
  usePurchaseOrderListQuery,
  usePurchaseOrderQuery,
  useCreatePurchaseOrderMutation,
  useCancelPurchaseOrderMutation,
} = purchaseApi;
