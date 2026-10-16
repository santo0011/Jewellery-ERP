import { baseApi, unwrapData } from '../../services/baseApi.js';

export const settingsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    settings: build.query({ query: () => ({ url: '/settings' }), transformResponse: unwrapData, providesTags: ['Settings'] }),
    updateSettings: build.mutation({
      query: ({ section, values }) => ({ url: `/settings/${section}`, method: 'put', data: values }),
      transformResponse: unwrapData,
      // Print settings change how every bill prints: open invoices load their layout again.
      invalidatesTags: (r, e, { section }) => (section === 'print' ? ['Audit', 'Me', 'Sale'] : ['Audit', 'Me']),
      async onQueryStarted(arg, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled.catch(() => ({}));
        if (data) dispatch(settingsApi.util.upsertQueryData('settings', undefined, data));
      },
    }),
    // A branch's own print setup (its users never read the organisation's settings).
    branchPrint: build.query({ query: (branchId) => ({ url: `/settings/print/branches/${branchId}` }), transformResponse: unwrapData }),
    updateBranchPrint: build.mutation({
      query: ({ branchId, choice }) => ({ url: `/settings/print/branches/${branchId}`, method: 'put', data: { choice } }),
      transformResponse: unwrapData,
      invalidatesTags: ['Audit', 'Sale'],
      async onQueryStarted({ branchId }, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled.catch(() => ({}));
        if (data) dispatch(settingsApi.util.upsertQueryData('branchPrint', branchId, data));
      },
    }),
  }),
});

export const { useSettingsQuery, useUpdateSettingsMutation, useBranchPrintQuery, useUpdateBranchPrintMutation } = settingsApi;
