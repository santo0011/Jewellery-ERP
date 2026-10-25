import CallOutlinedIcon from '@mui/icons-material/CallOutlined';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';
import {
  Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, LinearProgress, Link, ListItemIcon, Menu, MenuItem, Stack, TextField, Typography, useMediaQuery,
} from '@mui/material';
import { formatINR } from '@jerp/shared';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router';
import Amount from '../../components/Amount.jsx';
import DataTable from '../../components/DataTable.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import ViewButton from '../../components/ViewButton.jsx';
import { usePermission } from '../../hooks/usePermission.js';
import { useTabParam } from '../../hooks/useListParams.js';
import { formatDate } from '../../utils/format.js';
import { getErrorMessage } from '../../utils/errors.js';
import AdvanceDrawer from './AdvanceDrawer.jsx';
import { AdvanceActions } from './AdvanceHistory.jsx';
import EmployeeAttendance from './EmployeeAttendance.jsx';
import EmployeeDetailsTab from './EmployeeDetailsTab.jsx';
import EmploymentHistory, { SalaryHistory } from './EmploymentHistory.jsx';
import { EmployeePhotoEditor } from './EmployeePhoto.jsx';
import { useEmployeeQuery, useSetEmployeeStatusMutation } from './hrApi.js';
import { EmploymentChip, formatDays, monthLabel, PayrollStatusChip, todayIso } from './hrUi.jsx';
import ViewTabs from '../../components/ViewTabs.jsx';
import { t } from '../../i18n/index.js';

const dayAfter = (iso) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);

/** One fact in the profile card: small label, value below. */
function Fact({ label, children }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>
        {label}
      </Typography>
      <Box sx={{ fontWeight: 600, fontSize: '0.9375rem' }}>{children}</Box>
    </Box>
  );
}

export default function EmployeeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: e, isLoading, error, refetch } = useEmployeeQuery(id);
  const canEdit = usePermission('employee.edit');
  const phone = useMediaQuery((theme) => theme.breakpoints.down('sm'));
  const canAdvance = usePermission('payroll.process');
  const [tab, setTab] = useTabParam('details');
  const [menu, setMenu] = useState(null);
  const [advancing, setAdvancing] = useState(false);
  const [editAdvance, setEditAdvance] = useState(null);
  // Leave / rejoin dialog: which change, its date and an optional reason.
  const [statusDialog, setStatusDialog] = useState(null);
  const [statusDate, setStatusDate] = useState(todayIso());
  const [statusNote, setStatusNote] = useState('');
  const [setStatus, statusState] = useSetEmployeeStatusMutation();

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const left = e.status === 'left';
  const openStatus = (status) => {
    setMenu(null);
    setStatusDate(todayIso());
    setStatusNote('');
    setStatusDialog(status);
  };
  const changeStatus = async () => {
    const status = statusDialog;
    try {
      await setStatus({ id, status, ...(status === 'left' ? { exitDate: statusDate } : { rejoinDate: statusDate }), note: statusNote.trim() || null }).unwrap();
      toast.success(status === 'left' ? t('{{name}} marked as left', { name: e.name }) : t('{{name}} rejoined on {{statusDate}}', { name: e.name, statusDate: formatDate(statusDate) }));
      setStatusDialog(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const att = e.attendance;
  const openAdvances = (e.advances ?? []).filter((a) => a.status === 'open').length;

  return (
    <>
      <PageHeader
        title={t('Employee')}
        back={{ to: '/hr/employees', label: t('Employees') }}
        actions={
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            {canEdit && left && (
              <Button variant="contained" startIcon={<ReplayRoundedIcon />} onClick={() => openStatus('active')}>
                {t('Rejoin')}
              </Button>
            )}
            {canAdvance && !left && (
              <Button variant="outlined" startIcon={<PaymentsOutlinedIcon />} onClick={() => setAdvancing(true)}>
                {t('Give advance')}
              </Button>
            )}
            {canEdit && (
              <>
                <IconButton aria-label={t('More actions')} onClick={(ev) => setMenu(ev.currentTarget)}>
                  <MoreVertRoundedIcon />
                </IconButton>
                <Menu anchorEl={menu} open={Boolean(menu)} onClose={() => setMenu(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
                  {left ? (
                    <MenuItem onClick={() => openStatus('active')}>
                      <ListItemIcon>
                        <ReplayRoundedIcon fontSize="small" />
                      </ListItemIcon>
                      {t('Rejoin')}
                    </MenuItem>
                  ) : (
                    <MenuItem onClick={() => openStatus('left')} sx={{ color: 'error.main' }}>
                      <ListItemIcon>
                        <LogoutRoundedIcon fontSize="small" color="error" />
                      </ListItemIcon>
                      {t('Mark as left')}
                    </MenuItem>
                  )}
                </Menu>
              </>
            )}
          </Stack>
        }
      />

      {/* Profile: photo, name and the few facts people look for. */}
      <Card sx={{ mb: 2 }}>
        {/* Phones: photo beside the name (not stacked above it), so the card stays short. */}
        <CardContent sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: { xs: 'stretch', md: 'center' }, gap: { xs: 1.75, md: 2.5 }, p: 2, '&:last-child': { pb: 2 } }}>
          <Stack direction="row" spacing={{ xs: 1.5, sm: 2 }} sx={{ alignItems: 'center', flex: 1, minWidth: 0 }}>
            <EmployeePhotoEditor employee={e} canEdit={canEdit} size={phone ? 60 : 68} />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h2" sx={{ lineHeight: 1.2, fontSize: { xs: '1.1875rem', sm: '1.3125rem' } }}>
                {e.name}
              </Typography>
              <Typography color="textSecondary" sx={{ mt: 0.25 }}>
                {e.designation} · {e.branch?.name ?? ''}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: { xs: 0.75, sm: 1 } }}>
                <Chip size="small" label={e.code} variant="outlined" sx={{ height: 22 }} />
                <EmploymentChip status={e.status} />
              </Stack>
            </Box>
          </Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: `repeat(${e.payVisible ? 4 : 2}, auto)` }, columnGap: { xs: 2, sm: 4 }, rowGap: { xs: 1, sm: 1.5 }, width: { xs: '100%', md: 'auto' }, pt: { xs: 1.5, md: 0 }, borderTop: { xs: 1, md: 0 }, borderColor: 'divider' }}>
            <Fact label={t('Mobile')}>
              <Link href={`tel:${e.mobile}`} underline="hover" color="inherit" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                <CallOutlinedIcon sx={{ fontSize: 15, color: 'text.secondary' }} />
                {e.mobile}
              </Link>
            </Fact>
            <Fact label={left ? t('Left on') : t('Joined')}>{formatDate(left ? e.exitDate : e.joiningDate)}</Fact>
            {e.payVisible && <Fact label={t('Salary / month')}>{formatINR(e.grossPaise, { decimals: 0 })}</Fact>}
            {e.payVisible && <Fact label={t('Advance due')}>{e.advanceBalancePaise ? <Amount paise={e.advanceBalancePaise} tone="due" decimals={0} /> : <Box component="span" sx={{ color: 'success.main' }}>{t('Nil')}</Box>}</Fact>}
          </Box>
        </CardContent>
      </Card>

      <ViewTabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'details', label: t('Details') },
          att && { value: 'attendance', label: t('Attendance') },
          e.payslips && { value: 'payslips', label: t('Payslips'), count: e.payslips.length },
          { value: 'history', label: t('History'), count: e.history?.length ?? 0 },
          e.advances && { value: 'advances', label: t('Advances'), count: openAdvances ? t('{{openAdvances}} open', { openAdvances }) : e.advances.length },
        ]}
      />

      {tab === 'details' && <EmployeeDetailsTab employee={e} />}

      {tab === 'attendance' && att && <EmployeeAttendance employee={e} />}

      {tab === 'payslips' && e.payslips && (
        <DataTable
          columns={[
            { key: 'month', label: t('Month'), render: (p) => <Typography variant="body2" sx={{ fontWeight: 600 }}>{monthLabel(p.month)}</Typography> },
            { key: 'days', label: t('Paid days'), render: (p) => `${formatDays(p.payableDays)} / ${p.daysInMonth}` },
            { key: 'net', label: t('Net pay'), align: 'right', render: (p) => <Amount paise={p.netPaise} tone={p.status === 'draft' ? undefined : p.paid ? 'paid' : 'due'} decimals={0} /> },
            { key: 'status', label: t('Status'), render: (p) => (p.status === 'draft' ? <PayrollStatusChip status="draft" /> : <PayrollStatusChip status={p.paid ? 'paid' : 'finalised'} />) },
            { key: 'actions', label: t('Action'), align: 'right', width: 80, render: (p) => <ViewButton title={t('Payslip')} onClick={() => navigate(`/hr/payroll/${p.runId}/payslip/${id}`)} name={monthLabel(p.month)} /> },
          ]}
          rows={e.payslips}
          getRowId={(p) => p.runId}
          empty={{ title: t('No payslips yet'), description: t('Payslips appear here once a payroll that includes this employee is run.') }}
        />
      )}

      {tab === 'history' && (
        <Stack spacing={2}>
          <EmploymentHistory employee={e} />
          {e.salaryHistory && <SalaryHistory rows={e.salaryHistory} />}
        </Stack>
      )}

      {tab === 'advances' && e.advances && (
        <DataTable
          columns={[
            {
              key: 'given',
              label: t('Given'),
              render: (a) => (
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {t('{{amount}} on {{businessDate}}', { amount: formatINR(a.amountPaise, { decimals: 0 }), businessDate: formatDate(a.businessDate) })}
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    {a.advanceNo}
                    {a.note ? ` · ${a.note}` : ''}
                  </Typography>
                </Box>
              ),
            },
            {
              key: 'plan',
              label: t('Cut from'),
              render: (a) => (
                <Box>
                  <Typography variant="body2">{a.recoverFrom ? t('{{monthLabel}} salary', { monthLabel: monthLabel(a.recoverFrom) }) : t('Next payroll')}</Typography>
                  <Typography variant="caption" color="textSecondary">
                    {a.instalments <= 1 ? t('All at once') : t('{{installment}} × {{instalments}} months', { installment: formatINR(a.installmentPaise, { decimals: 0 }), instalments: a.instalments })}
                  </Typography>
                </Box>
              ),
            },
            {
              key: 'progress',
              label: t('Recovered'),
              width: 200,
              render: (a) => (
                <Box sx={{ minWidth: 150 }}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>
                      {formatINR(a.recoveredPaise, { decimals: 0 })}
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: a.balancePaise ? 'error.main' : 'success.main' }}>
                      {a.balancePaise ? t('{{balance}} left', { balance: formatINR(a.balancePaise, { decimals: 0 }) }) : t('Done')}
                    </Typography>
                  </Stack>
                  <LinearProgress variant="determinate" value={Math.round((a.recoveredPaise / a.amountPaise) * 100)} color={a.balancePaise ? 'warning' : 'success'} sx={{ height: 6, borderRadius: 3 }} />
                </Box>
              ),
            },
            { key: 'actions', label: t('Action'), align: 'right', width: 100, render: (a) => <AdvanceActions advance={a} canEdit={canAdvance} onEdit={(x) => setEditAdvance({ ...x, employee: { id: e.id, name: e.name } })} /> },
          ]}
          rows={e.advances}
          empty={{ title: t('No advances'), description: t('Advances given to this employee and their recovery show here.') }}
        />
      )}

      <AdvanceDrawer open={advancing} employee={e} onClose={() => setAdvancing(false)} />
      <AdvanceDrawer open={Boolean(editAdvance)} advance={editAdvance} onClose={() => setEditAdvance(null)} />
      <Dialog open={Boolean(statusDialog)} onClose={() => setStatusDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>{statusDialog === 'left' ? t('Mark {{name}} as left?', { name: e.name }) : t('Rejoin {{name}}', { name: e.name })}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
            {statusDialog === 'left'
              ? t('They stop appearing in attendance after this date. Their last month’s salary is paid only up to this day.')
              : t('Left on {{exitDate}}. The days in between are not on the rolls and are not paid.', { exitDate: formatDate(e.exitDate) })}
          </Typography>
          <Stack spacing={2}>
            <TextField
              label={statusDialog === 'left' ? t('Last working day') : t('Rejoined on')}
              type="date"
              value={statusDate}
              onChange={(ev) => setStatusDate(ev.target.value)}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: statusDialog === 'left' ? { min: e.joiningDate } : { min: e.exitDate ? dayAfter(e.exitDate) : undefined, max: todayIso() } }}
            />
            <TextField label={statusDialog === 'left' ? t('Reason (optional)') : t('Note (optional)')} value={statusNote} onChange={(ev) => setStatusNote(ev.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStatusDialog(null)}>{t('Cancel')}</Button>
          <Button color={statusDialog === 'left' ? 'error' : 'primary'} variant="contained" onClick={changeStatus} disabled={!statusDate || statusState.isLoading}>
            {statusDialog === 'left' ? t('Mark as left') : t('Rejoin')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
