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
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import ViewButton from '../../components/ViewButton.jsx';
import { usePermission } from '../../hooks/usePermission.js';
import { formatDate, formatDateTime } from '../../utils/format.js';
import { getErrorMessage } from '../../utils/errors.js';
import { useDeletePayrollMutation, useFinalisePayrollMutation, usePayPayrollMutation, usePayrollRunQuery, useRecalculatePayrollMutation, useUpdatePayrollLineMutation } from './hrApi.js';
import { formatDays, PAY_MODES, payModeLabel, PayrollStatusChip } from './hrUi.jsx';
import { EmployeeAvatar } from './EmployeePhoto.jsx';
import PayrollSteps, { stepOf } from './PayrollSteps.jsx';

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
  if (l.days.absent) parts.push(`${l.days.absent} absent`);
  if (l.days.halfDay) parts.push(`${l.days.halfDay} half day`);
  if (l.days.paidLeave) parts.push(`${l.days.paidLeave} leave`);
  if (l.days.holiday) parts.push(`${l.days.holiday} holiday`);
  return parts.join(' · ') || 'Full attendance';
}

function Tile({ label, children, caption }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Typography variant="caption" color="textSecondary">
          {label}
        </Typography>
        <Box sx={{ '& > span': { fontSize: '1.35rem' }, mt: 0.25 }}>{children}</Box>
        {caption && (
          <Typography variant="caption" color="textSecondary">
            {caption}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
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
      toast.success(`${line.name}’s salary updated`);
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <FormDrawer open title={line.name} subtitle={`${line.code} · ${line.designation}`} onClose={onClose} onSubmit={onSubmit} submitting={state.isLoading} submitLabel="Save">
      <Stack spacing={2}>
        <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'action.hover' }}>
          <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
            <Typography variant="body2">Gross monthly salary</Typography>
            <Typography variant="body2">{formatINR(line.grossPaise, { decimals: 0 })}</Typography>
          </Stack>
          <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
            <Typography variant="body2">
              Paid days ({daysSummary(line)})
            </Typography>
            <Typography variant="body2">
              {formatDays(line.payableDays)} / {line.daysInMonth}
            </Typography>
          </Stack>
          <Divider sx={{ my: 1 }} />
          <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              Earned for the month
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {formatINR(line.earnedPaise)}
            </Typography>
          </Stack>
        </Box>
        <TextField label="Bonus / incentive" value={form.bonus} onChange={set('bonus')} {...money} autoFocus />
        <TextField label="Other deduction" value={form.other} onChange={set('other')} helperText="Fine, damage, canteen, etc." {...money} />
        {line.advances?.length > 0 && (
          <Box sx={{ p: 1.5, borderRadius: 2, border: '1px solid rgba(201, 162, 39, 0.35)', bgcolor: 'rgba(201, 162, 39, 0.05)' }}>
            <Typography variant="subtitle2" sx={{ mb: 0.75 }}>
              Advances due this month
            </Typography>
            <Stack spacing={0.75}>
              {line.advances.map((a) => (
                <Stack key={a.advanceNo} direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {formatINR(a.amountPaise, { decimals: 0 })} given {formatDate(a.givenOn)}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      {a.advanceNo}
                      {a.recoveredPaise > 0 ? ` · ${formatINR(a.recoveredPaise, { decimals: 0 })} already recovered` : ''}
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: 'error.main' }}>
                      {formatINR(a.balancePaise, { decimals: 0 })}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      due · {formatINR(a.duePaise, { decimals: 0 })} this month
                    </Typography>
                  </Box>
                </Stack>
              ))}
            </Stack>
            {line.advanceUpcomingPaise > 0 && (
              <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 1 }}>
                {formatINR(line.advanceUpcomingPaise, { decimals: 0 })} more is set for a later month.
              </Typography>
            )}
          </Box>
        )}
        <TextField
          label="Advance to cut this month"
          value={form.advance}
          onChange={set('advance')}
          disabled={!line.advanceBalancePaise}
          error={advanceTooHigh}
          helperText={advanceTooHigh ? `Only ${formatINR(line.advanceBalancePaise, { decimals: 0 })} is due` : line.advanceBalancePaise ? `Up to ${formatINR(line.advanceBalancePaise, { decimals: 0 })} — lower it to carry the rest to next month` : line.advanceUpcomingPaise ? 'Advance is set for a later month' : 'No advance due'}
          {...money}
        />
        <TextField label="Note on payslip (optional)" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} slotProps={{ htmlInput: { maxLength: 200 } }} />
        <Alert severity={net !== null && net < 0 ? 'error' : 'success'} icon={false}>
          {net === null ? 'Enter valid amounts' : net < 0 ? 'Deductions are more than the salary' : <>Net pay <strong>{formatINR(net)}</strong></>}
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
      toast.success(`Salary of ${formatINR(total, { decimals: 0 })} paid to ${selected.size} employee${selected.size > 1 ? 's' : ''}`);
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <Dialog open onClose={state.isLoading ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>Pay salaries · {run.monthLabel}</DialogTitle>
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
            <TextField select label="Paid by" value={mode} onChange={(e) => setMode(e.target.value)}>
              {PAY_MODES.map((m) => (
                <MenuItem key={m.value} value={m.value}>
                  {m.label}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField label="Reference (optional)" value={reference} onChange={(e) => setReference(e.target.value)} helperText="Cheque / NEFT / UPI ref." slotProps={{ htmlInput: { maxLength: 60 } }} />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={state.isLoading}>
          Cancel
        </Button>
        <Button variant="contained" onClick={onPay} disabled={!selected.size || state.isLoading}>
          Pay {formatINR(total, { decimals: 0 })}
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
  const t = run.totals;
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
      title: 'Step 2 · Review salaries',
      text: 'Check paid days and use Adjust to add a bonus or deduction. Attendance changed? Recalculate keeps your adjustments.',
      action: canApprove ? (
        <Button variant="contained" startIcon={<TaskAltRoundedIcon />} onClick={() => setConfirm('finalise')} sx={{ flexShrink: 0 }}>
          Finalise payroll
        </Button>
      ) : (
        <Typography variant="body2" color="textSecondary">
          A manager finalises the payroll.
        </Typography>
      ),
    },
    finalised: {
      title: 'Step 4 · Pay salaries',
      text: `${formatINR(t.netPaise - t.paidPaise, { decimals: 0 })} still to pay to ${t.unpaidCount} staff — pay everyone at once, or one by one with Pay on each row.`,
      action: canApprove && (
        <Button variant="contained" startIcon={<PaymentsOutlinedIcon />} onClick={() => setPaying('all')} sx={{ flexShrink: 0 }}>
          Pay {formatINR(t.netPaise - t.paidPaise, { decimals: 0 })}
        </Button>
      ),
    },
    paid: {
      title: 'All done',
      text: `Everyone is paid — ${formatINR(t.paidPaise, { decimals: 0 })} in total. Payslips are ready to view and print.`,
      action: <CheckCircleRoundedIcon sx={{ color: 'success.main', fontSize: 32 }} />,
    },
  }[run.status];

  const needle = q.trim().toLowerCase();
  const lines = run.lines.filter((l) => (show === 'unpaid' ? !l.paid : show === 'paid' ? Boolean(l.paid) : true) && (!needle || `${l.name} ${l.code} ${l.designation}`.toLowerCase().includes(needle)));

  const columns = [
    {
      key: 'employee',
      label: 'Employee',
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
      label: 'Paid days',
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
      label: 'Earned',
      align: 'right',
      render: (l) => (
        <Box>
          <Typography variant="body2">{formatINR(l.earnedPaise, { decimals: 0 })}</Typography>
          <Typography variant="caption" color="textSecondary">
            of {formatINR(l.grossPaise, { decimals: 0 })}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'advance',
      label: 'Advance cut',
      align: 'right',
      render: (l) => {
        if (!l.advanceDeductionPaise && !l.advanceBalancePaise && !l.advanceUpcomingPaise) return <Typography variant="body2" color="textSecondary">—</Typography>;
        const left = l.advanceBalancePaise - l.advanceDeductionPaise;
        const given = (l.advances ?? []).map((a) => `${a.advanceNo} · given ${formatDate(a.givenOn)} · ${formatINR(a.amountPaise, { decimals: 0 })}`).join('\n');
        return (
          <Tooltip title={given ? <Box sx={{ whiteSpace: 'pre-line' }}>{given}</Box> : ''} placement="left">
            <Box>
              {l.advanceDeductionPaise > 0 ? <Amount paise={l.advanceDeductionPaise} tone="due" decimals={0} prefix="− " sx={{ display: 'block' }} /> : <Typography variant="body2" color="textSecondary">Nothing cut</Typography>}
              <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>
                {left > 0 ? `${formatINR(left, { decimals: 0 })} still due` : l.advanceBalancePaise ? 'Fully recovered' : ''}
                {l.advanceUpcomingPaise > 0 ? `${left > 0 || l.advanceBalancePaise ? ' · ' : ''}${formatINR(l.advanceUpcomingPaise, { decimals: 0 })} later` : ''}
              </Typography>
            </Box>
          </Tooltip>
        );
      },
    },
    {
      key: 'adjust',
      label: 'Bonus / other',
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
      label: 'Net pay',
      align: 'right',
      render: (l) => (
        <Box>
          <Amount paise={l.netPaise} tone={draft ? undefined : l.paid ? 'paid' : 'due'} decimals={0} sx={{ fontSize: '0.95rem' }} />
          {!draft && (
            <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>
              {l.paid ? (l.paid.mode ? `Paid · ${payModeLabel(l.paid.mode)}` : 'Nothing payable') : 'Unpaid'}
            </Typography>
          )}
        </Box>
      ),
    },
    {
      key: 'actions',
      label: 'Action',
      align: 'right',
      width: 150,
      render: (l) => (
        <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end', alignItems: 'center' }}>
          {draft && canProcess && (
            <Button size="small" variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => setEditing(l)} aria-label={`Adjust ${l.name}`}>
              Adjust
            </Button>
          )}
          {run.status === 'finalised' && !l.paid && canApprove && (
            <Button size="small" variant="contained" startIcon={<PaymentsOutlinedIcon />} onClick={() => setPaying(String(l.employeeId))} aria-label={`Pay ${l.name}`}>
              Pay
            </Button>
          )}
          <ViewButton title="Payslip" icon={ReceiptLongOutlinedIcon} onClick={() => navigate(`/hr/payroll/${run.id}/payslip/${l.employeeId}`)} name={l.name} />
        </Stack>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={`Payroll · ${run.monthLabel}`}
        subtitle={`${run.runNo} · ${run.branch?.name ?? ''}${run.finalisedAt ? ` · finalised ${formatDateTime(run.finalisedAt)}${run.finalisedBy ? ` by ${run.finalisedBy.name}` : ''}` : ''}`}
        back={{ to: '/hr/payroll', label: 'Payroll' }}
        actions={
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
            <PayrollStatusChip status={run.status} />
            {draft && canProcess && (
              <>
                <Button color="error" startIcon={<DeleteOutlineRoundedIcon />} onClick={() => setConfirm('delete')}>
                  Delete draft
                </Button>
                <Button startIcon={<RefreshRoundedIcon />} disabled={recalcState.isLoading} onClick={() => act(() => recalc(run.id), 'Recalculated from latest attendance and advances')}>
                  Recalculate
                </Button>
              </>
            )}
          </Stack>
        }
      />

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

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, md: 3 }}>
          <Tile label="Employees" caption={`Gross ${formatINR(t.grossPaise, { decimals: 0 })}`}>
            <Typography component="span" sx={{ fontWeight: 700 }}>
              {t.employees}
            </Typography>
          </Tile>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Tile label="Earned + bonus" caption={t.bonusPaise ? `incl. ${formatINR(t.bonusPaise, { decimals: 0 })} bonus` : 'No bonus'}>
            <Amount paise={t.earnedPaise + t.bonusPaise} decimals={0} />
          </Tile>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Tile label="Deductions" caption={t.advanceDeductionPaise ? `incl. ${formatINR(t.advanceDeductionPaise, { decimals: 0 })} advance` : 'No advance recovery'}>
            <Amount paise={t.otherDeductionPaise + t.advanceDeductionPaise} tone={t.otherDeductionPaise + t.advanceDeductionPaise ? 'due' : undefined} decimals={0} />
          </Tile>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Tile label="Net payable" caption={draft ? 'Not finalised' : t.unpaidCount ? `${formatINR(t.netPaise - t.paidPaise, { decimals: 0 })} still to pay` : 'All paid'}>
            <Amount paise={t.netPaise} tone={draft ? undefined : t.unpaidCount ? 'due' : 'paid'} decimals={0} />
          </Tile>
        </Grid>
      </Grid>

      <DataTable
        columns={columns}
        rows={lines}
        getRowId={(l) => String(l.employeeId)}
        empty={{ title: 'Nobody here', description: q ? 'No employee matches your search.' : show === 'unpaid' ? 'Everyone has been paid.' : 'No one has been paid yet.' }}
        toolbar={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
            <SearchField value={q} onChange={setQ} placeholder="Search name or code" />
            {!draft && (
              <ToggleButtonGroup exclusive size="small" value={show} onChange={(e, v) => v && setShow(v)} aria-label="Show">
                <ToggleButton value="all">All · {run.lines.length}</ToggleButton>
                <ToggleButton value="unpaid">Unpaid · {t.unpaidCount}</ToggleButton>
                <ToggleButton value="paid">Paid · {run.lines.length - t.unpaidCount}</ToggleButton>
              </ToggleButtonGroup>
            )}
          </Stack>
        }
      />

      <LineDrawer runId={run.id} line={editing} onClose={() => setEditing(null)} />
      {paying && <PayDialog run={run} only={paying === 'all' ? null : paying} onClose={() => setPaying(null)} />}
      <ConfirmDialog
        open={confirm === 'finalise'}
        title={`Finalise payroll for ${run.monthLabel}?`}
        message={`Net salary ${formatINR(t.netPaise, { decimals: 0 })} for ${t.employees} employees is booked in the accounts, ${t.advanceDeductionPaise ? `${formatINR(t.advanceDeductionPaise, { decimals: 0 })} of advances is recovered, ` : ''}and this month’s attendance is locked. This cannot be undone.`}
        confirmLabel="Finalise"
        loading={finaliseState.isLoading}
        onConfirm={() => act(() => finalise(run.id), 'Payroll finalised — salaries booked')}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        title="Delete this draft?"
        message="Nothing has been booked yet. You can run payroll for this month again later."
        confirmLabel="Delete"
        danger
        loading={removeState.isLoading}
        onConfirm={() => act(() => remove(run.id), 'Draft payroll deleted', () => navigate('/hr/payroll', { replace: true }))}
        onClose={() => setConfirm(null)}
      />
    </>
  );
}
