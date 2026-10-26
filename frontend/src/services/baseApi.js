import { createApi } from '@reduxjs/toolkit/query/react';
import { http } from './http.js';
import { toQueryError } from './queryError.js';

// The API restarting (a deploy, or the dev server reloading after a change) answers 502/503/504 from the proxy for a
// few seconds. Such a request never reached the API, so it is safe to send again: wait and retry before giving up.
const RETRY_DELAYS = [600, 1200, 2000, 3000];
const GATEWAY = new Set([502, 503, 504]);
const proxyDown = (err) => GATEWAY.has(err?.response?.status) && !err.response.data?.error;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const axiosBaseQuery =
  () =>
  async ({ url, method = 'get', data, params, headers }) => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        const res = await http({ url, method, data, params, headers });
        return { data: res.data };
      } catch (err) {
        if (proxyDown(err) && attempt < RETRY_DELAYS.length) {
          await wait(RETRY_DELAYS[attempt]);
          continue;
        }
        return { error: toQueryError(err) };
      }
    }
  };

export const TAGS = ['Me', 'Organisation', 'Subscription', 'Branch', 'Role', 'Session', 'User', 'Settings', 'Audit', 'Logo', 'Customer', 'Supplier', 'Category', 'Product', 'Rate', 'Stock', 'Approval', 'Order', 'Sale', 'Employee', 'Attendance', 'Payroll', 'Purchase', 'Item', 'Billing', 'Expense', 'Finance', 'OldGold', 'Undo'];

export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery: axiosBaseQuery(),
  tagTypes: TAGS,
  endpoints: () => ({}),
});

export const unwrapData = (response) => response.data;
export const unwrapList = (response) => ({ items: response.data, meta: response.meta });
