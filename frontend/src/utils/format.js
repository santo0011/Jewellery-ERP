const dateFormatter = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const dateTimeFormatter = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const formatDate = (value) => (value ? dateFormatter.format(new Date(value)) : '—');
export const formatDateTime = (value) => (value ? dateTimeFormatter.format(new Date(value)) : '—');

export function daysUntil(value) {
  if (!value) return null;
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86400000);
}

export const nullsToEmpty = (obj) =>
  Object.fromEntries(
    Object.entries(obj ?? {}).map(([k, v]) => [k, v === null || v === undefined ? '' : v && typeof v === 'object' && !Array.isArray(v) ? nullsToEmpty(v) : v]),
  );

export function describeDevice(userAgent) {
  if (!userAgent) return 'Unknown device';
  const browser = /Edg\//.test(userAgent) ? 'Edge' : /Chrome\//.test(userAgent) ? 'Chrome' : /Firefox\//.test(userAgent) ? 'Firefox' : /Safari\//.test(userAgent) ? 'Safari' : 'Browser';
  const os = /Windows/.test(userAgent) ? 'Windows' : /Android/.test(userAgent) ? 'Android' : /iPhone|iPad/.test(userAgent) ? 'iOS' : /Mac OS/.test(userAgent) ? 'macOS' : /Linux/.test(userAgent) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}
