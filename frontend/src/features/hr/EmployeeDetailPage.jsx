import CallOutlinedIcon from '@mui/icons-material/CallOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';
import {
  Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Grid, IconButton, LinearProgress, Link, ListItemIcon, Menu, MenuItem, Stack, Tab, Tabs, TextField, Typography,
} from '@mui/material';
import { formatINR } from '@jerp/shared';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router';
import Amount from '../../components/Amount.jsx';
import DataTable from '../../components/DataTable.jsx';
import InfoCard from '../../components/InfoCard.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import ViewButton from '../../components/ViewButton.jsx';
import { usePermission } from '../../hooks/usePermission.js';
import { formatDate } from '../../utils/format.js';
import { getErrorMessage } from '../../utils/errors.js';
import AdvanceDrawer from './AdvanceDrawer.jsx';
import { AdvanceActions } from './AdvanceHistory.jsx';
import EmployeeAttendance from './EmployeeAttendance.jsx';
import EmploymentHistory from './EmploymentHistory.jsx';
import EmployeeFormDrawer from './EmployeeFormDrawer.jsx';
import { EmployeePhotoEditor } from './EmployeePhoto.jsx';
import { useEmployeeQuery, useSetEmployeeStatusMutation } from './hrApi.js';
import { EmploymentChip, formatDays, monthLabel, PayrollStatusChip, todayIso } from './hrUi.jsx';

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
  const canAdvance = usePermission('payroll.process');
  const [tab, setTab] = useState('details');
  const [menu, setMenu] = useState(null);
  const [editing, setEditing] = useState(false);
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
      toast.success(status === 'left' ? `${e.name} marked as left` : `${e.name} rejoined on ${formatDate(statusDate)}`);
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
        title="Employee"
        back={{ to: '/hr/employees', label: 'Employees' }}
        actions={
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            {canEdit && left && (
              <Button variant="contained" startIcon={<ReplayRoundedIcon />} onClick={() => openStatus('active')}>
                Rejoin
              </Button>
            )}
            {canAdvance && !left && (
              <Button variant="outlined" startIcon={<PaymentsOutlinedIcon />} onClick={() => setAdvancing(true)}>
                Give advance
              </Button>
            )}
            {canEdit && (
              <Button variant="contained" startIcon={<EditOutlinedIcon />} onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
            {canEdit && (
              <>
                <IconButton aria-label="More actions" onClick={(ev) => setMenu(ev.currentTarget)}>
                  <MoreVertRoundedIcon />
                </IconButton>
                <Menu anchorEl={menu} open={Boolean(menu)} onClose={() => setMenu(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
                  {left ? (
                    <MenuItem onClick={() => openStatus('active')}>
                      <ListItemIcon>
                        <ReplayRoundedIcon fontSize="small" />
                      </ListItemIcon>
                      Rejoin
                    </MenuItem>
                  ) : (
                    <MenuItem onClick={() => openStatus('left')} sx={{ color: 'error.main' }}>
                      <ListItemIcon>
                        <LogoutRoundedIcon fontSize="small" color="error" />
                      </ListItemIcon>
                      Mark as left
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
        <CardContent sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: { xs: 'center', md: 'center' }, gap: { xs: 2, md: 3 } }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2.5} sx={{ alignItems: 'center', textAlign: { xs: 'center', sm: 'left' }, flex: 1, minWidth: 0 }}>
            <EmployeePhotoEditor employee={e} canEdit={canEdit} size={88} />
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h2" sx={{ lineHeight: 1.2 }}>
                {e.name}
              </Typography>
              <Typography color="textSecondary" sx={{ mt: 0.25 }}>
                {e.designation} · {e.branch?.name ?? ''}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1, justifyContent: { xs: 'center', sm: 'flex-start' } }}>
                <Chip size="small" label={e.code} variant="outlined" sx={{ height: 22 }} />
                <EmploymentChip status={e.status} />
              </Stack>
            </Box>
          </Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: `repeat(${e.payVisible ? 4 : 2}, auto)` }, columnGap: { xs: 3, sm: 4 }, rowGap: 1.5, width: { xs: '100%', md: 'auto' } }}>
            <Fact label="Mobile">
              <Link href={`tel:${e.mobile}`} underline="hover" color="inherit" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                <CallOutlinedIcon sx={{ fontSize: 15, color: 'text.secondary' }} />
                {e.mobile}
              </Link>
            </Fact>
            <Fact label={left ? 'Left on' : 'Joined'}>{formatDate(left ? e.exitDate : e.joiningDate)}</Fact>
            {e.payVisible && <Fact label="Salary / month">{formatINR(e.grossPaise, { decimals: 0 })}</Fact>}
            {e.payVisible && <Fact label="Advance due">{e.advanceBalancePaise ? <Amount paise={e.advanceBalancePaise} tone="due" decimals={0} /> : <Box component="span" sx={{ color: 'success.main' }}>Nil</Box>}</Fact>}
          </Box>
        </CardContent>
      </Card>

      <Tabs value={tab} onChange={(ev, v) => setTab(v)} variant="scrollable" sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Tab value="details" label="Details" />
        {att && <Tab value="attendance" label="Attendance" />}
        {e.payslips && <Tab value="payslips" label={`Payslips (${e.payslips.length})`} />}
        <Tab value="history" label={`History (${e.history?.length ?? 0})`} />
        {e.advances && <Tab value="advances" label={openAdvances ? `Advances (${openAdvances} open)` : `Advances (${e.advances.length})`} />}
      </Tabs>

      {tab === 'details' && (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <InfoCard
              title="Contact"
              items={[
                { label: 'Mobile', value: e.mobile },
                { label: 'Email', value: e.email },
                { label: 'Address', value: e.address },
                { label: 'Notes', value: e.notes, hidden: !e.notes },
              ]}
            />
          </Grid>
          {e.payVisible && (
            <Grid size={{ xs: 12, md: 6 }}>
              <InfoCard
                title="Salary & bank"
                items={[
                  { label: 'Basic', value: formatINR(e.basicPaise, { decimals: 0 }) },
                  { label: 'Allowance', value: e.allowancePaise ? formatINR(e.allowancePaise, { decimals: 0 }) : 'Nil' },
                  { label: 'Gross / month', value: <Amount paise={e.grossPaise} decimals={0} /> },
                  { label: 'Bank', value: [e.bank?.accountName, e.bank?.accountNumber, e.bank?.ifsc].filter(Boolean).join(' · ') || null },
                  { label: 'PAN', value: e.pan },
                ]}
              />
            </Grid>
          )}
        </Grid>
      )}

      {tab === 'attendance' && att && <EmployeeAttendance employee={e} />}

      {tab === 'payslips' && e.payslips && (
        <DataTable
          columns={[
            { key: 'month', label: 'Month', render: (p) => <Typography variant="body2" sx={{ fontWeight: 600 }}>{monthLabel(p.month)}</Typography> },
            { key: 'days', label: 'Paid days', render: (p) => `${formatDays(p.payableDays)} / ${p.daysInMonth}` },
            { key: 'net', label: 'Net pay', align: 'right', render: (p) => <Amount paise={p.netPaise} tone={p.status === 'draft' ? undefined : p.paid ? 'paid' : 'due'} decimals={0} /> },
            { key: 'status', label: 'Status', render: (p) => (p.status === 'draft' ? <PayrollStatusChip status="draft" /> : <PayrollStatusChip status={p.paid ? 'paid' : 'finalised'} />) },
            { key: 'actions', label: 'Action', align: 'right', width: 80, render: (p) => <ViewButton title="Payslip" onClick={() => navigate(`/hr/payroll/${p.runId}/payslip/${id}`)} name={monthLabel(p.month)} /> },
          ]}
          rows={e.payslips}
          getRowId={(p) => p.runId}
          empty={{ title: 'No payslips yet', description: 'Payslips appear here once a payroll that includes this employee is run.' }}
        />
      )}

      {tab === 'history' && <EmploymentHistory employee={e} />}

      {tab === 'advances' && e.advances && (
        <DataTable
          columns={[
            {
              key: 'given',
              label: 'Given',
              render: (a) => (
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {formatINR(a.amountPaise, { decimals: 0 })} on {formatDate(a.businessDate)}
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
              label: 'Cut from',
              render: (a) => (
                <Box>
                  <Typography variant="body2">{a.recoverFrom ? `${monthLabel(a.recoverFrom)} salary` : 'Next payroll'}</Typography>
                  <Typography variant="caption" color="textSecondary">
                    {a.instalments <= 1 ? 'All at once' : `${formatINR(a.installmentPaise, { decimals: 0 })} × ${a.instalments} months`}
                  </Typography>
                </Box>
              ),
            },
            {
              key: 'progress',
              label: 'Recovered',
              width: 200,
              render: (a) => (
                <Box sx={{ minWidth: 150 }}>
                  <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>
                      {formatINR(a.recoveredPaise, { decimals: 0 })}
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 600, color: a.balancePaise ? 'error.main' : 'success.main' }}>
                      {a.balancePaise ? `${formatINR(a.balancePaise, { decimals: 0 })} left` : 'Done'}
                    </Typography>
                  </Stack>
                  <LinearProgress variant="determinate" value={Math.round((a.recoveredPaise / a.amountPaise) * 100)} color={a.balancePaise ? 'warning' : 'success'} sx={{ height: 6, borderRadius: 3 }} />
                </Box>
              ),
            },
            { key: 'actions', label: 'Action', align: 'right', width: 100, render: (a) => <AdvanceActions advance={a} canEdit={canAdvance} onEdit={(x) => setEditAdvance({ ...x, employee: { id: e.id, name: e.name } })} /> },
          ]}
          rows={e.advances}
          empty={{ title: 'No advances', description: 'Advances given to this employee and their recovery show here.' }}
        />
      )}

      <EmployeeFormDrawer open={editing} employee={e} onClose={() => setEditing(false)} />
      <AdvanceDrawer open={advancing} employee={e} onClose={() => setAdvancing(false)} />
      <AdvanceDrawer open={Boolean(editAdvance)} advance={editAdvance} onClose={() => setEditAdvance(null)} />
      <Dialog open={Boolean(statusDialog)} onClose={() => setStatusDialog(null)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>{statusDialog === 'left' ? `Mark ${e.name} as left?` : `Rejoin ${e.name}`}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
            {statusDialog === 'left'
              ? 'They stop appearing in attendance after this date. Their last month’s salary is paid only up to this day.'
              : `Left on ${formatDate(e.exitDate)}. The days in between are not on the rolls and are not paid.`}
          </Typography>
          <Stack spacing={2}>
            <TextField
              label={statusDialog === 'left' ? 'Last working day' : 'Rejoined on'}
              type="date"
              value={statusDate}
              onChange={(ev) => setStatusDate(ev.target.value)}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: statusDialog === 'left' ? { min: e.joiningDate } : { min: e.exitDate ? dayAfter(e.exitDate) : undefined, max: todayIso() } }}
            />
            <TextField label={statusDialog === 'left' ? 'Reason (optional)' : 'Note (optional)'} value={statusNote} onChange={(ev) => setStatusNote(ev.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setStatusDialog(null)}>Cancel</Button>
          <Button color={statusDialog === 'left' ? 'error' : 'primary'} variant="contained" onClick={changeStatus} disabled={!statusDate || statusState.isLoading}>
            {statusDialog === 'left' ? 'Mark as left' : 'Rejoin'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
