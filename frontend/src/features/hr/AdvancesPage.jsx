import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { Box, Button, Chip, LinearProgress, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { formatINR } from '@jerp/shared';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import Amount from '../../components/Amount.jsx';
import DataTable from '../../components/DataTable.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import SearchField from '../../components/SearchField.jsx';
import ViewButton from '../../components/ViewButton.jsx';
import { useListParams } from '../../hooks/useListParams.js';
import { usePermission } from '../../hooks/usePermission.js';
import { formatDate } from '../../utils/format.js';
import AdvanceDrawer from './AdvanceDrawer.jsx';
import { AdvanceActions } from './AdvanceHistory.jsx';
import { useAdvanceListQuery } from './hrApi.js';
import { monthLabel, payModeLabel } from './hrUi.jsx';

const filterSlots = { inputLabel: { shrink: true }, select: { displayEmpty: true } };

export default function AdvancesPage() {
  const navigate = useNavigate();
  const canGive = usePermission('payroll.process');
  const [open, setOpen] = useState(false);
  const [editAdvance, setEditAdvance] = useState(null);
  const list = useListParams({ status: 'open' });
  const { data, isLoading, isFetching, error, refetch } = useAdvanceListQuery(list.params);

  const columns = [
    {
      key: 'employee',
      label: 'Employee',
      render: (a) => (
        <Box>
          <Typography variant="subtitle2">{a.employee.name}</Typography>
          <Typography variant="caption" color="textSecondary">
            {a.advanceNo} · {payModeLabel(a.mode)}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'given',
      label: 'Given on',
      render: (a) => (
        <Box>
          <Typography variant="body2">{formatDate(a.businessDate)}</Typography>
          <Amount paise={a.amountPaise} decimals={0} sx={{ fontWeight: 600 }} />
        </Box>
      ),
    },
    {
      key: 'plan',
      label: 'Deducted from',
      render: (a) => (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {a.recoverFrom ? `${monthLabel(a.recoverFrom)} salary` : 'Next payroll'}
          </Typography>
          <Typography variant="caption" color="textSecondary">
            {a.instalments <= 1 ? 'All at once' : `${formatINR(a.installmentPaise, { decimals: 0 })} × ${a.instalments} months`}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'recovered',
      label: 'Recovered',
      width: 190,
      render: (a) => {
        const pct = Math.round((a.recoveredPaise / a.amountPaise) * 100);
        return (
          <Box sx={{ minWidth: 150 }}>
            <Stack direction="row" sx={{ justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption" sx={{ fontWeight: 600 }}>
                {formatINR(a.recoveredPaise, { decimals: 0 })}
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 600, color: a.balancePaise ? 'error.main' : 'success.main' }}>
                {a.balancePaise ? `${formatINR(a.balancePaise, { decimals: 0 })} left` : 'Done'}
              </Typography>
            </Stack>
            <LinearProgress variant="determinate" value={pct} color={a.balancePaise ? 'warning' : 'success'} sx={{ height: 6, borderRadius: 3 }} />
          </Box>
        );
      },
    },
    { key: 'status', label: 'Status', render: (a) => <Chip size="small" label={a.status === 'open' ? 'Recovering' : 'Closed'} color={a.status === 'open' ? 'warning' : 'default'} variant="outlined" sx={{ height: 22 }} /> },
  ];

  return (
    <>
      <PageHeader
        title="Salary advances"
        subtitle={
          data?.meta ? (
            <>
              Outstanding with staff: <Amount paise={data.meta.outstandingPaise} tone={data.meta.outstandingPaise ? 'due' : 'paid'} decimals={0} /> · recovered automatically from monthly payroll.
            </>
          ) : (
            'Recovered automatically from monthly payroll.'
          )
        }
        actions={
          canGive && (
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setOpen(true)}>
              Give advance
            </Button>
          )
        }
      />
      <DataTable
        columns={[
          ...columns,
          {
            key: 'actions',
            label: 'Action',
            align: 'right',
            width: 130,
            render: (a) => (
              <Stack direction="row" sx={{ justifyContent: 'flex-end', alignItems: 'center' }}>
                <AdvanceActions advance={a} canEdit={canGive} onEdit={setEditAdvance} />
                <ViewButton title="Open employee" name={a.employee.name} onClick={() => navigate(`/hr/employees/${a.employee.id}`)} />
              </Stack>
            ),
          },
        ]}
        rows={data?.items}
        loading={isLoading}
        fetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={{ title: list.filters.status === 'open' ? 'No advances being recovered' : 'No advances', description: 'Advances given to staff appear here with what is still to be recovered.' }}
        pagination={list.pagination(data?.meta)}
        toolbar={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <SearchField value={list.search} onChange={list.setSearch} placeholder="Search advance no. or reason" />
            <TextField select label="Status" value={list.filters.status} onChange={(e) => list.setFilter('status', e.target.value)} slotProps={filterSlots} sx={{ width: { sm: 170 }, flexShrink: 0 }}>
              <MenuItem value="">All</MenuItem>
              <MenuItem value="open">Recovering</MenuItem>
              <MenuItem value="closed">Closed</MenuItem>
            </TextField>
          </Stack>
        }
      />
      <AdvanceDrawer open={open} onClose={() => setOpen(false)} />
      <AdvanceDrawer open={Boolean(editAdvance)} advance={editAdvance} onClose={() => setEditAdvance(null)} />
    </>
  );
}
