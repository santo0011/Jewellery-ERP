import { baseApi, unwrapData } from '../../services/baseApi.js';

/** The organisation's own subscription: plans, checkout through Cashfree, confirming a payment. */
export const billingApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    myBilling: build.query({ query: () => ({ url: '/billing' }), transformResponse: unwrapData, providesTags: ['Billing'] }),
    checkout: build.mutation({ query: (data) => ({ url: '/billing/checkout', method: 'post', data }), transformResponse: unwrapData }),
    startUpi: build.mutation({ query: ({ orderId, ...data }) => ({ url: `/billing/payments/${orderId}/upi`, method: 'post', data }), transformResponse: unwrapData }),
    verifyPayment: build.mutation({ query: (orderId) => ({ url: `/billing/payments/${orderId}/verify`, method: 'post' }), transformResponse: unwrapData, invalidatesTags: ['Billing', 'Me'] }),
  }),
});

export const { useMyBillingQuery, useCheckoutMutation, useStartUpiMutation, useVerifyPaymentMutation } = billingApi;
