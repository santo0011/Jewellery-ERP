import { Chip } from '@mui/material';

const STATUS_COLORS = {
  active: 'success',
  trial: 'warning',
  inactive: 'default',
  disabled: 'default',
  suspended: 'error',
  expired: 'error',
  past_due: 'warning',
  cancelled: 'default',
};

const LABELS = { past_due: 'Past due' };

export default function StatusChip({ status, label, size = 'small' }) {
  const color = STATUS_COLORS[status] ?? 'default';
  const text = label ?? LABELS[status] ?? (status ? status.charAt(0).toUpperCase() + status.slice(1) : '—');
  return <Chip size={size} label={text} color={color} variant={color === 'default' ? 'outlined' : 'filled'} sx={{ height: 22, fontSize: '0.75rem' }} />;
}
