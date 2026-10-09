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
import SummaryCards, { SummaryCard } from '../../components/SummaryCards.jsx';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import NotificationsActiveOutlinedIcon from '@mui/icons-material/NotificationsActiveOutlined';
import { viewColumn } from '../../components/ViewButton.jsx';

export const segmentLabel = (v) => CUSTOMER_SEGMENTS.find((s) => s.value === v)?.label ?? v;
const SEGMENT_COLORS = { vip: 'primary', high_value: 'accent', inactive: 'default', regular: 'default', new: 'info' };

export function SegmentChip({ segment }) {
  return <Chip size="small" label={segmentLabel(segment)} color={SEGMENT_COLORS[segment] ?? 'default'} variant="outlined" sx={{ height: 22 }} />;
}

const PAYMENT_STATUS = {
  due: { label: 'Due', color: 'error' },
  partly_paid: { label: 'Partly paid', color: 'warning' },
  paid: { label: 'Paid', color: 'success' },
};

/** Red = owes and has paid nothing, amber = owes part, green = fully paid; customers without bills show a dash. */
function PaymentChip({ status }) {
  const s = PAYMENT_STATUS[status];
  if (!s) {
    return (
      <Typography variant="body2" color="textSecondary">
        —
      </Typography>
    );
  }
  return <Chip size="small" label={s.label} color={s.color} variant="filled" sx={{ height: 22, fontSize: '0.75rem', fontWeight: 600 }} />;
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
    { key: 'payment', label: 'Payment', render: (c) => <PaymentChip status={c.paymentStatus} /> },
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
      {data?.meta?.summary && (
        <SummaryCards>
          <SummaryCard icon={PeopleAltOutlinedIcon} label="Customers" value={data.meta.summary.total} caption="On your books" />
          <SummaryCard icon={PersonAddAltOutlinedIcon} label="New this month" value={data.meta.summary.newThisMonth} caption="Added since the 1st" tone="blue" />
          <SummaryCard icon={AccountBalanceWalletOutlinedIcon} label="Due from customers" value={formatINR(data.meta.summary.duePaise, { decimals: 0 })} caption="Credit on bills + old dues" tone={data.meta.summary.duePaise ? 'red' : 'green'} valueTone={data.meta.summary.duePaise ? 'due' : 'paid'} />
          <SummaryCard icon={NotificationsActiveOutlinedIcon} label="Customers with dues" value={data.meta.summary.owing} caption={data.meta.summary.owing ? 'Tap to see who owes' : 'Nobody owes'} tone={data.meta.summary.owing ? 'amber' : 'green'} onClick={data.meta.summary.owing ? () => list.setFilter('due', 'due') : undefined} />
        </SummaryCards>
      )}
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
