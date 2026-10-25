import { t } from '../i18n/index.js';

// Messages from the server (and network errors) are in English; they are shown in the app's language.
export const getErrorMessage = (error, fallback = 'Something went wrong. Please try again.') =>
  t(error?.data?.error?.message ?? error?.message ?? fallback);

export const getErrorCode = (error) => error?.data?.error?.code;

export function applyServerErrors(error, setError) {
  const details = error?.data?.error?.details;
  if (!Array.isArray(details)) return false;
  let applied = false;
  for (const { path, message } of details) {
    if (path) {
      setError(path, { type: 'server', message: t(message) });
      applied = true;
    }
  }
  return applied;
}
