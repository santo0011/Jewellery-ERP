import { unwrapData } from '../../services/baseApi.js';
import { injectCrud } from '../../services/crudApi.js';

export const customerApi = injectCrud('customer', { tag: 'Customer', path: '/customers' }, (build) => ({
  customerActivity: build.query({
    query: (id) => ({ url: `/customers/${id}/activity` }),
    transformResponse: unwrapData,
    providesTags: (r, e, id) => [{ type: 'Customer', id }, 'Sale', 'Order'],
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
} = customerApi;
