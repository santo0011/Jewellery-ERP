import { baseApi, unwrapData } from '../../services/baseApi.js';

export const dashboardApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    branchDashboard: build.query({
      query: (params) => ({ url: '/dashboard', params }),
      transformResponse: unwrapData,
      providesTags: ['Sale', 'Order', 'Stock', 'Product'],
    }),
  }),
});

export const { useBranchDashboardQuery } = dashboardApi;
