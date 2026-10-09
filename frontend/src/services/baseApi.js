import { createApi } from '@reduxjs/toolkit/query/react';
import { http } from './http.js';
import { toQueryError } from './queryError.js';

const axiosBaseQuery =
  () =>
  async ({ url, method = 'get', data, params, headers }) => {
    try {
      const res = await http({ url, method, data, params, headers });
      return { data: res.data };
    } catch (err) {
      return { error: toQueryError(err) };
    }
  };

export const TAGS = ['Me', 'Organisation', 'Subscription', 'Branch', 'Role', 'Session', 'User', 'Settings', 'Audit', 'Logo', 'Customer', 'Supplier', 'Category', 'Product', 'Rate', 'Stock', 'Approval', 'Order', 'Sale', 'Employee', 'Attendance', 'Payroll'];

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: axiosBaseQuery(),
  tagTypes: TAGS,
  endpoints: () => ({}),
});

export const unwrapData = (response) => response.data;
export const unwrapList = (response) => ({ items: response.data, meta: response.meta });
