import { injectCrud } from '../../services/crudApi.js';

export const supplierApi = injectCrud('supplier', { tag: 'Supplier', path: '/suppliers' });

export const {
  useSupplierListQuery,
  useSupplierQuery,
  useCreateSupplierMutation,
  useUpdateSupplierMutation,
  useSetSupplierStatusMutation,
  useDeleteSupplierMutation,
} = supplierApi;
