import { baseApi, unwrapData, unwrapList } from './baseApi.js';

export function crudEndpoints(build, { tag, path }) {
  const list = { type: tag, id: 'LIST' };
  return {
    list: build.query({
      query: (params) => ({ url: path, params }),
      transformResponse: unwrapList,
      providesTags: (result) => [list, ...(result?.items ?? []).map((r) => ({ type: tag, id: r.id }))],
    }),
    get: build.query({ query: (id) => ({ url: `${path}/${id}` }), transformResponse: unwrapData, providesTags: (r, e, id) => [{ type: tag, id }] }),
    create: build.mutation({ query: (data) => ({ url: path, method: 'post', data }), transformResponse: unwrapData, invalidatesTags: [list, 'Audit'] }),
    update: build.mutation({
      query: ({ id, ...data }) => ({ url: `${path}/${id}`, method: 'put', data }),
      transformResponse: unwrapData,
      invalidatesTags: (r, e, { id }) => [{ type: tag, id }, list, 'Audit'],
    }),
    setStatus: build.mutation({
      query: ({ id, status }) => ({ url: `${path}/${id}/status`, method: 'patch', data: { status } }),
      transformResponse: unwrapData,
      invalidatesTags: (r, e, { id }) => [{ type: tag, id }, list, 'Audit'],
    }),
    remove: build.mutation({ query: (id) => ({ url: `${path}/${id}`, method: 'delete' }), invalidatesTags: (r, e, id) => [{ type: tag, id }, list, 'Audit'] }),
  };
}

export const injectCrud = (name, options, extra = () => ({})) => {
  const { statusRoute = true } = options;
  const api = baseApi.injectEndpoints({
    endpoints: (build) => {
      const crud = crudEndpoints(build, options);
      return {
        [`${name}List`]: crud.list,
        [`${name}`]: crud.get,
        [`create${cap(name)}`]: crud.create,
        [`update${cap(name)}`]: crud.update,
        ...(statusRoute && { [`set${cap(name)}Status`]: crud.setStatus }),
        [`delete${cap(name)}`]: crud.remove,
        ...extra(build),
      };
    },
  });
  return api;
};

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
