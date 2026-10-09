import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { Box, Button, Chip, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { formatINR } from '@jerp/shared';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import Amount from '../../components/Amount.jsx';
import DataTable from '../../components/DataTable.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import SearchField from '../../components/SearchField.jsx';
import { viewColumn } from '../../components/ViewButton.jsx';
import { useListParams } from '../../hooks/useListParams.js';
import { usePermission } from '../../hooks/usePermission.js';
import { formatDate } from '../../utils/format.js';
import AdvanceDrawer from './AdvanceDrawer.jsx';
import { useAdvanceListQuery } from './hrApi.js';
import { payModeLabel } from './hrUi.jsx';

const filterSlots = { inputLabel: { shrink: true }, select: { displayEmpty: true } };

export default function AdvancesPage() {
  const navigate = useNavigate();
  const canGive = usePermission('payroll.process');
  const [open, setOpen] = useState(false);
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
            {a.advanceNo} · {formatDate(a.businessDate)} · {payModeLabel(a.mode)}
          </Typography>
        </Box>
      ),
    },
    { key: 'amount', label: 'Given', align: 'right', render: (a) => <Amount paise={a.amountPaise} decimals={0} /> },
    { key: 'inst', label: 'Per month', align: 'right', render: (a) => formatINR(a.installmentPaise, { decimals: 0 }) },
    { key: 'balance', label: 'Balance', align: 'right', render: (a) => (a.balancePaise ? <Amount paise={a.balancePaise} tone="due" decimals={0} /> : <Amount paise={0} tone="paid" decimals={0} suffix=" · recovered" />) },
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
        columns={[...columns, viewColumn((a) => navigate(`/hr/employees/${a.employee.id}`), { title: 'Open employee', name: (a) => a.employee.name })]}
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
    </>
  );
}
