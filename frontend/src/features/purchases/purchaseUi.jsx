import { Chip } from '@mui/material';
import { t } from '../../i18n/index.js';

export const PAY_MODES = [
  { value: 'cash', label: t('Cash') },
  { value: 'bank', label: t('Bank') },
  { value: 'upi', label: t('UPI') },
];
export const payModeLabel = (v) => PAY_MODES.find((m) => m.value === v)?.label ?? v;

const PAYMENT = { paid: [t('Paid'), 'success'], partly_paid: [t('Partly paid'), 'warning'], due: [t('Due'), 'error'] };

/** Green paid, amber part paid, red nothing paid — the same colours as the customer list. A cancelled bill owes nothing. */
export function PaymentChip({ status, cancelled = false }) {
  if (cancelled) return <Chip size="small" label={t('Cancelled')} variant="outlined" sx={{ height: 22, fontWeight: 600 }} />;
  const [label, color] = PAYMENT[status] ?? [status, 'default'];
  return <Chip size="small" label={label} color={color} sx={{ height: 22, fontWeight: 600 }} />;
}

const ORDER = { open: [t('Open'), 'info', 'outlined'], received: [t('Received'), 'success', 'filled'], cancelled: [t('Cancelled'), 'default', 'outlined'] };

export function OrderStatusChip({ status, overdue }) {
  if (status === 'open' && overdue) return <Chip size="small" label={t('Overdue')} color="error" sx={{ height: 22, fontWeight: 600 }} />;
  const [label, color, variant] = ORDER[status] ?? [status, 'default', 'outlined'];
  return <Chip size="small" label={label} color={color} variant={variant} sx={{ height: 22, fontWeight: 600 }} />;
}
