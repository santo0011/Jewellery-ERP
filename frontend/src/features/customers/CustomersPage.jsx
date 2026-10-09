import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { Box, Button, Chip, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { CUSTOMER_SEGMENTS, formatINR, stateName } from '@jerp/shared';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import DataTable from '../../components/DataTable.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import SearchField from '../../components/SearchField.jsx';
import StatusChip from '../../components/StatusChip.jsx';
import { useListParams } from '../../hooks/useListParams.js';
import { usePermission } from '../../hooks/usePermission.js';
import CustomerFormDrawer from './CustomerFormDrawer.jsx';
import { useCustomerListQuery } from './customerApi.js';
import { viewColumn } from '../../components/ViewButton.jsx';
import Amount from '../../components/Amount.jsx';

export const segmentLabel = (v) => CUSTOMER_SEGMENTS.find((s) => s.value === v)?.label ?? v;
const SEGMENT_COLORS = { vip: 'primary', high_value: 'accent', inactive: 'default', regular: 'default', new: 'info' };

export function SegmentChip({ segment }) {
  return <Chip size="small" label={segmentLabel(segment)} color={SEGMENT_COLORS[segment] ?? 'default'} variant="outlined" sx={{ height: 22 }} />;
}

// Filters always show their label on top and a value, so picking one does not shift the layout.
const filterSlots = { inputLabel: { shrink: true }, select: { displayEmpty: true } };

export default function CustomersPage() {
  const navigate = useNavigate();
  const canCreate = usePermission('customer.create');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const list = useListParams({ due: '', status: '' });
  const { data, isLoading, isFetching, error, refetch } = useCustomerListQuery(list.params);

  const columns = [
    {
      key: 'name',
      label: 'Customer',
      render: (c) => (
        <Box>
          <Typography variant="subtitle2">{c.name}</Typography>
          <Typography variant="body2" color="textSecondary">
            {c.code}
          </Typography>
        </Box>
      ),
    },
    { key: 'mobile', label: 'Mobile', render: (c) => c.mobile },
    { key: 'city', label: 'City', render: (c) => [c.address?.city, stateName(c.address?.stateCode)].filter(Boolean).join(', ') || '—' },
    {
      key: 'due',
      label: 'Due',
      align: 'right',
      render: (c) => {
        const oldDue = Math.max(0, c.openingBalancePaise ?? 0);
        if (c.duePaise > 0)
          return (
            <Box>
              <Amount paise={c.duePaise} tone="due" decimals={0} />
              {oldDue > 0 && (
                <Typography variant="caption" color="textSecondary" sx={{ display: 'block', whiteSpace: 'nowrap' }}>
                  {c.creditDuePaise > 0 ? `incl. ${formatINR(oldDue, { decimals: 0 })} old due` : 'old due'}
                </Typography>
              )}
            </Box>
          );
        if (c.openingBalancePaise < 0) return <Amount paise={-c.openingBalancePaise} tone="paid" decimals={0} suffix=" advance" />;
        return (
          <Typography variant="body2" color="textSecondary">
            Nil
          </Typography>
        );
      },
    },
    { key: 'status', label: 'Status', render: (c) => <StatusChip status={c.status} /> },
  ];

  return (
    <>
      <PageHeader
        title="Customers"
        subtitle="Your customers, their contact details and what they owe."
        actions={
          canCreate && (
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setDrawerOpen(true)}>
              New customer
            </Button>
          )
        }
      />
      <DataTable
        columns={[...columns, viewColumn((c) => navigate(`/customers/${c.id}`), { name: (c) => c.name })]}
        rows={data?.items}
        loading={isLoading}
        fetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={
          list.filtered
            ? { title: 'No matching customers', description: 'Try another name, mobile or filter.' }
            : { title: 'No customers yet', description: 'Add your first customer to start building purchase history.' }
        }
        pagination={list.pagination(data?.meta)}
        toolbar={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <SearchField value={list.search} onChange={list.setSearch} placeholder="Search name, mobile or code" />
            <TextField select label="Due" value={list.filters.due} onChange={(e) => list.setFilter('due', e.target.value)} slotProps={filterSlots} sx={{ width: { sm: 200 }, flexShrink: 0 }}>
              <MenuItem value="">All customers</MenuItem>
              <MenuItem value="due">Has due</MenuItem>
              <MenuItem value="clear">No due</MenuItem>
            </TextField>
            <TextField select label="Status" value={list.filters.status} onChange={(e) => list.setFilter('status', e.target.value)} slotProps={filterSlots} sx={{ width: { sm: 150 }, flexShrink: 0 }}>
              <MenuItem value="">All statuses</MenuItem>
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="inactive">Inactive</MenuItem>
            </TextField>
          </Stack>
        }
      />
      <CustomerFormDrawer open={drawerOpen} customer={null} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
