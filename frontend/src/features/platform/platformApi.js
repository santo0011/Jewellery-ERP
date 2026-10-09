import { createApi } from '@reduxjs/toolkit/query/react';
import axios from 'axios';
import { toQueryError } from '../../services/queryError.js';
import { platformSessionEnded, platformSignedIn } from './platformSlice.js';

const BASE_URL = '/api/v1/platform';
export const platformHttp = axios.create({ baseURL: BASE_URL, withCredentials: true, timeout: 30000 });

let store;
let refreshing = null;

export function injectPlatformStore(appStore) {
  store = appStore;
}

export function refreshPlatformToken() {
  if (!refreshing) {
    refreshing = axios
      .post(`${BASE_URL}/auth/refresh`, null, { withCredentials: true })
      .then((res) => {
        store.dispatch(platformSignedIn(res.data.data.accessToken));
        return res.data.data.accessToken;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

platformHttp.interceptors.request.use((config) => {
  const token = store.getState().platform.accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

platformHttp.interceptors.response.use(
  (r) => r,
  async (error) => {
    const { config, response } = error;
    if (response?.status === 401 && response.data?.error?.code === 'TOKEN_EXPIRED' && !config._retried) {
      config._retried = true;
      try {
        await refreshPlatformToken();
        return platformHttp(config);
      } catch {
        store.dispatch(platformSessionEnded());
      }
    } else if (response?.status === 401 && config?.headers?.Authorization) {
      store.dispatch(platformSessionEnded());
    }
    return Promise.reject(error);
  },
);

const baseQuery = async ({ url, method = 'get', data, params }) => {
  try {
    const res = await platformHttp({ url, method, data, params });
    return { data: res.data };
  } catch (err) {
    return { error: toQueryError(err) };
  }
};

const data = (r) => r.data;
const list = (r) => ({ items: r.data, meta: r.meta });

export const platformApi = createApi({
  reducerPath: 'platformApi',
  baseQuery,
  tagTypes: ['Org', 'Dashboard', 'Admin', 'Billing'],
  endpoints: (build) => ({
    platformLogout: build.mutation({ query: () => ({ url: '/auth/logout', method: 'post' }) }),
    platformMe: build.query({ query: () => ({ url: '/auth/me' }), transformResponse: data, providesTags: ['Admin'] }),
    platformDashboard: build.query({ query: () => ({ url: '/dashboard' }), transformResponse: data, providesTags: ['Dashboard'] }),
    organisations: build.query({ query: (params) => ({ url: '/organisations', params }), transformResponse: list, providesTags: ['Org'] }),
    organisation: build.query({ query: (id) => ({ url: `/organisations/${id}` }), transformResponse: data, providesTags: (r, e, id) => [{ type: 'Org', id }] }),
    organisationHistory: build.query({ query: (id) => ({ url: `/organisations/${id}/history` }), transformResponse: data, providesTags: ['Org', 'Billing'] }),
    createOrganisation: build.mutation({ query: (body) => ({ url: '/organisations', method: 'post', data: body }), transformResponse: data, invalidatesTags: ['Org', 'Dashboard'] }),
    updateOrganisation: build.mutation({
      query: ({ id, ...body }) => ({ url: `/organisations/${id}`, method: 'patch', data: body }),
      transformResponse: data,
      invalidatesTags: ['Org', 'Dashboard'],
    }),
    deleteOrganisation: build.mutation({ query: (id) => ({ url: `/organisations/${id}`, method: 'delete' }), transformResponse: data, invalidatesTags: ['Org', 'Dashboard', 'Billing'] }),
    setBranchLimit: build.mutation({
      query: ({ id, branchLimit }) => ({ url: `/organisations/${id}/branch-limit`, method: 'patch', data: { branchLimit } }),
      transformResponse: data,
      invalidatesTags: ['Org', 'Dashboard'],
    }),
    // Subscriptions & billing
    billingDashboard: build.query({ query: () => ({ url: '/billing/dashboard' }), transformResponse: data, providesTags: ['Billing'] }),
    plans: build.query({ query: () => ({ url: '/plans' }), transformResponse: data, providesTags: ['Billing'] }),
    createPlan: build.mutation({ query: (body) => ({ url: '/plans', method: 'post', data: body }), transformResponse: data, invalidatesTags: ['Billing'] }),
    updatePlan: build.mutation({ query: ({ id, ...body }) => ({ url: `/plans/${id}`, method: 'put', data: body }), transformResponse: data, invalidatesTags: ['Billing'] }),
    deletePlan: build.mutation({ query: (id) => ({ url: `/plans/${id}`, method: 'delete' }), transformResponse: data, invalidatesTags: ['Billing'] }),
    payments: build.query({ query: (params) => ({ url: '/payments', params }), transformResponse: list, providesTags: ['Billing'] }),
    organisationBilling: build.query({ query: (id) => ({ url: `/organisations/${id}/billing` }), transformResponse: data, providesTags: ['Billing'] }),
    assignPlan: build.mutation({ query: ({ id, ...body }) => ({ url: `/organisations/${id}/subscription`, method: 'post', data: body }), transformResponse: data, invalidatesTags: ['Billing', 'Org', 'Dashboard'] }),
    setOrganisationStatus: build.mutation({
      query: ({ id, status }) => ({ url: `/organisations/${id}/status`, method: 'patch', data: { status } }),
      transformResponse: data,
      invalidatesTags: ['Org', 'Dashboard'],
    }),
  }),
});

export const {
  usePlatformLogoutMutation,
  usePlatformMeQuery,
  usePlatformDashboardQuery,
  useOrganisationsQuery,
  useOrganisationQuery,
  useOrganisationHistoryQuery,
  useCreateOrganisationMutation,
  useUpdateOrganisationMutation,
  useDeleteOrganisationMutation,
  useSetBranchLimitMutation,
  useSetOrganisationStatusMutation,
  useBillingDashboardQuery,
  usePlansQuery,
  useCreatePlanMutation,
  useUpdatePlanMutation,
  useDeletePlanMutation,
  usePaymentsQuery,
  useOrganisationBillingQuery,
  useAssignPlanMutation,
} = platformApi;
