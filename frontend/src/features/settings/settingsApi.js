import { baseApi, unwrapData } from '../../services/baseApi.js';

export const settingsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    settings: build.query({ query: () => ({ url: '/settings' }), transformResponse: unwrapData, providesTags: ['Settings'] }),
    updateSettings: build.mutation({
      query: ({ section, values }) => ({ url: `/settings/${section}`, method: 'put', data: values }),
      transformResponse: unwrapData,
      invalidatesTags: ['Audit', 'Me'],
      async onQueryStarted(arg, { dispatch, queryFulfilled }) {
        const { data } = await queryFulfilled.catch(() => ({}));
        if (data) dispatch(settingsApi.util.upsertQueryData('settings', undefined, data));
      },
    }),
  }),
});

export const { useSettingsQuery, useUpdateSettingsMutation } = settingsApi;
