import { baseApi, unwrapData, unwrapList } from '../../services/baseApi.js';

export const rateApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    currentRates: build.query({ query: () => ({ url: '/rates/current' }), transformResponse: unwrapData, providesTags: ['Rate'] }),
    rateHistory: build.query({ query: (params) => ({ url: '/rates/history', params }), transformResponse: unwrapList, providesTags: ['Rate'] }),
    setRates: build.mutation({ query: (data) => ({ url: '/rates', method: 'post', data }), transformResponse: unwrapData, invalidatesTags: ['Rate', 'Audit'] }),
  }),
});

export const { useCurrentRatesQuery, useRateHistoryQuery, useSetRatesMutation } = rateApi;
