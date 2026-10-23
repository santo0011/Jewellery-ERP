import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import RemoveCircleOutlineRoundedIcon from '@mui/icons-material/RemoveCircleOutlineRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import TaskAltRoundedIcon from '@mui/icons-material/TaskAltRounded';
import {
  Alert, Box, Button, Card, CardContent, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, Divider, FormControlLabel, Grid, InputAdornment, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import { formatINR, fromPaise, toPaise } from '@jerp/shared';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router';
import Amount from '../../components/Amount.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import DataTable from '../../components/DataTable.jsx';
import FormDrawer from '../../components/FormDrawer.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import SearchField from '../../components/SearchField.jsx';
import SummaryCards, { SummaryCard } from '../../components/SummaryCards.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import ViewButton from '../../components/ViewButton.jsx';
import { usePermission } from '../../hooks/usePermission.js';
import { formatDate, formatDateTime } from '../../utils/format.js';
import { getErrorMessage } from '../../utils/errors.js';
import { useDeletePayrollMutation, useFinalisePayrollMutation, usePayPayrollMutation, usePayrollRunQuery, useRecalculatePayrollMutation, useUpdatePayrollLineMutation } from './hrApi.js';
import { formatDays, PAY_MODES, payModeLabel, PayrollStatusChip } from './hrUi.jsx';
import { EmployeeAvatar } from './EmployeePhoto.jsx';
import PayrollSteps, { stepOf } from './PayrollSteps.jsx';
import KeepOnPhone from '../../components/KeepOnPhone.jsx';
import { t } from '../../i18n/index.js';

const money = { slotProps: { input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> }, htmlInput: { inputMode: 'decimal' } } };
const asPaise = (v) => {
  try {
    return v === '' ? 0 : toPaise(v);
  } catch {
    return null;
  }
};
const toText = (p) => (p ? String(fromPaise(p)) : '');

export function daysSummary(l) {
  const parts = [];
  if (l.days.absent) parts.push(t('{{absent}} absent', { absent: l.days.absent }));
  if (l.days.halfDay) parts.push(t('{{halfDay}} half day', { halfDay: l.days.halfDay }));
  if (l.days.paidLeave) parts.push(t('{{paidLeave}} leave', { paidLeave: l.days.paidLeave }));
  if (l.days.holiday) parts.push(t('{{holiday}} holiday', { holiday: l.days.holiday }));
  return parts.join(' · ') || t('Full attendance');
}

function LineDrawer({ runId, line, onClose }) {
  const [update, state] = useUpdatePayrollLineMutation();
  const [form, setForm] = useState({ bonus: '', other: '', advance: '', note: '' });
  useEffect(() => {
    if (line) setForm({ bonus: toText(line.bonusPaise), other: toText(line.otherDeductionPaise), advance: toText(line.advanceDeductionPaise), note: line.note ?? '' });
  }, [line]);
  if (!line) return <FormDrawer open={false} title="" onClose={onClose} />;

  const bonus = asPaise(form.bonus);
  const other = asPaise(form.other);
  const advance = asPaise(form.advance);
  const net = bonus !== null && other !== null && advance !== null ? line.earnedPaise + bonus - other - advance : null;
  const advanceTooHigh = advance !== null && advance > line.advanceBalancePaise;
  const invalid = net === null || net < 0 || advanceTooHigh;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value.replace(/[^\d.]/g, '') }));

  const onSubmit = async (e) => {
    e?.preventDefault?.();
    if (invalid) return;
    try {
      await update({ id: runId, employeeId: line.employeeId, bonusPaise: bonus, otherDeductionPaise: other, advanceDeductionPaise: advance, note: form.note || null }).unwrap();
      toast.success(t('{{name}}’s salary updated', { name: line.name }));
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <FormDrawer open title={line.name} subtitle={`${line.code} · ${line.designation}`} onClose={onClose} onSubmit={onSubmit} submitting={state.isLoading} submitLabel={t('Save')}>
      <Stack spacing={2}>
        <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'action.hover' }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
            <Typography variant="body2">{t('Gross monthly salary')}</Typography>
            <Typography variant="body2">{formatINR(line.grossPaise, { decimals: 0 })}</Typography>
          </Stack>
          <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
            <Typography variant="body2">
              {t('Paid days ({{daysSummary}})', { daysSummary: daysSummary(line) })}
            </Typography>
            <Typography variant="body2">
              {formatDays(line.payableDays)} / {line.daysInMonth}
            </Typography>
          </Stack>
          <Divider sx={{ my: 1 }} />
          <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {t('Earned for the month')}
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {formatINR(line.earnedPaise)}
            </Typography>
          </Stack>
        </Box>
        <TextField label={t('Bonus / incentive')} value={form.bonus} onChange={set('bonus')} {...money} autoFocus />
        <TextField label={t('Other deduction')} value={form.other} onChange={set('other')} helperText={t('Fine, damage, canteen, etc.')} {...money} />
        {line.advances?.length > 0 && (
          <Box sx={{ p: 1.5, borderRadius: 2, border: '1px solid rgba(var(--brand-rgb), 0.35)', bgcolor: 'rgba(var(--brand-rgb), 0.05)' }}>
            <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
              {t('Advances due this month')}
            </Typography>
            <Stack spacing={0.75}>
              {line.advances.map((a) => (
                <Stack key={a.advanceNo} direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {t('{{amount}} given {{givenOn}}', { amount: formatINR(a.amountPaise, { decimals: 0 }), givenOn: formatDate(a.givenOn) })}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      {a.advanceNo}
                      {a.recoveredPaise > 0 ? t(' · {{recovered}} already recovered', { recovered: formatINR(a.recoveredPaise, { decimals: 0 }) }) : ''}
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'error.main' }}>
                      {formatINR(a.balancePaise, { decimals: 0 })}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      {t('due · {{due}} this month', { due: formatINR(a.duePaise, { decimals: 0 }) })}
                    </Typography>
                  </Box>
                </Stack>
              ))}
            </Stack>
            {line.advanceUpcomingPaise > 0 && (
              <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 1 }}>
                {t('{{advanceUpcoming}} more is set for a later month.', { advanceUpcoming: formatINR(line.advanceUpcomingPaise, { decimals: 0 }) })}
              </Typography>
            )}
          </Box>
        )}
        <TextField
          label={t('Advance to cut this month')}
          value={form.advance}
          onChange={set('advance')}
          disabled={!line.advanceBalancePaise}
          error={advanceTooHigh}
          helperText={<KeepOnPhone>{advanceTooHigh ? t('Only {{advanceBalance}} is due', { advanceBalance: formatINR(line.advanceBalancePaise, { decimals: 0 }) }) : line.advanceBalancePaise ? t('Up to {{advanceBalance}} — lower it to carry the rest to next month', { advanceBalance: formatINR(line.advanceBalancePaise, { decimals: 0 }) }) : line.advanceUpcomingPaise ? t('Advance is set for a later month') : t('No advance due')}</KeepOnPhone>}
          {...money}
        />
        <TextField label={t('Note on payslip (optional)')} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} slotProps={{ htmlInput: { maxLength: 200 } }} />
        <Alert severity={net !== null && net < 0 ? 'error' : 'success'} icon={false}>
          {net === null ? t('Enter valid amounts') : net < 0 ? t('Deductions are more than the salary') : <>{t('Net pay')} <strong>{formatINR(net)}</strong></>}
        </Alert>
      </Stack>
    </FormDrawer>
  );
}

/** `only` opens the dialog for one employee (the row's Pay button); otherwise everyone unpaid is ticked. */
function PayDialog({ run, only, onClose }) {
  const unpaid = run.lines.filter((l) => !l.paid);
  const [selected, setSelected] = useState(() => new Set(only ? [String(only)] : unpaid.map((l) => String(l.employeeId))));
  const [mode, setMode] = useState('bank');
  const [reference, setReference] = useState('');
  const [pay, state] = usePayPayrollMutation();
  const total = unpaid.filter((l) => selected.has(String(l.employeeId))).reduce((s, l) => s + l.netPaise, 0);
  const toggle = (id) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  });

  const onPay = async () => {
    try {
      await pay({ id: run.id, employeeIds: [...selected], mode, reference: reference || null }).unwrap();
      toast.success((selected.size > 1 ? t('Salary of {{total}} paid to {{size}} employees', { total: formatINR(total, { decimals: 0 }), size: selected.size }) : t('Salary of {{total}} paid to {{size}} employee', { total: formatINR(total, { decimals: 0 }), size: selected.size })));
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <Dialog open onClose={state.isLoading ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>{t('Pay salaries · {{monthLabel}}', { monthLabel: run.monthLabel })}</DialogTitle>
      <DialogContent>
        <Stack divider={<Divider flexItem />} sx={{ mb: 2, border: 1, borderColor: 'divider', borderRadius: 2, px: 1.5, maxHeight: 320, overflowY: 'auto' }}>
          {unpaid.map((l) => (
            <Stack key={String(l.employeeId)} direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
              <FormControlLabel
                control={<Checkbox checked={selected.has(String(l.employeeId))} onChange={() => toggle(String(l.employeeId))} />}
                label={
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <EmployeeAvatar employee={l} size={28} />
                    <span>
                      {l.name} · {l.code}
                    </span>
                  </Stack>
                }
              />
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {formatINR(l.netPaise)}
              </Typography>
            </Stack>
          ))}
        </Stack>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField select label={t('Paid by')} value={mode} onChange={(e) => setMode(e.target.value)}>
              {PAY_MODES.map((m) => (
                <MenuItem key={m.value} value={m.value}>
                  {m.label}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField label={t('Reference (optional)')} value={reference} onChange={(e) => setReference(e.target.value)} helperText={t('Cheque / NEFT / UPI ref.')} slotProps={{ htmlInput: { maxLength: 60 } }} />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={state.isLoading}>
          {t('Cancel')}
        </Button>
        <Button variant="contained" onClick={onPay} disabled={!selected.size || state.isLoading}>
          {t('Pay {{total}}', { total: formatINR(total, { decimals: 0 }) })}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function PayrollRunPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: run, isLoading, error, refetch } = usePayrollRunQuery(id);
  const canProcess = usePermission('payroll.process');
  const canApprove = usePermission('payroll.approve');
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [paying, setPaying] = useState(null); // null | 'all' | employeeId
  const [show, setShow] = useState('all');
  const [q, setQ] = useState('');
  const [recalc, recalcState] = useRecalculatePayrollMutation();
  const [finalise, finaliseState] = useFinalisePayrollMutation();
  const [remove, removeState] = useDeletePayrollMutation();

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const draft = run.status === 'draft';
  const totals = run.totals;
  const act = async (fn, msg, after) => {
    try {
      await fn().unwrap();
      toast.success(msg);
      setConfirm(null);
      after?.();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  // One clear next action for the stage this payroll is at.
  const next = {
    draft: {
      title: t('Step 2 · Review salaries'),
      text: t('Check paid days and use Adjust to add a bonus or deduction. Attendance changed? Recalculate keeps your adjustments.'),
      action: canApprove ? (
        <Button variant="contained" startIcon={<TaskAltRoundedIcon />} onClick={() => setConfirm('finalise')} sx={{ flexShrink: 0 }}>
          {t('Finalise payroll')}
        </Button>
      ) : (
        <Typography variant="body2" color="textSecondary">
          {t('A manager finalises the payroll.')}
        </Typography>
      ),
    },
    finalised: {
      title: t('Step 4 · Pay salaries'),
      text: t('{{formatINR}} still to pay to {{unpaidCount}} staff — pay everyone at once, or one by one with Pay on each row.', { formatINR: formatINR(totals.netPaise - totals.paidPaise, { decimals: 0 }), unpaidCount: totals.unpaidCount }),
      action: canApprove && (
        <Button variant="contained" startIcon={<PaymentsOutlinedIcon />} onClick={() => setPaying('all')} sx={{ flexShrink: 0 }}>
          {t('Pay {{formatINR}}', { formatINR: formatINR(totals.netPaise - totals.paidPaise, { decimals: 0 }) })}
        </Button>
      ),
    },
    paid: {
      title: t('All done'),
      text: t('Everyone is paid — {{paid}} in total. Payslips are ready to view and print.', { paid: formatINR(totals.paidPaise, { decimals: 0 }) }),
      action: <CheckCircleRoundedIcon sx={{ color: 'success.main', fontSize: 32 }} />,
    },
  }[run.status];

  const needle = q.trim().toLowerCase();
  const lines = run.lines.filter((l) => (show === 'unpaid' ? !l.paid : show === 'paid' ? Boolean(l.paid) : true) && (!needle || `${l.name} ${l.code} ${l.designation}`.toLowerCase().includes(needle)));

  const columns = [
    {
      key: 'employee',
      label: t('Employee'),
      render: (l) => (
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
          <EmployeeAvatar employee={l} size={36} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2">{l.name}</Typography>
            <Typography variant="caption" color="textSecondary">
              {l.code} · {l.designation}
            </Typography>
          </Box>
        </Stack>
      ),
    },
    {
      key: 'days',
      label: t('Paid days'),
      render: (l) => (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {formatDays(l.payableDays)} / {l.daysInMonth}
          </Typography>
          <Typography variant="caption" color={l.days.absent || l.days.halfDay ? 'error.main' : 'textSecondary'}>
            {daysSummary(l)}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'earned',
      label: t('Earned'),
      align: 'right',
      render: (l) => (
        <Box>
          <Typography variant="body2">{formatINR(l.earnedPaise, { decimals: 0 })}</Typography>
          <Typography variant="caption" color="textSecondary">
            {t('of {{gross}}', { gross: formatINR(l.grossPaise, { decimals: 0 }) })}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'advance',
      label: t('Advance cut'),
      align: 'right',
      render: (l) => {
        if (!l.advanceDeductionPaise && !l.advanceBalancePaise && !l.advanceUpcomingPaise) return <Typography variant="body2" color="textSecondary">—</Typography>;
        const left = l.advanceBalancePaise - l.advanceDeductionPaise;
        const given = (l.advances ?? []).map((a) => t('{{advanceNo}} · given {{givenOn}} · {{amount}}', { advanceNo: a.advanceNo, givenOn: formatDate(a.givenOn), amount: formatINR(a.amountPaise, { decimals: 0 }) })).join('\n');
        return (
          <Tooltip title={given ? <Box sx={{ whiteSpace: 'pre-line' }}>{given}</Box> : ''} placement="left">
            <Box>
              {l.advanceDeductionPaise > 0 ? <Amount paise={l.advanceDeductionPaise} tone="due" decimals={0} prefix="− " sx={{ display: 'block' }} /> : <Typography variant="body2" color="textSecondary">{t('Nothing cut')}</Typography>}
              <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>
                {left > 0 ? t('{{left}} still due', { left: formatINR(left, { decimals: 0 }) }) : l.advanceBalancePaise ? t('Fully recovered') : ''}
                {l.advanceUpcomingPaise > 0 ? (left > 0 || l.advanceBalancePaise ? t('· {{advanceUpcoming}} later', { advanceUpcoming: formatINR(l.advanceUpcomingPaise, { decimals: 0 }) }) : t('{{advanceUpcoming}} later', { advanceUpcoming: formatINR(l.advanceUpcomingPaise, { decimals: 0 }) })) : ''}
              </Typography>
            </Box>
          </Tooltip>
        );
      },
    },
    {
      key: 'adjust',
      label: t('Bonus / other'),
      align: 'right',
      render: (l) => {
        if (!l.bonusPaise && !l.otherDeductionPaise) return <Typography variant="body2" color="textSecondary">—</Typography>;
        return (
          <Box>
            {l.bonusPaise > 0 && <Amount paise={l.bonusPaise} tone="paid" decimals={0} prefix="+ " sx={{ display: 'block' }} />}
            {l.otherDeductionPaise > 0 && <Amount paise={l.otherDeductionPaise} tone="due" decimals={0} prefix="− " sx={{ display: 'block' }} />}
          </Box>
        );
      },
    },
    {
      key: 'net',
      label: t('Net pay'),
      align: 'right',
      render: (l) => (
        <Box>
          <Amount paise={l.netPaise} tone={draft ? undefined : l.paid ? 'paid' : 'due'} decimals={0} sx={{ fontSize: '0.95rem' }} />
          {!draft && (
            <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>
              {l.paid ? (l.paid.mode ? t('Paid · {{payModeLabel}}', { payModeLabel: payModeLabel(l.paid.mode) }) : t('Nothing payable')) : t('Unpaid')}
            </Typography>
          )}
        </Box>
      ),
    },
    {
      key: 'actions',
      label: t('Action'),
      align: 'right',
      width: 150,
      render: (l) => (
        <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end', alignItems: 'center' }}>
          {draft && canProcess && (
            <Button size="small" variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => setEditing(l)} aria-label={t('Adjust {{name}}', { name: l.name })}>
              {t('Adjust')}
            </Button>
          )}
          {run.status === 'finalised' && !l.paid && canApprove && (
            <Button size="small" variant="contained" startIcon={<PaymentsOutlinedIcon />} onClick={() => setPaying(String(l.employeeId))} aria-label={t('Pay {{name}}', { name: l.name })}>
              {t('Pay')}
            </Button>
          )}
          <ViewButton title={t('Payslip')} icon={ReceiptLongOutlinedIcon} onClick={() => navigate(`/hr/payroll/${run.id}/payslip/${l.employeeId}`)} name={l.name} />
        </Stack>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t('Payroll · {{monthLabel}}', { monthLabel: run.monthLabel })}
        subtitle={`${run.runNo} · ${run.branch?.name ?? ''}${run.finalisedAt ? (run.finalisedBy ? t(' · finalised {{finalisedAt}} by {{name}}', { finalisedAt: formatDateTime(run.finalisedAt), name: run.finalisedBy.name }) : t(' · finalised {{finalisedAt}}', { finalisedAt: formatDateTime(run.finalisedAt) })) : ''}`}
        back={{ to: '/hr/payroll', label: t('Payroll') }}
        actions={
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
            <PayrollStatusChip status={run.status} />
            {draft && canProcess && (
              <>
                <Button color="error" startIcon={<DeleteOutlineRoundedIcon />} onClick={() => setConfirm('delete')}>
                  {t('Delete draft')}
                </Button>
                <Button startIcon={<RefreshRoundedIcon />} disabled={recalcState.isLoading} onClick={() => act(() => recalc(run.id), t('Recalculated from latest attendance and advances'))}>
                  {t('Recalculate')}
                </Button>
              </>
            )}
          </Stack>
        }
      />

      {run.upTo && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('{{monthLabel}} is still running, so attendance and salary are counted only up to {{date}}. Days after that are not included.', { monthLabel: run.monthLabel, date: <strong>{formatDate(run.upTo)}</strong> })}
          {draft && t(' Press Recalculate on a later day to count up to that day, or wait for the month to end for the full salary.')}
        </Alert>
      )}

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <PayrollSteps current={stepOf(run.status)} />
          <Divider sx={{ my: 2 }} />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
            <Box>
              <Typography variant="subtitle2">{next.title}</Typography>
              <Typography variant="body2" color="textSecondary">
                {next.text}
              </Typography>
            </Box>
            {next.action}
          </Stack>
        </CardContent>
      </Card>

      <SummaryCards>
        <SummaryCard icon={BadgeOutlinedIcon} label={t('Employees')} value={totals.employees} caption={t('Gross {{gross}}', { gross: formatINR(totals.grossPaise, { decimals: 0 }) })} />
        <SummaryCard
          icon={TrendingUpRoundedIcon}
          label={t('Earned + bonus')}
          value={formatINR(totals.earnedPaise + totals.bonusPaise, { decimals: 0 })}
          caption={totals.bonusPaise ? t('incl. {{bonus}} bonus', { bonus: formatINR(totals.bonusPaise, { decimals: 0 }) }) : t('No bonus')}
          tone="blue"
        />
        <SummaryCard
          icon={RemoveCircleOutlineRoundedIcon}
          label={t('Deductions')}
          value={formatINR(totals.otherDeductionPaise + totals.advanceDeductionPaise, { decimals: 0 })}
          caption={totals.advanceDeductionPaise ? t('incl. {{advanceDeduction}} advance', { advanceDeduction: formatINR(totals.advanceDeductionPaise, { decimals: 0 }) }) : t('No advance recovery')}
          tone={totals.otherDeductionPaise + totals.advanceDeductionPaise ? 'red' : 'grey'}
          valueTone={totals.otherDeductionPaise + totals.advanceDeductionPaise ? 'due' : undefined}
        />
        <SummaryCard
          icon={AccountBalanceWalletOutlinedIcon}
          label={t('Net payable')}
          value={formatINR(totals.netPaise, { decimals: 0 })}
          caption={draft ? t('Not finalised') : totals.unpaidCount ? t('{{formatINR}} still to pay', { formatINR: formatINR(totals.netPaise - totals.paidPaise, { decimals: 0 }) }) : t('All paid')}
          tone={draft ? 'amber' : totals.unpaidCount ? 'red' : 'green'}
          valueTone={draft ? undefined : totals.unpaidCount ? 'due' : 'paid'}
        />
      </SummaryCards>

      <DataTable
        columns={columns}
        rows={lines}
        getRowId={(l) => String(l.employeeId)}
        empty={{ title: t('Nobody here'), description: q ? t('No employee matches your search.') : show === 'unpaid' ? t('Everyone has been paid.') : t('No one has been paid yet.') }}
        toolbar={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
            <SearchField value={q} onChange={setQ} placeholder={t('Search name or code')} />
            {!draft && (
              <ToggleButtonGroup exclusive size="small" value={show} onChange={(e, v) => v && setShow(v)} aria-label={t('Show')}>
                <ToggleButton value="all">{t('All · {{count}}', { count: run.lines.length })}</ToggleButton>
                <ToggleButton value="unpaid">{t('Unpaid · {{unpaidCount}}', { unpaidCount: totals.unpaidCount })}</ToggleButton>
                <ToggleButton value="paid">{t('Paid · {{value}}', { value: run.lines.length - totals.unpaidCount })}</ToggleButton>
              </ToggleButtonGroup>
            )}
          </Stack>
        }
      />

      <LineDrawer runId={run.id} line={editing} onClose={() => setEditing(null)} />
      {paying && <PayDialog run={run} only={paying === 'all' ? null : paying} onClose={() => setPaying(null)} />}
      <ConfirmDialog
        open={confirm === 'finalise'}
        title={t('Finalise payroll for {{monthLabel}}?', { monthLabel: run.monthLabel })}
        message={(totals.advanceDeductionPaise ? (run.upTo ? t('Net salary {{net}} for {{employees}} employees is booked in the accounts, {{advanceDeduction}} of advances is recovered, and this month’s attendance is locked. Salary is paid only up to {{upTo}}: the rest of {{monthLabel}} will not be paid by this or any later payroll. This cannot be undone.', { net: formatINR(totals.netPaise, { decimals: 0 }), employees: totals.employees, advanceDeduction: formatINR(totals.advanceDeductionPaise, { decimals: 0 }), upTo: formatDate(run.upTo), monthLabel: run.monthLabel }) : t('Net salary {{net}} for {{employees}} employees is booked in the accounts, {{advanceDeduction}} of advances is recovered, and this month’s attendance is locked. This cannot be undone.', { net: formatINR(totals.netPaise, { decimals: 0 }), employees: totals.employees, advanceDeduction: formatINR(totals.advanceDeductionPaise, { decimals: 0 }) })) : (run.upTo ? t('Net salary {{net}} for {{employees}} employees is booked in the accounts, and this month’s attendance is locked. Salary is paid only up to {{upTo}}: the rest of {{monthLabel}} will not be paid by this or any later payroll. This cannot be undone.', { net: formatINR(totals.netPaise, { decimals: 0 }), employees: totals.employees, upTo: formatDate(run.upTo), monthLabel: run.monthLabel }) : t('Net salary {{net}} for {{employees}} employees is booked in the accounts, and this month’s attendance is locked. This cannot be undone.', { net: formatINR(totals.netPaise, { decimals: 0 }), employees: totals.employees })))}
        confirmLabel={t('Finalise')}
        loading={finaliseState.isLoading}
        onConfirm={() => act(() => finalise(run.id), t('Payroll finalised — salaries booked'))}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        title={t('Delete this draft?')}
        message={t('Nothing has been booked yet. You can run payroll for this month again later.')}
        confirmLabel={t('Delete')}
        danger
        loading={removeState.isLoading}
        onConfirm={() => act(() => remove(run.id), t('Draft payroll deleted'), () => navigate('/hr/payroll', { replace: true }))}
        onClose={() => setConfirm(null)}
      />
    </>
  );
}
