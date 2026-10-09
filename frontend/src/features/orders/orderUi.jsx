import { Chip } from '@mui/material';
import { ORDER_STATUS_LABELS, PAYMENT_MODES } from '@jerp/shared';

const STATUS_STYLE = {
  booked: { color: 'info', variant: 'outlined' },
  in_progress: { color: 'warning', variant: 'outlined' },
  ready: { color: 'success', variant: 'filled' },
  delivered: { color: 'default', variant: 'filled' },
  cancelled: { color: 'error', variant: 'outlined' },
};

export function OrderStatusChip({ status, size = 'small' }) {
  const style = STATUS_STYLE[status] ?? { color: 'default', variant: 'outlined' };
  return <Chip size={size} label={ORDER_STATUS_LABELS[status] ?? status} {...style} sx={{ height: 22, fontSize: '0.75rem', fontWeight: 600 }} />;
}

export const paymentLabel = (mode) => PAYMENT_MODES.find((m) => m.value === mode)?.label ?? mode;

export const ADVANCE_MODE_OPTIONS = PAYMENT_MODES.filter((m) => m.value !== 'credit');

/** Next step in the workshop flow, shown as the main action on an open order. */
export const NEXT_STEP = {
  booked: { status: 'in_progress', label: 'Start work' },
  in_progress: { status: 'ready', label: 'Mark ready' },
};
