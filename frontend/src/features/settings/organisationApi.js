import { baseApi, unwrapData } from '../../services/baseApi.js';

export const organisationApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    organisation: build.query({ query: () => ({ url: '/organisation' }), transformResponse: unwrapData, providesTags: ['Organisation'] }),
    updateOrganisation: build.mutation({
      query: (data) => ({ url: '/organisation', method: 'patch', data }),
      transformResponse: unwrapData,
      invalidatesTags: ['Organisation', 'Branch', 'Me', 'Audit'], // the head office branch shares the address
    }),
    // PIN code -> post offices, city, district, state (India Post), for the address form.
    pincode: build.query({ query: (pin) => ({ url: `/organisation/pincode/${pin}` }), transformResponse: unwrapData, keepUnusedDataFor: 3600 }),
    organisationHistory: build.query({ query: () => ({ url: '/organisation/history' }), transformResponse: unwrapData, providesTags: ['Organisation'] }),
    subscription: build.query({ query: () => ({ url: '/organisation/subscription' }), transformResponse: unwrapData, providesTags: ['Subscription'] }),
    uploadLogo: build.mutation({
      query: (file) => {
        const data = new FormData();
        data.append('logo', file);
        return { url: '/organisation/logo', method: 'put', data };
      },
      invalidatesTags: ['Logo', 'Me', 'Organisation', 'Audit'],
    }),
    removeLogo: build.mutation({ query: () => ({ url: '/organisation/logo', method: 'delete' }), invalidatesTags: ['Logo', 'Me', 'Organisation', 'Audit'] }),
  }),
});

export const { useLazyPincodeQuery, useOrganisationQuery, useOrganisationHistoryQuery, useUpdateOrganisationMutation, useSubscriptionQuery, useUploadLogoMutation, useRemoveLogoMutation } = organisationApi;
