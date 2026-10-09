import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import Amount from '../../components/Amount.jsx';
import DataTable from '../../components/DataTable.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import SearchField from '../../components/SearchField.jsx';
import { viewColumn } from '../../components/ViewButton.jsx';
import { useListParams } from '../../hooks/useListParams.js';
import { usePermission, useSession } from '../../hooks/usePermission.js';
import EmployeeFormDrawer from './EmployeeFormDrawer.jsx';
import { useEmployeeListQuery } from './hrApi.js';
import { EmploymentChip } from './hrUi.jsx';

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
        <Box>
          <Typography variant="subtitle2">{e.name}</Typography>
          <Typography variant="body2" color="textSecondary">
            {e.code} · {e.designation}
          </Typography>
        </Box>
      ),
    },
    { key: 'mobile', label: 'Mobile', render: (e) => e.mobile },
    ...(multiBranch ? [{ key: 'branch', label: 'Branch', render: (e) => e.branch?.name ?? '—' }] : []),
    ...(payVisible
      ? [
          { key: 'salary', label: 'Monthly salary', align: 'right', render: (e) => <Amount paise={e.grossPaise} decimals={0} /> },
          {
            key: 'advance',
            label: 'Advance due',
            align: 'right',
            render: (e) => (e.advanceBalancePaise ? <Amount paise={e.advanceBalancePaise} tone="due" decimals={0} /> : <Typography variant="body2" color="textSecondary">Nil</Typography>),
          },
        ]
      : []),
    { key: 'status', label: 'Status', render: (e) => <EmploymentChip status={e.status} /> },
  ];

  return (
    <>
      <PageHeader
        title="Employees"
        subtitle="Staff profiles, salaries and bank details."
        actions={
          canCreate && (
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setDrawerOpen(true)}>
              New employee
            </Button>
          )
        }
      />
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
            <TextField select label="Status" value={list.filters.status} onChange={(e) => list.setFilter('status', e.target.value)} slotProps={filterSlots} sx={{ width: { sm: 150 }, flexShrink: 0 }}>
              <MenuItem value="">All</MenuItem>
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="left">Left</MenuItem>
            </TextField>
          </Stack>
        }
      />
      <EmployeeFormDrawer open={drawerOpen} employee={null} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
