import { Chip } from '@mui/material';
import { formatWeight } from '@jerp/shared';
import { t } from '../../i18n/index.js';

const DOC_STATUS = {
  posted: { label: t('Posted'), color: 'success' },
  pending_approval: { label: t('Awaiting approval'), color: 'warning' },
  rejected: { label: t('Rejected'), color: 'error' },
  in_transit: { label: t('In transit'), color: 'info' },
  received: { label: t('Received'), color: 'success' },
  pending: { label: t('Pending'), color: 'warning' },
  approved: { label: t('Approved'), color: 'success' },
};

export function DocStatusChip({ status }) {
  const s = DOC_STATUS[status] ?? { label: status, color: 'default' };
  return <Chip size="small" label={s.label} color={s.color} variant={status === 'posted' || status === 'received' ? 'filled' : 'outlined'} sx={{ height: 22 }} />;
}

export const docTotals = (d) =>
  [d.totals.pieces ? (d.totals.pieces === 1 ? t('{{pieces}} pc', { pieces: d.totals.pieces }) : t('{{pieces}} pcs', { pieces: d.totals.pieces })) : null, d.totals.grossMg ? formatWeight(d.totals.grossMg) : null, d.metalLines?.length ? (d.metalLines.length === 1 ? t('{{count}} metal line', { count: d.metalLines.length }) : t('{{count}} metal lines', { count: d.metalLines.length })) : null]
    .filter(Boolean)
    .join(' · ') || '—';
