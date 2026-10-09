import { baseApi, unwrapData } from '../../services/baseApi.js';

const list = { type: 'Category', id: 'LIST' };

export const categoryApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    categories: build.query({ query: () => ({ url: '/categories' }), transformResponse: unwrapData, providesTags: [list] }),
    createCategory: build.mutation({ query: (data) => ({ url: '/categories', method: 'post', data }), transformResponse: unwrapData, invalidatesTags: [list, 'Audit'] }),
    updateCategory: build.mutation({
      query: ({ id, ...data }) => ({ url: `/categories/${id}`, method: 'put', data }),
      transformResponse: unwrapData,
      invalidatesTags: [list, 'Audit', { type: 'Product', id: 'LIST' }],
    }),
    deleteCategory: build.mutation({ query: (id) => ({ url: `/categories/${id}`, method: 'delete' }), invalidatesTags: [list, 'Audit'] }),
    addDefaultCategories: build.mutation({ query: () => ({ url: '/categories/defaults', method: 'post' }), invalidatesTags: [list, 'Audit'] }),
  }),
});

export const { useCategoriesQuery, useCreateCategoryMutation, useUpdateCategoryMutation, useDeleteCategoryMutation, useAddDefaultCategoriesMutation } = categoryApi;

export function buildCategoryTree(categories = []) {
  const roots = categories.filter((c) => !c.parentId);
  return roots.map((r) => ({ ...r, children: categories.filter((c) => String(c.parentId) === String(r.id)) }));
}
