import { unwrapData } from '../../services/baseApi.js';
import { injectCrud } from '../../services/crudApi.js';

export const supplierApi = injectCrud('supplier', { tag: 'Supplier', path: '/suppliers' }, (build) => ({
  // Payments on the supplier's account (old balance first, then the oldest bills) and on single bills.
  supplierPayments: build.query({ query: (id) => ({ url: `/suppliers/${id}/payments` }), transformResponse: unwrapData, providesTags: ['Supplier', 'Purchase'] }),
  paySupplier: build.mutation({ query: ({ id, ...data }) => ({ url: `/suppliers/${id}/payments`, method: 'post', data }), transformResponse: unwrapData, invalidatesTags: ['Supplier', 'Purchase', 'Audit'] }),
}));

export const {
  useSupplierListQuery,
  useSupplierQuery,
  useCreateSupplierMutation,
  useUpdateSupplierMutation,
  useSetSupplierStatusMutation,
  useDeleteSupplierMutation,
  useSupplierPaymentsQuery,
  usePaySupplierMutation,
} = supplierApi;
