import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, LinearProgress, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { formatINR } from '@jerp/shared';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router';
import Amount from '../../components/Amount.jsx';
import DataTable from '../../components/DataTable.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import RowActions, { actionsWidth, DisabledDelete } from '../../components/RowActions.jsx';
import { useListParams } from '../../hooks/useListParams.js';
import { usePermission, useSession } from '../../hooks/usePermission.js';
import { tokens } from '../../theme/tokens.js';
import { getErrorMessage } from '../../utils/errors.js';
import { useCreatePayrollMutation, useDeletePayrollMutation, usePayrollListQuery } from './hrApi.js';
import { monthLabel, PayrollStatusChip, salaryMonth, thisMonth } from './hrUi.jsx';
import PayrollSteps from './PayrollSteps.jsx';
import SummaryCards, { SummaryCard } from '../../components/SummaryCards.jsx';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import { t } from '../../i18n/index.js';

const filterSlots = { inputLabel: { shrink: true }, select: { displayEmpty: true } };
const paidShare = (r) => (r.totals.netPaise ? Math.round((r.totals.paidPaise / r.totals.netPaise) * 100) : 100);

function RunPayrollDialog({ open, onClose }) {
  const { data: session } = useSession();
  const activeBranchId = useSelector((s) => s.auth.activeBranchId);
  const [branchId, setBranchId] = useState(activeBranchId ?? session.branches[0]?.id ?? '');
  const [month, setMonth] = useState(salaryMonth());
  const [create, state] = useCreatePayrollMutation();

  const onCreate = async () => {
    try {
      const run = await create({ branchId, month }).unwrap();
      toast.success((run.totals.employees === 1 ? t('Salaries calculated for {{employees}} employee', { employees: run.totals.employees }) : t('Salaries calculated for {{employees}} employees', { employees: run.totals.employees })));
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onClose={state.isLoading ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>{t('Calculate salaries')}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField label={t('Salary month')} type="month" value={month} onChange={(e) => setMonth(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: thisMonth() } }} />
          {session.branches.length > 1 && (
            <TextField select label={t('Branch')} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              {session.branches.map((b) => (
                <MenuItem key={b.id} value={b.id}>
                  {b.name}
                </MenuItem>
              ))}
            </TextField>
          )}
          <Alert severity="info" icon={false}>
            {t('Salary is worked out from attendance (unmarked days count as present) and open advances are deducted. Nothing is final until you finalise — you can review and adjust everything first.')}
          </Alert>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={state.isLoading}>
          {t('Cancel')}
        </Button>
        <Button variant="contained" startIcon={<CalculateOutlinedIcon />} onClick={onCreate} disabled={!branchId || !month || state.isLoading}>
          {t('Calculate')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** What to do next for the salary month, per branch: calculate, review, pay — or nothing, all paid. */
function SalaryMonthCard({ runs, canRun }) {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const [create, createState] = useCreatePayrollMutation();
  const month = salaryMonth();
  const branches = session.branches;

  const calculate = async (branchId) => {
    try {
      const run = await create({ branchId, month }).unwrap();
      toast.success((run.totals.employees === 1 ? t('Salaries calculated for {{employees}} employee', { employees: run.totals.employees }) : t('Salaries calculated for {{employees}} employees', { employees: run.totals.employees })));
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const rows = branches.map((b) => {
    const run = runs.find((r) => r.month === month && String(r.branch?.id) === String(b.id));
    if (!run)
      return {
        b,
        tone: 'warning',
        text: t('Not calculated yet'),
        action: canRun && (
          <Button size="small" variant="contained" startIcon={<CalculateOutlinedIcon />} disabled={createState.isLoading} onClick={() => calculate(b.id)}>
            {t('Calculate now')}
          </Button>
        ),
      };
    if (run.status === 'draft')
      return {
        b,
        tone: 'warning',
        text: t('Calculated · {{net}} for {{employees}} staff — review and finalise', { net: formatINR(run.totals.netPaise, { decimals: 0 }), employees: run.totals.employees }),
        action: (
          <Button size="small" variant="contained" endIcon={<ArrowForwardRoundedIcon />} onClick={() => navigate(`/hr/payroll/${run.id}`)}>
            {t('Review')}
          </Button>
        ),
      };
    if (run.status === 'finalised')
      return {
        b,
        tone: 'error',
        text: t('{{formatINR}} still to pay to {{unpaidCount}} staff', { formatINR: formatINR(run.totals.netPaise - run.totals.paidPaise, { decimals: 0 }), unpaidCount: run.totals.unpaidCount }),
        action: (
          <Button size="small" variant="contained" startIcon={<PaymentsOutlinedIcon />} onClick={() => navigate(`/hr/payroll/${run.id}`)}>
            {t('Pay now')}
          </Button>
        ),
      };
    return { b, tone: 'success', text: t('All paid · {{paid}}', { paid: formatINR(run.totals.paidPaise, { decimals: 0 }) }), action: <CheckCircleRoundedIcon sx={{ color: 'success.main' }} /> };
  });

  return (
    <Card sx={{ mb: 2, position: 'relative', overflow: 'hidden', '&::before': { content: '""', position: 'absolute', inset: '0 auto 0 0', width: 4, background: tokens.sidebar.goldGradient } }}>
      <CardContent sx={{ pl: 3 }}>
        <Typography variant="overline" color="textSecondary">
          {t('Salary due now')}
        </Typography>
        <Typography variant="h3" sx={{ mb: 1.5 }}>
          {monthLabel(month)}
        </Typography>
        <Stack divider={<Divider flexItem />} spacing={1.25}>
          {rows.map(({ b, tone, text, action }) => (
            <Stack key={b.id} direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
              <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', minWidth: 0 }}>
                <Box sx={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, bgcolor: `${tone}.main` }} />
                <Typography variant="body2" sx={{ minWidth: 0 }}>
                  {branches.length > 1 && <strong>{b.name}: </strong>}
                  {text}
                </Typography>
              </Stack>
              <Box sx={{ flexShrink: 0 }}>{action}</Box>
            </Stack>
          ))}
        </Stack>
      </CardContent>
    </Card>
  );
}

/** A draft payroll has booked nothing yet, so it can be deleted (and calculated again later). */
function DeleteDraftRun({ run }) {
  const [open, setOpen] = useState(false);
  const [remove, { isLoading }] = useDeletePayrollMutation();
  const confirm = async () => {
    try {
      await remove(run.id).unwrap();
      toast.success(t('Payroll {{runNo}} deleted', { runNo: run.runNo }));
      setOpen(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };
  return (
    <>
      <Tooltip title={t('Delete draft')}>
        <IconButton size="small" color="error" onClick={() => setOpen(true)} aria-label={t('Delete {{runNo}}', { runNo: run.runNo })}>
          <DeleteOutlineRoundedIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <ConfirmDialog
        open={open}
        title={t('Delete payroll {{runNo}}?', { runNo: run.runNo })}
        message={t('This draft for {{monthLabel}} has not been finalised, so nothing was booked. You can calculate the month again any time.', { monthLabel: monthLabel(run.month) })}
        confirmLabel={t('Delete')}
        danger
        loading={isLoading}
        onConfirm={confirm}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

export default function PayrollPage() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const canRun = usePermission('payroll.process');
  const [open, setOpen] = useState(false);
  const list = useListParams({ branchId: '' });
  const { data, isLoading, isFetching, error, refetch } = usePayrollListQuery(list.params);
  const { data: recent } = usePayrollListQuery({ limit: 100 });
  const multiBranch = session.branches.length > 1;
  const runs = recent?.items ?? [];

  const year = thisMonth().slice(0, 4);
  const drafts = runs.filter((r) => r.status === 'draft');
  const toPay = runs.filter((r) => r.status === 'finalised').reduce((s, r) => s + r.totals.netPaise - r.totals.paidPaise, 0);
  const paidThisYear = runs.filter((r) => r.month.startsWith(year)).reduce((s, r) => s + r.totals.paidPaise, 0);

  const columns = [
    {
      key: 'month',
      label: t('Month'),
      render: (r) => (
        <Box>
          <Typography variant="subtitle2">{monthLabel(r.month)}</Typography>
          <Typography variant="caption" color="textSecondary">
            {r.runNo}
            {multiBranch && r.branch ? ` · ${r.branch.name}` : ''}
          </Typography>
        </Box>
      ),
    },
    { key: 'staff', label: t('Staff'), align: 'right', render: (r) => r.totals.employees },
    { key: 'net', label: t('Net salary'), align: 'right', render: (r) => <Amount paise={r.totals.netPaise} decimals={0} /> },
    {
      key: 'progress',
      label: t('Paid'),
      width: 200,
      render: (r) =>
        r.status === 'draft' ? (
          <Typography variant="body2" color="textSecondary">
            {t('Not finalised')}
          </Typography>
        ) : (
          <Box sx={{ minWidth: 140 }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                {formatINR(r.totals.paidPaise, { decimals: 0 })}
              </Typography>
              <Typography variant="caption" color={paidShare(r) === 100 ? 'success.main' : 'error.main'} sx={{ fontWeight: 600 }}>
                {paidShare(r) === 100 ? t('Done') : t('{{formatINR}} due', { formatINR: formatINR(r.totals.netPaise - r.totals.paidPaise, { decimals: 0 }) })}
              </Typography>
            </Stack>
            <LinearProgress variant="determinate" value={paidShare(r)} color={paidShare(r) === 100 ? 'success' : 'warning'} sx={{ height: 6, borderRadius: 3 }} />
          </Box>
        ),
    },
    { key: 'status', label: t('Status'), render: (r) => <PayrollStatusChip status={r.status} /> },
  ];

  return (
    <>
      <PageHeader
        title={t('Payroll')}
        subtitle={t('Monthly salaries in four simple steps.')}
        actions={
          canRun && (
            <Button variant="contained" startIcon={<PlayArrowRoundedIcon />} onClick={() => setOpen(true)}>
              {t('Run payroll')}
            </Button>
          )
        }
      />

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <PayrollSteps current={-1} />
        </CardContent>
      </Card>

      {recent && <SalaryMonthCard runs={runs} canRun={canRun} />}

      <SummaryCards>
        <SummaryCard icon={FactCheckOutlinedIcon} label={t('Waiting to finalise')} value={drafts.length} caption={drafts.length ? t('Draft payroll to review') : t('Nothing pending')} tone={drafts.length ? 'amber' : 'grey'} />
        <SummaryCard icon={AccountBalanceWalletOutlinedIcon} label={t('Salary still to pay')} value={formatINR(toPay, { decimals: 0 })} caption={toPay ? t('Finalised but unpaid') : t('Everyone is paid')} tone={toPay ? 'red' : 'green'} valueTone={toPay ? 'due' : 'paid'} />
        <SummaryCard icon={PaymentsOutlinedIcon} label={t('Paid in {{year}}', { year })} value={formatINR(paidThisYear, { decimals: 0 })} caption={t('Salaries paid this year')} tone="blue" />
      </SummaryCards>

      <DataTable
        columns={[
          ...columns,
          {
            key: 'actions',
            label: t('Action'),
            align: 'right',
            width: actionsWidth(2),
            render: (r) => (
              <RowActions onView={() => navigate(`/hr/payroll/${r.id}`)} name={r.runNo}>
                {!canRun ? (
                  <DisabledDelete reason={t('You do not have permission to delete payroll.')} />
                ) : r.status === 'draft' ? (
                  <DeleteDraftRun run={r} />
                ) : (
                  <DisabledDelete reason={t('Finalised payroll is booked in the accounts and cannot be deleted.')} />
                )}
              </RowActions>
            ),
          },
        ]}
        rows={data?.items}
        loading={isLoading}
        fetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={{ title: t('No payroll yet'), description: t('Calculate salaries at the end of the month — it takes one click.') }}
        pagination={list.pagination(data?.meta)}
        toolbar={
          multiBranch && (
            <TextField select label={t('Branch')} value={list.filters.branchId} onChange={(e) => list.setFilter('branchId', e.target.value)} slotProps={filterSlots} sx={{ width: { sm: 220 } }}>
              <MenuItem value="">{t('All branches')}</MenuItem>
              {session.branches.map((b) => (
                <MenuItem key={b.id} value={b.id}>
                  {b.name}
                </MenuItem>
              ))}
            </TextField>
          )
        }
      />
      {open && <RunPayrollDialog open onClose={() => setOpen(false)} />}
    </>
  );
}
