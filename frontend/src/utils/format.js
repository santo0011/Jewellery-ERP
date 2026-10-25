import { getLocale, t } from '../i18n/index.js';
const dateFormatter = new Intl.DateTimeFormat(getLocale(), { day: '2-digit', month: 'short', year: 'numeric' });
const dateTimeFormatter = new Intl.DateTimeFormat(getLocale(), { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

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
  if (!userAgent) return t('Unknown device');
  const browser = /Edg\//.test(userAgent) ? t('Edge') : /Chrome\//.test(userAgent) ? t('Chrome') : /Firefox\//.test(userAgent) ? t('Firefox') : /Safari\//.test(userAgent) ? t('Safari') : t('Browser');
  const os = /Windows/.test(userAgent) ? t('Windows') : /Android/.test(userAgent) ? t('Android') : /iPhone|iPad/.test(userAgent) ? t('iOS') : /Mac OS/.test(userAgent) ? t('macOS') : /Linux/.test(userAgent) ? t('Linux') : '';
  return os ? t('{{browser}} on {{os}}', { browser, os }) : browser;
}
