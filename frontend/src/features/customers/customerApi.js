import { unwrapData } from '../../services/baseApi.js';
import { injectCrud } from '../../services/crudApi.js';

export const customerApi = injectCrud('customer', { tag: 'Customer', path: '/customers' }, (build) => ({
  customerActivity: build.query({
    query: (id) => ({ url: `/customers/${id}/activity` }),
    transformResponse: unwrapData,
    providesTags: (r, e, id) => [{ type: 'Customer', id }, 'Sale', 'Order'],
  }),
  // Every change to the customer (who, when, old → new).
  customerHistory: build.query({ query: (id) => ({ url: `/customers/${id}/history` }), transformResponse: unwrapData, providesTags: (r, e, id) => [{ type: 'Customer', id }, 'Audit'] }),
  // What the customer still owes, and collecting it later.
  customerDues: build.query({ query: (id) => ({ url: `/customers/${id}/dues` }), transformResponse: unwrapData, providesTags: (r, e, id) => [{ type: 'Customer', id }, 'Sale'] }),
  collectDue: build.mutation({
    query: ({ customerId, ...data }) => ({ url: `/customers/${customerId}/payments`, method: 'post', data }),
    transformResponse: unwrapData,
    invalidatesTags: ['Customer', 'Sale', 'Order', 'Audit'],
  }),
}));

export const {
  useCustomerListQuery,
  useCustomerQuery,
  useCreateCustomerMutation,
  useUpdateCustomerMutation,
  useSetCustomerStatusMutation,
  useDeleteCustomerMutation,
  useCustomerActivityQuery,
  useCustomerDuesQuery,
  useCustomerHistoryQuery,
  useCollectDueMutation,
} = customerApi;
