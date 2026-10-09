export const getErrorMessage = (error, fallback = 'Something went wrong. Please try again.') =>
  error?.data?.error?.message ?? error?.message ?? fallback;

export const getErrorCode = (error) => error?.data?.error?.code;

export function applyServerErrors(error, setError) {
  const details = error?.data?.error?.details;
  if (!Array.isArray(details)) return false;
  let applied = false;
  for (const { path, message } of details) {
    if (path) {
      setError(path, { type: 'server', message });
      applied = true;
    }
  }
  return applied;
}
