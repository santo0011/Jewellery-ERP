import { baseApi, TAGS, unwrapData, unwrapList } from '../../services/baseApi.js';

/*
 * Undo for the organisation and branch panels. Undoing can change almost anything (stock, bills, ledgers, settings),
 * so a done undo refreshes every cached list and record.
 */
export const undoApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    undoStacks: build.query({ query: () => ({ url: '/undo/stacks' }), transformResponse: unwrapData, providesTags: ['Undo'] }),
    undoHistory: build.query({ query: (params) => ({ url: '/undo/history', params }), transformResponse: unwrapList, providesTags: ['Undo'] }),
    undoAction: build.mutation({ query: ({ id, reason }) => ({ url: `/undo/${id}/undo`, method: 'post', data: { reason } }), transformResponse: unwrapData, invalidatesTags: [...TAGS, 'Undo'] }),
    dismissAction: build.mutation({ query: ({ id, reason }) => ({ url: `/undo/${id}/dismiss`, method: 'post', data: { reason } }), transformResponse: unwrapData, invalidatesTags: ['Undo', 'Audit'] }),
  }),
});

export const { useUndoStacksQuery, useLazyUndoStacksQuery, useUndoHistoryQuery, useUndoActionMutation, useDismissActionMutation } = undoApi;
