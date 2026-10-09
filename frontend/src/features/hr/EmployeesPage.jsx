import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { Box, Button, Chip, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useState } from 'react';
import { formatINR } from '@jerp/shared';
import { useNavigate } from 'react-router';
import Amount from '../../components/Amount.jsx';
import DataTable from '../../components/DataTable.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import SearchField from '../../components/SearchField.jsx';
import { viewColumn } from '../../components/ViewButton.jsx';
import { useListParams } from '../../hooks/useListParams.js';
import { usePermission, useSession } from '../../hooks/usePermission.js';
import EmployeeFormDrawer from './EmployeeFormDrawer.jsx';
import { EmployeeAvatar } from './EmployeePhoto.jsx';
import { useEmployeeListQuery } from './hrApi.js';
import SummaryCards, { SummaryCard } from '../../components/SummaryCards.jsx';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import RequestQuoteOutlinedIcon from '@mui/icons-material/RequestQuoteOutlined';
import PersonOffOutlinedIcon from '@mui/icons-material/PersonOffOutlined';

const filterSlots = { inputLabel: { shrink: true }, select: { displayEmpty: true } };

export default function EmployeesPage() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const canCreate = usePermission('employee.create');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const list = useListParams({ status: 'active', branchId: '' });
  const { data, isLoading, isFetching, error, refetch } = useEmployeeListQuery(list.params);
  const multiBranch = session.branches.length > 1;
  const payVisible = data?.items?.[0]?.payVisible ?? false;

  const columns = [
    {
      key: 'name',
      label: 'Employee',
      render: (e) => (
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <EmployeeAvatar employee={e} size={40} />
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
              <Typography variant="subtitle2">{e.name}</Typography>
              {e.status === 'left' && <Chip size="small" label="Left" variant="outlined" sx={{ height: 18, fontSize: '0.6875rem' }} />}
            </Stack>
            <Typography variant="body2" color="textSecondary">
              {e.designation} · {e.code}
            </Typography>
          </Box>
        </Stack>
      ),
    },
    { key: 'mobile', label: 'Mobile', render: (e) => e.mobile },
    ...(multiBranch ? [{ key: 'branch', label: 'Branch', render: (e) => e.branch?.name ?? '—' }] : []),
    ...(payVisible
      ? [
          { key: 'salary', label: 'Salary / month', align: 'right', render: (e) => <Amount paise={e.grossPaise} decimals={0} /> },
          {
            key: 'advance',
            label: 'Advance due',
            align: 'right',
            render: (e) => (e.advanceBalancePaise ? <Amount paise={e.advanceBalancePaise} tone="due" decimals={0} /> : <Typography variant="body2" color="textSecondary">—</Typography>),
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Employees"
        subtitle={data?.meta ? `${data.meta.total} ${list.filters.status === 'left' ? 'former' : list.filters.status === 'active' ? 'working' : ''} staff`.replace('  ', ' ') : 'Your staff'}
        actions={
          canCreate && (
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setDrawerOpen(true)}>
              New employee
            </Button>
          )
        }
      />
      {data?.meta?.summary && (
        <SummaryCards>
          <SummaryCard icon={BadgeOutlinedIcon} label="Working staff" value={data.meta.summary.working} caption="Currently on the rolls" onClick={() => list.setFilter('status', 'active')} />
          {data.meta.summary.salaryPaise !== undefined && <SummaryCard icon={PaymentsOutlinedIcon} label="Monthly salary bill" value={formatINR(data.meta.summary.salaryPaise, { decimals: 0 })} caption="Gross, before deductions" tone="blue" />}
          {data.meta.summary.advancePaise !== undefined && (
            <SummaryCard
              icon={RequestQuoteOutlinedIcon}
              label="Advances due"
              value={formatINR(data.meta.summary.advancePaise, { decimals: 0 })}
              caption={data.meta.summary.advancePeople ? `With ${data.meta.summary.advancePeople} staff` : 'Nothing outstanding'}
              tone={data.meta.summary.advancePaise ? 'red' : 'green'}
              valueTone={data.meta.summary.advancePaise ? 'due' : 'paid'}
              onClick={() => navigate('/hr/advances')}
            />
          )}
          <SummaryCard icon={PersonOffOutlinedIcon} label="Left" value={data.meta.summary.left} caption="Former staff" tone="grey" onClick={() => list.setFilter('status', 'left')} />
        </SummaryCards>
      )}
      <DataTable
        columns={[...columns, viewColumn((e) => navigate(`/hr/employees/${e.id}`), { name: (e) => e.name })]}
        rows={data?.items}
        loading={isLoading}
        fetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={list.filtered && list.search ? { title: 'No matching employees', description: 'Try another name, mobile or code.' } : { title: 'No employees yet', description: 'Add your staff to start marking attendance and running payroll.' }}
        pagination={list.pagination(data?.meta)}
        toolbar={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <SearchField value={list.search} onChange={list.setSearch} placeholder="Search name, mobile, code or designation" />
            {multiBranch && (
              <TextField select label="Branch" value={list.filters.branchId} onChange={(e) => list.setFilter('branchId', e.target.value)} slotProps={filterSlots} sx={{ width: { sm: 190 }, flexShrink: 0 }}>
                <MenuItem value="">All branches</MenuItem>
                {session.branches.map((b) => (
                  <MenuItem key={b.id} value={b.id}>
                    {b.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <ToggleButtonGroup exclusive size="small" value={list.filters.status} onChange={(e, v) => v !== null && list.setFilter('status', v)} aria-label="Show" sx={{ flexShrink: 0, height: 40 }}>
              <ToggleButton value="active">Working</ToggleButton>
              <ToggleButton value="left">Left</ToggleButton>
              <ToggleButton value="">All</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        }
      />
      <EmployeeFormDrawer open={drawerOpen} employee={null} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
