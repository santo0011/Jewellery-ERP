import { Chip } from '@mui/material';

export const PAY_MODES = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank' },
  { value: 'upi', label: 'UPI' },
];
export const payModeLabel = (v) => PAY_MODES.find((m) => m.value === v)?.label ?? v;

const PAYMENT = { paid: ['Paid', 'success'], partly_paid: ['Partly paid', 'warning'], due: ['Due', 'error'] };

/** Green paid, amber part paid, red nothing paid — the same colours as the customer list. */
export function PaymentChip({ status }) {
  const [label, color] = PAYMENT[status] ?? [status, 'default'];
  return <Chip size="small" label={label} color={color} sx={{ height: 22, fontWeight: 600 }} />;
}

const ORDER = { open: ['Open', 'info', 'outlined'], received: ['Received', 'success', 'filled'], cancelled: ['Cancelled', 'default', 'outlined'] };

export function OrderStatusChip({ status, overdue }) {
  if (status === 'open' && overdue) return <Chip size="small" label="Overdue" color="error" sx={{ height: 22, fontWeight: 600 }} />;
  const [label, color, variant] = ORDER[status] ?? [status, 'default', 'outlined'];
  return <Chip size="small" label={label} color={color} variant={variant} sx={{ height: 22, fontWeight: 600 }} />;
}
