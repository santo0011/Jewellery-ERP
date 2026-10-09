import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';
import { Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Grid, Stack, TextField, Tooltip, Typography } from '@mui/material';
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
import EmployeeFormDrawer from './EmployeeFormDrawer.jsx';
import { useEmployeeQuery, useSetEmployeeStatusMutation } from './hrApi.js';
import { ATTENDANCE_COLORS, attendanceLabel, EmploymentChip, formatDays, monthLabel, PayrollStatusChip, todayIso } from './hrUi.jsx';

function Stat({ label, value, tone }) {
  return (
    <Box sx={{ minWidth: 90 }}>
      <Typography variant="caption" color="textSecondary">
        {label}
      </Typography>
      <Typography variant="h3" sx={{ color: tone ?? 'text.primary' }}>
        {value}
      </Typography>
    </Box>
  );
}

export default function EmployeeDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: e, isLoading, error, refetch } = useEmployeeQuery(id);
  const canEdit = usePermission('employee.edit');
  const canAdvance = usePermission('payroll.process');
  const [editing, setEditing] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [exitDate, setExitDate] = useState(todayIso());
  const [setStatus, statusState] = useSetEmployeeStatusMutation();

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const left = e.status === 'left';
  const changeStatus = async (status) => {
    try {
      await setStatus({ id, status, ...(status === 'left' && { exitDate }) }).unwrap();
      toast.success(status === 'left' ? `${e.name} marked as left` : `${e.name} is active again`);
      setLeaving(false);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const att = e.attendance;
  return (
    <>
      <PageHeader
        title={e.name}
        subtitle={`${e.code} · ${e.designation} · ${e.branch?.name ?? ''}`}
        back={{ to: '/hr/employees', label: 'Employees' }}
        actions={
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
            {canEdit &&
              (left ? (
                <Button startIcon={<ReplayRoundedIcon />} onClick={() => changeStatus('active')} disabled={statusState.isLoading}>
                  Rejoin
                </Button>
              ) : (
                <Button color="error" startIcon={<LogoutRoundedIcon />} onClick={() => setLeaving(true)}>
                  Mark as left
                </Button>
              ))}
            {canAdvance && !left && (
              <Button variant="outlined" color="secondary" startIcon={<PaymentsOutlinedIcon />} onClick={() => setAdvancing(true)}>
                Give advance
              </Button>
            )}
            {canEdit && (
              <Button variant="contained" startIcon={<EditOutlinedIcon />} onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
          </Stack>
        }
      />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <InfoCard
            title="Profile"
            action={<EmploymentChip status={e.status} />}
            items={[
              { label: 'Mobile', value: e.mobile },
              { label: 'Email', value: e.email },
              { label: 'Branch', value: e.branch?.name },
              { label: 'Joined', value: formatDate(e.joiningDate) },
              { label: 'Left on', value: e.exitDate ? formatDate(e.exitDate) : null, hidden: !e.exitDate },
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
                { label: 'Advance due', value: e.advanceBalancePaise ? <Amount paise={e.advanceBalancePaise} tone="due" decimals={0} /> : 'Nil', hidden: e.advances === null },
                { label: 'Bank', value: [e.bank?.accountName, e.bank?.accountNumber, e.bank?.ifsc].filter(Boolean).join(' · ') || null },
                { label: 'PAN', value: e.pan },
              ]}
            />
          </Grid>
        )}

        {att && (
          <Grid size={12}>
            <Card>
              <CardContent>
                <Typography variant="overline" color="textSecondary">
                  Attendance · {monthLabel(att.month)}
                </Typography>
                <Stack direction="row" spacing={3} sx={{ my: 1.5, flexWrap: 'wrap', rowGap: 1.5 }}>
                  <Stat label="Absent" value={att.absent} tone={att.absent ? 'error.main' : undefined} />
                  <Stat label="Half days" value={att.halfDay} tone={att.halfDay ? 'warning.main' : undefined} />
                  <Stat label="Paid leave" value={att.paidLeave} />
                  <Stat label="Holidays" value={att.holiday} />
                </Stack>
                {att.days.length ? (
                  <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                    {att.days.map((d) => (
                      <Tooltip key={d.date} title={`${formatDate(d.date)} · ${attendanceLabel(d.status)}${d.note ? ` · ${d.note}` : ''}`}>
                        <Chip size="small" label={`${Number(d.date.slice(8))} · ${attendanceLabel(d.status)}`} color={ATTENDANCE_COLORS[d.status]} variant="outlined" />
                      </Tooltip>
                    ))}
                  </Stack>
                ) : (
                  <Typography variant="body2" color="textSecondary">
                    No days marked this month — unmarked days count as present.
                  </Typography>
                )}
              </CardContent>
            </Card>
          </Grid>
        )}

        {e.payslips && (
          <Grid size={12}>
            <Typography variant="h3" sx={{ mb: 1 }}>
              Payslips
            </Typography>
            <DataTable
              columns={[
                { key: 'month', label: 'Month', render: (p) => <Typography variant="body2" sx={{ fontWeight: 600 }}>{monthLabel(p.month)}</Typography> },
                { key: 'days', label: 'Paid days', render: (p) => `${formatDays(p.payableDays)} / ${p.daysInMonth}` },
                { key: 'net', label: 'Net pay', align: 'right', render: (p) => <Amount paise={p.netPaise} tone={p.status === 'draft' ? undefined : p.paid ? 'paid' : 'due'} decimals={0} /> },
                { key: 'status', label: 'Status', render: (p) => (p.status === 'draft' ? <PayrollStatusChip status="draft" /> : <PayrollStatusChip status={p.paid ? 'paid' : 'finalised'} />) },
                { key: 'actions', label: '', align: 'right', width: 56, render: (p) => <ViewButton title="Payslip" onClick={() => navigate(`/hr/payroll/${p.runId}/payslip/${id}`)} name={monthLabel(p.month)} /> },
              ]}
              rows={e.payslips}
              getRowId={(p) => p.runId}
              empty={{ title: 'No payslips yet', description: 'Payslips appear here once a payroll that includes this employee is run.' }}
            />
          </Grid>
        )}

        {e.advances && (
          <Grid size={12}>
            <Typography variant="h3" sx={{ mb: 1 }}>
              Salary advances
            </Typography>
            <DataTable
              columns={[
                {
                  key: 'no',
                  label: 'Advance',
                  render: (a) => (
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {a.advanceNo}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        {formatDate(a.businessDate)}
                        {a.note ? ` · ${a.note}` : ''}
                      </Typography>
                    </Box>
                  ),
                },
                { key: 'amount', label: 'Given', align: 'right', render: (a) => <Amount paise={a.amountPaise} decimals={0} /> },
                { key: 'inst', label: 'Per month', align: 'right', render: (a) => formatINR(a.installmentPaise, { decimals: 0 }) },
                { key: 'recovered', label: 'Recovered', align: 'right', render: (a) => <Amount paise={a.recoveredPaise} tone="paid" decimals={0} /> },
                { key: 'balance', label: 'Balance', align: 'right', render: (a) => (a.balancePaise ? <Amount paise={a.balancePaise} tone="due" decimals={0} /> : 'Nil') },
                { key: 'status', label: 'Status', render: (a) => <Chip size="small" label={a.status === 'open' ? 'Recovering' : 'Closed'} color={a.status === 'open' ? 'warning' : 'default'} variant="outlined" sx={{ height: 22 }} /> },
              ]}
              rows={e.advances}
              empty={{ title: 'No advances', description: 'Advances given to this employee and their recovery show here.' }}
            />
          </Grid>
        )}
      </Grid>

      <EmployeeFormDrawer open={editing} employee={e} onClose={() => setEditing(false)} />
      <AdvanceDrawer open={advancing} employee={e} onClose={() => setAdvancing(false)} />
      <Dialog open={leaving} onClose={() => setLeaving(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>Mark {e.name} as left?</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
            They stop appearing in attendance after this date. Their last month’s salary is paid only up to the exit date.
          </Typography>
          <TextField label="Last working day" type="date" value={exitDate} onChange={(ev) => setExitDate(ev.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: e.joiningDate } }} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setLeaving(false)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={() => changeStatus('left')} disabled={!exitDate || statusState.isLoading}>
            Mark as left
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
