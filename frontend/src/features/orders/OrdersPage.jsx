import AddRoundedIcon from '@mui/icons-material/AddRounded';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { Box, Button, Chip, IconButton, Stack, Tab, Tabs, Tooltip, Typography } from '@mui/material';
import { formatINR } from '@jerp/shared';
import { useNavigate } from 'react-router';
import Amount from '../../components/Amount.jsx';
import DataTable from '../../components/DataTable.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import SearchField from '../../components/SearchField.jsx';
import { usePermission, useSession } from '../../hooks/usePermission.js';
import { useListParams } from '../../hooks/useListParams.js';
import { formatDate } from '../../utils/format.js';
import { useOrdersQuery } from './orderApi.js';
import SummaryCards, { SummaryCard } from '../../components/SummaryCards.jsx';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import SavingsOutlinedIcon from '@mui/icons-material/SavingsOutlined';
import { OrderStatusChip } from './orderUi.jsx';

const TABS = [
  { value: 'open', label: 'Open', count: (c) => (c.booked ?? 0) + (c.in_progress ?? 0) + (c.ready ?? 0) },
  { value: 'ready', label: 'Ready to deliver', count: (c) => c.ready ?? 0 },
  { value: 'delivered', label: 'Delivered', count: (c) => c.delivered ?? 0 },
  { value: 'cancelled', label: 'Cancelled', count: (c) => c.cancelled ?? 0 },
  { value: '', label: 'All', count: (c) => Object.values(c).reduce((s, n) => s + n, 0) },
];

export default function OrdersPage() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const canCreate = usePermission('order.create');
  const list = useListParams({ status: 'open' });
  const { data, isLoading, isFetching, error, refetch } = useOrdersQuery(list.params);
  const counts = data?.meta?.counts ?? {};
  const multiBranch = session.branches.length > 1;

  const columns = [
    {
      key: 'orderNo',
      label: 'Order',
      render: (o) => (
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            {o.orderNo}
            {o.priority === 'urgent' && <Chip size="small" color="error" label="Urgent" sx={{ ml: 0.75, height: 18, fontSize: '0.625rem', fontWeight: 700 }} />}
          </Typography>
          <Typography variant="caption" color="textSecondary">
            {formatDate(o.createdAt)}
            {multiBranch && o.branch ? ` · ${o.branch.name}` : ''}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'customer',
      label: 'Customer',
      render: (o) => (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {o.customer.name}
          </Typography>
          <Typography variant="caption" color="textSecondary">
            {o.customer.mobile}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'items',
      label: 'Items',
      render: (o) => (
        <Typography variant="body2" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', maxWidth: 280 }}>
          {o.summary}
        </Typography>
      ),
    },
    {
      key: 'expectedDate',
      label: 'Delivery',
      render: (o) =>
        o.expectedDate ? (
          <Typography variant="body2" sx={{ fontWeight: o.overdue ? 600 : 400, color: o.overdue ? 'error.main' : 'text.primary', whiteSpace: 'nowrap' }}>
            {formatDate(o.expectedDate)}
            {o.overdue && (
              <Typography component="span" variant="caption" sx={{ display: 'block', color: 'error.main' }}>
                Overdue
              </Typography>
            )}
          </Typography>
        ) : (
          <Typography variant="body2" color="textSecondary">
            —
          </Typography>
        ),
    },
    {
      key: 'amount',
      label: 'Paid / Due',
      align: 'right',
      render: (o) => {
        const due = ['booked', 'in_progress', 'ready'].includes(o.status) && o.estimatedPaise > o.advancePaise ? o.estimatedPaise - o.advancePaise : 0;
        return (
          <Box sx={{ whiteSpace: 'nowrap' }}>
            <Amount paise={o.advancePaise} tone="paid" decimals={0} prefix="Paid " sx={{ display: 'block' }} />
            {due > 0 ? (
              <Amount paise={due} tone="due" decimals={0} prefix="Due " variant="caption" sx={{ display: 'block' }} />
            ) : (
              <Typography variant="caption" color="textSecondary">
                {o.estimatedPaise ? `of ${formatINR(o.estimatedPaise, { decimals: 0 })}` : '—'}
              </Typography>
            )}
          </Box>
        );
      },
    },
    { key: 'status', label: 'Status', render: (o) => <OrderStatusChip status={o.status} /> },
    {
      key: 'actions',
      label: 'Action',
      align: 'right',
      width: 56,
      render: (o) => (
        <Tooltip title="View order">
          <IconButton size="small" onClick={() => navigate(`/orders/${o.id}`)} aria-label={`View ${o.orderNo}`}>
            <VisibilityOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Orders"
        subtitle="Custom orders and bookings: what the customer wants, the advance paid, and when it is due."
        actions={
          canCreate && (
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => navigate('/orders/new')}>
              New order
            </Button>
          )
        }
      />
      {data?.meta?.summary && (
        <SummaryCards>
          <SummaryCard icon={AssignmentOutlinedIcon} label="Open orders" value={data.meta.summary.open} caption={data.meta.summary.estimatedPaise ? `Worth about ${formatINR(data.meta.summary.estimatedPaise, { decimals: 0 })}` : 'Being made or waiting'} onClick={() => list.setFilter('status', 'open')} />
          <SummaryCard icon={Inventory2OutlinedIcon} label="Ready to deliver" value={data.meta.summary.ready} caption={data.meta.summary.ready ? 'Call the customer' : 'Nothing ready yet'} tone="green" onClick={() => list.setFilter('status', 'ready')} />
          <SummaryCard icon={EventBusyOutlinedIcon} label="Overdue" value={data.meta.summary.overdue} caption={data.meta.summary.overdue ? 'Past the promised date' : 'All on time'} tone={data.meta.summary.overdue ? 'red' : 'green'} valueTone={data.meta.summary.overdue ? 'due' : undefined} />
          <SummaryCard icon={SavingsOutlinedIcon} label="Advance held" value={formatINR(data.meta.summary.advancePaise, { decimals: 0 })} caption="Taken on open orders" tone="blue" />
        </SummaryCards>
      )}
      <Tabs value={list.filters.status} onChange={(e, v) => list.setFilter('status', v)} variant="scrollable" sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
        {TABS.map((t) => (
          <Tab
            key={t.label}
            value={t.value}
            label={
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <span>{t.label}</span>
                <Box component="span" sx={{ px: 0.75, minWidth: 20, borderRadius: 10, fontSize: '0.6875rem', fontWeight: 700, bgcolor: 'action.selected' }}>
                  {t.count(counts)}
                </Box>
              </Stack>
            }
            sx={{ minHeight: 44 }}
          />
        ))}
      </Tabs>
      <DataTable
        columns={columns}
        rows={data?.items}
        getRowId={(o) => o.id}
        loading={isLoading}
        fetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={list.filtered && list.search ? { title: 'No matching orders' } : { title: 'No orders here', description: canCreate ? 'Book a customer order with New order.' : undefined }}
        pagination={list.pagination(data?.meta)}
        toolbar={<SearchField value={list.search} onChange={list.setSearch} placeholder="Search order no., customer, mobile or item" />}
      />
    </>
  );
}
