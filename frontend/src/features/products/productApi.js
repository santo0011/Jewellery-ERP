import { unwrapData } from '../../services/baseApi.js';
import { injectCrud } from '../../services/crudApi.js';

const imageTags = (r, e, { id }) => [{ type: 'Product', id }, { type: 'Product', id: 'LIST' }];

export const productApi = injectCrud('product', { tag: 'Product', path: '/products', statusRoute: false }, (build) => ({
  addProductImage: build.mutation({
    query: ({ id, file }) => {
      const data = new FormData();
      data.append('image', file);
      return { url: `/products/${id}/images`, method: 'post', data };
    },
    transformResponse: unwrapData,
    invalidatesTags: imageTags,
  }),
  removeProductImage: build.mutation({
    query: ({ id, fileId }) => ({ url: `/products/${id}/images/${fileId}`, method: 'delete' }),
    transformResponse: unwrapData,
    invalidatesTags: imageTags,
  }),
  setPrimaryProductImage: build.mutation({
    query: ({ id, fileId }) => ({ url: `/products/${id}/images/${fileId}/primary`, method: 'patch' }),
    transformResponse: unwrapData,
    invalidatesTags: imageTags,
  }),
}));

export const {
  useProductListQuery,
  useProductQuery,
  useCreateProductMutation,
  useUpdateProductMutation,
  useDeleteProductMutation,
  useAddProductImageMutation,
  useRemoveProductImageMutation,
  useSetPrimaryProductImageMutation,
} = productApi;
