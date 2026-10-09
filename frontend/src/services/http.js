import axios from 'axios';
import { branchSelected, sessionEnded, signedIn } from '../store/authSlice.js';

const BASE_URL = '/api/v1';

export const http = axios.create({ baseURL: BASE_URL, withCredentials: true, timeout: 30000 });

let store;
let refreshing = null;

export function injectStore(appStore) {
  store = appStore;
}

const SIGNED_OUT_KEY = 'jerp.signedOutReason';

/** Remembers why the server ended the session (organisation deactivated) so the login page can say so. */
function rememberSignOut(error) {
  const { code, message } = error?.response?.data?.error ?? {};
  if (code !== 'ORG_SUSPENDED') return false;
  try {
    sessionStorage.setItem(SIGNED_OUT_KEY, message);
  } catch {
    /* storage unavailable */
  }
  return true;
}

export function readSignOutReason() {
  try {
    return sessionStorage.getItem(SIGNED_OUT_KEY);
  } catch {
    return null;
  }
}

export function clearSignOutReason() {
  try {
    sessionStorage.removeItem(SIGNED_OUT_KEY);
  } catch {
    /* storage unavailable */
  }
}

const withCrossTabLock = (fn) => (navigator.locks?.request ? navigator.locks.request('jerp-token-refresh', fn) : fn());

export function refreshAccessToken() {
  if (!refreshing) {
    refreshing = withCrossTabLock(() => axios.post(`${BASE_URL}/auth/refresh`, null, { withCredentials: true }))
      .then((res) => {
        const token = res.data.data.accessToken;
        store.dispatch(signedIn(token));
        return token;
      })
      .catch((err) => {
        rememberSignOut(err);
        throw err;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

http.interceptors.request.use((config) => {
  const { accessToken, activeBranchId } = store.getState().auth;
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  if (accessToken && activeBranchId) config.headers['X-Branch-Id'] = activeBranchId;
  return config;
});

http.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response } = error;
    const code = response?.data?.error?.code;
    const hadToken = Boolean(config?.headers?.Authorization);

    // The remembered branch is not one this user can open (another person used this browser, or access changed):
    // forget it and retry once, so the server falls back to the user's own default branch.
    if (response?.status === 403 && code === 'BRANCH_FORBIDDEN' && config?.headers?.['X-Branch-Id'] && !config._branchRetried) {
      config._branchRetried = true;
      store.dispatch(branchSelected(null));
      delete config.headers['X-Branch-Id'];
      return http(config);
    }

    if (response?.status === 403 && hadToken && rememberSignOut(error)) {
      store.dispatch(sessionEnded());
      return Promise.reject(error);
    }

    if (response?.status === 401 && code === 'TOKEN_EXPIRED' && !config._retried) {
      config._retried = true;
      try {
        await refreshAccessToken();
        return http(config);
      } catch {
        store.dispatch(sessionEnded());
      }
    } else if (response?.status === 401 && hadToken) {
      store.dispatch(sessionEnded());
    }

    return Promise.reject(error);
  },
);
