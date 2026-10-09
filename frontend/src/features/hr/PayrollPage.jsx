import PlayArrowRoundedIcon from '@mui/icons-material/PlayArrowRounded';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { formatINR } from '@jerp/shared';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router';
import Amount from '../../components/Amount.jsx';
import DataTable from '../../components/DataTable.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { viewColumn } from '../../components/ViewButton.jsx';
import { useListParams } from '../../hooks/useListParams.js';
import { usePermission, useSession } from '../../hooks/usePermission.js';
import { getErrorMessage } from '../../utils/errors.js';
import { useCreatePayrollMutation, usePayrollListQuery } from './hrApi.js';
import { monthLabel, PayrollStatusChip, thisMonth } from './hrUi.jsx';

const filterSlots = { inputLabel: { shrink: true }, select: { displayEmpty: true } };

function RunPayrollDialog({ open, onClose }) {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const activeBranchId = useSelector((s) => s.auth.activeBranchId);
  const [branchId, setBranchId] = useState(activeBranchId ?? session.branches[0]?.id ?? '');
  const [month, setMonth] = useState(thisMonth());
  const [create, state] = useCreatePayrollMutation();

  const onCreate = async () => {
    try {
      const run = await create({ branchId, month }).unwrap();
      toast.success(`Payroll ${run.runNo} created for ${run.totals.employees} employee${run.totals.employees > 1 ? 's' : ''}`);
      onClose();
      navigate(`/hr/payroll/${run.id}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onClose={state.isLoading ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>Run payroll</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {session.branches.length > 1 && (
            <TextField select label="Branch" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              {session.branches.map((b) => (
                <MenuItem key={b.id} value={b.id}>
                  {b.name}
                </MenuItem>
              ))}
            </TextField>
          )}
          <TextField label="Month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: thisMonth() } }} />
          <Alert severity="info" icon={false}>
            Salaries are worked out from attendance (unmarked days = present) and open advances are deducted. You can review and adjust everything before finalising.
          </Alert>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={state.isLoading}>
          Cancel
        </Button>
        <Button variant="contained" onClick={onCreate} disabled={!branchId || !month || state.isLoading}>
          Calculate salaries
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function PayrollPage() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const canRun = usePermission('payroll.process');
  const [open, setOpen] = useState(false);
  const list = useListParams({ branchId: '' });
  const { data, isLoading, isFetching, error, refetch } = usePayrollListQuery(list.params);
  const multiBranch = session.branches.length > 1;

  const columns = [
    {
      key: 'month',
      label: 'Month',
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
    { key: 'staff', label: 'Staff', align: 'right', render: (r) => r.totals.employees },
    { key: 'net', label: 'Net salary', align: 'right', render: (r) => <Amount paise={r.totals.netPaise} decimals={0} /> },
    {
      key: 'paid',
      label: 'Paid / unpaid',
      align: 'right',
      render: (r) =>
        r.status === 'draft' ? (
          <Typography variant="body2" color="textSecondary">
            —
          </Typography>
        ) : (
          <Box>
            <Amount paise={r.totals.paidPaise} tone="paid" decimals={0} />
            {r.totals.netPaise - r.totals.paidPaise > 0 && (
              <Typography variant="caption" sx={{ display: 'block', color: 'error.main', fontWeight: 600 }}>
                {formatINR(r.totals.netPaise - r.totals.paidPaise, { decimals: 0 })} due
              </Typography>
            )}
          </Box>
        ),
    },
    { key: 'status', label: 'Status', render: (r) => <PayrollStatusChip status={r.status} /> },
  ];

  return (
    <>
      <PageHeader
        title="Payroll"
        subtitle="Monthly salary for each branch: calculate, review, finalise, then pay."
        actions={
          canRun && (
            <Button variant="contained" startIcon={<PlayArrowRoundedIcon />} onClick={() => setOpen(true)}>
              Run payroll
            </Button>
          )
        }
      />
      <DataTable
        columns={[...columns, viewColumn((r) => navigate(`/hr/payroll/${r.id}`), { name: (r) => r.runNo })]}
        rows={data?.items}
        loading={isLoading}
        fetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={{ title: 'No payroll yet', description: 'Run payroll at the end of the month to calculate everyone’s salary.' }}
        pagination={list.pagination(data?.meta)}
        toolbar={
          multiBranch && (
            <TextField select label="Branch" value={list.filters.branchId} onChange={(e) => list.setFilter('branchId', e.target.value)} slotProps={filterSlots} sx={{ width: { sm: 220 } }}>
              <MenuItem value="">All branches</MenuItem>
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
