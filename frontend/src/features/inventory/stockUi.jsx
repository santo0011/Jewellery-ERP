import { Chip } from '@mui/material';
import { formatWeight } from '@jerp/shared';

const DOC_STATUS = {
  posted: { label: 'Posted', color: 'success' },
  pending_approval: { label: 'Awaiting approval', color: 'warning' },
  rejected: { label: 'Rejected', color: 'error' },
  in_transit: { label: 'In transit', color: 'info' },
  received: { label: 'Received', color: 'success' },
  pending: { label: 'Pending', color: 'warning' },
  approved: { label: 'Approved', color: 'success' },
};

export function DocStatusChip({ status }) {
  const s = DOC_STATUS[status] ?? { label: status, color: 'default' };
  return <Chip size="small" label={s.label} color={s.color} variant={status === 'posted' || status === 'received' ? 'filled' : 'outlined'} sx={{ height: 22 }} />;
}

export const docTotals = (d) =>
  [d.totals.pieces ? `${d.totals.pieces} pc${d.totals.pieces === 1 ? '' : 's'}` : null, d.totals.grossMg ? formatWeight(d.totals.grossMg) : null, d.metalLines?.length ? `${d.metalLines.length} metal line${d.metalLines.length === 1 ? '' : 's'}` : null]
    .filter(Boolean)
    .join(' · ') || '—';
