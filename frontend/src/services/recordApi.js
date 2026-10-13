import { baseApi, unwrapData } from './baseApi.js';

/**
 * Per type: the lists to refresh after a delete, and the changes that can make a record (un)deletable — e.g. a new
 * invoice means its customer can no longer be deleted.
 */
const TAGS_BY_TYPE = {
  customer: ['Customer', 'Sale', 'Order'],
  supplier: ['Supplier', 'Purchase', 'Product'],
  product: ['Product', 'Stock', 'Sale'],
  category: ['Category', 'Product', 'Item'],
  item: ['Item', 'Product', 'Purchase'],
  role: ['Role', 'User'],
  employee: ['Employee', 'Attendance', 'Payroll'],
  branch: ['Branch', 'Me', 'User', 'Employee'],
  user: ['User'],
  purchaseOrder: ['Purchase'],
  order: ['Order', 'Customer', 'Sale'],
};

/** The shared delete flow: ask whether a record can go (and why not), then delete it. */
export const recordApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    // Every row of a table page at once: { [id]: { deletable, message } }. Refreshed whenever that list changes.
    deleteChecks: build.query({
      query: ({ type, ids }) => ({ url: `/records/${type}/delete-checks`, method: 'post', data: { ids } }),
      transformResponse: unwrapData,
      providesTags: (r, e, { type }) => TAGS_BY_TYPE[type] ?? [],
    }),
    deleteCheck: build.query({ query: ({ type, id }) => ({ url: `/records/${type}/${id}/delete-check` }), transformResponse: unwrapData, keepUnusedDataFor: 0 }),
    deleteRecord: build.mutation({
      query: ({ type, id }) => ({ url: `/records/${type}/${id}`, method: 'delete' }),
      transformResponse: unwrapData,
      invalidatesTags: (r, e, { type }) => (e ? [] : [...(TAGS_BY_TYPE[type] ?? []), 'Audit']),
    }),
  }),
});

export const { useDeleteChecksQuery, useLazyDeleteCheckQuery, useDeleteRecordMutation } = recordApi;

/** Delete status for the rows on screen: call the result with a row id to get { deletable, message } (undefined while loading). */
export function useDeleteStatus(type, rows) {
  const ids = (rows ?? []).map((r) => String(r.id ?? r._id)).slice(0, 100);
  const { data } = useDeleteChecksQuery({ type, ids }, { skip: !ids.length });
  return (id) => data?.[String(id)];
}
