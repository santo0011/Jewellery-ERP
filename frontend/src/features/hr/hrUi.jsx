import { Chip } from '@mui/material';
import { ATTENDANCE_STATUSES } from '@jerp/shared';

export const attendanceLabel = (v) => ATTENDANCE_STATUSES.find((s) => s.value === v)?.label ?? v;

/** Colour per attendance mark: green paid days, red absent, amber half day, blue leave, grey holiday. */
export const ATTENDANCE_COLORS = { present: 'success', absent: 'error', half_day: 'warning', paid_leave: 'info', holiday: 'default' };

export const PAY_MODES = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank transfer' },
  { value: 'upi', label: 'UPI' },
];
export const payModeLabel = (v) => PAY_MODES.find((m) => m.value === v)?.label ?? v ?? '—';

const RUN_STATUS = { draft: ['Draft', 'warning', 'outlined'], finalised: ['Finalised · unpaid', 'info', 'outlined'], paid: ['Paid', 'success', 'filled'] };

export function PayrollStatusChip({ status }) {
  const [label, color, variant] = RUN_STATUS[status] ?? [status, 'default', 'outlined'];
  return <Chip size="small" label={label} color={color} variant={variant} sx={{ height: 22 }} />;
}

export function EmploymentChip({ status }) {
  return <Chip size="small" label={status === 'left' ? 'Left' : 'Active'} color={status === 'left' ? 'default' : 'success'} variant={status === 'left' ? 'outlined' : 'filled'} sx={{ height: 22 }} />;
}

export const monthLabel = (month) => (month ? new Date(`${month}-01T00:00:00Z`).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : '');

/** "2026-10" for this month (local time). */
export const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** 28.5 -> "28½" */
export const formatDays = (n) => (Number.isInteger(n) ? String(n) : `${Math.floor(n)}½`);

/** Rename server error paths (e.g. amountPaise) to the form's field names (amount) before applyServerErrors. */
export function remapErrors(err, map) {
  const details = err?.data?.error?.details;
  if (!Array.isArray(details)) return err;
  return { ...err, data: { ...err.data, error: { ...err.data.error, details: details.map((d) => ({ ...d, path: map[d.path] ?? d.path })) } } };
}
