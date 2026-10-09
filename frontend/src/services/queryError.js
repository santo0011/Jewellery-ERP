const GATEWAY_STATUSES = new Set([502, 503, 504]);

/**
 * Turns an axios failure into the RTK Query error shape `{ status, data: { error: { code, message } } }`.
 * API errors pass through untouched; anything else (proxy 502 with an empty body, HTML error pages,
 * timeouts, no network) gets a message the user can act on instead of a generic fallback.
 */
export function toQueryError(err) {
  const { response } = err;
  if (response?.data?.error?.message) return { status: response.status, data: response.data };

  if (!response) {
    const timedOut = err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT';
    return networkError('FETCH_ERROR', timedOut ? 'TIMEOUT' : 'NETWORK_ERROR', timedOut ? 'The server took too long to respond. Please try again.' : 'Unable to reach the server. Check your connection.');
  }
  if (GATEWAY_STATUSES.has(response.status)) {
    return networkError(response.status, 'SERVER_UNAVAILABLE', 'The server is not responding right now. Please try again in a moment.');
  }
  return networkError(response.status, 'UNEXPECTED_RESPONSE', `The server returned an unexpected error (${response.status}). Please try again.`);
}

const networkError = (status, code, message) => ({ status, data: { error: { code, message } } });
