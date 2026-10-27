import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { Box, Button, Chip, Typography } from '@mui/material';
import { formatINR } from '@jerp/shared';
import { useNavigate } from 'react-router';
import Amount from '../../components/Amount.jsx';
import DataTable from '../../components/DataTable.jsx';
import RowActions, { actionsWidth } from '../../components/RowActions.jsx';
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
import { useDeleteStatus } from '../../services/recordApi.js';
import ViewTabs from '../../components/ViewTabs.jsx';
import { t } from '../../i18n/index.js';

const TABS = [
  { value: 'open', label: t('Open'), count: (c) => (c.booked ?? 0) + (c.in_progress ?? 0) + (c.ready ?? 0) },
  { value: 'ready', label: t('Ready to deliver'), short: t('Ready'), count: (c) => c.ready ?? 0 },
  { value: 'delivered', label: t('Delivered'), count: (c) => c.delivered ?? 0 },
  { value: 'cancelled', label: t('Cancelled'), count: (c) => c.cancelled ?? 0 },
  { value: '', label: t('All'), count: (c) => Object.values(c).reduce((s, n) => s + n, 0) },
];

export default function OrdersPage() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const canCreate = usePermission('order.create');
  const list = useListParams({ status: 'open' });
  const { data, isLoading, isFetching, error, refetch } = useOrdersQuery(list.params);
  // Which rows can be deleted (Delete stays visible; it is disabled with the reason when not).
  const deleteStatus = useDeleteStatus('order', data?.items);
  const counts = data?.meta?.counts ?? {};
  const multiBranch = session.branches.length > 1;
  const tabs = TABS.map((tab) => ({ value: tab.value, label: tab.label, short: tab.short, count: tab.count(counts) }));

  const columns = [
    {
      key: 'orderNo',
      label: t('Order'),
      render: (o) => (
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            {o.orderNo}
            {o.priority === 'urgent' && <Chip size="small" color="error" label={t('Urgent')} sx={{ ml: 0.75, height: 18, fontSize: '0.625rem', fontWeight: 700 }} />}
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
      label: t('Customer'),
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
      label: t('Items'),
      render: (o) => (
        <Typography variant="body2" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', maxWidth: 280 }}>
          {o.summary}
        </Typography>
      ),
    },
    {
      key: 'expectedDate',
      label: t('Delivery'),
      render: (o) =>
        o.expectedDate ? (
          <Typography variant="body2" sx={{ fontWeight: o.overdue ? 600 : 400, color: o.overdue ? 'error.main' : 'text.primary', whiteSpace: 'nowrap' }}>
            {formatDate(o.expectedDate)}
            {o.overdue && (
              <Typography component="span" variant="caption" sx={{ display: 'block', color: 'error.main' }}>
                {t('Overdue')}
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
      label: t('Paid / Due'),
      align: 'right',
      render: (o) => {
        const due = ['booked', 'in_progress', 'ready'].includes(o.status) && o.estimatedPaise > o.advancePaise ? o.estimatedPaise - o.advancePaise : 0;
        return (
          <Box sx={{ whiteSpace: 'nowrap' }}>
            <Amount paise={o.advancePaise} tone="paid" decimals={0} prefix={t('Paid ')} sx={{ display: 'block' }} />
            {due > 0 ? (
              <Amount paise={due} tone="due" decimals={0} prefix={t('Due ')} variant="caption" sx={{ display: 'block' }} />
            ) : (
              <Typography variant="caption" color="textSecondary">
                {o.estimatedPaise ? t('of {{estimated}}', { estimated: formatINR(o.estimatedPaise, { decimals: 0 }) }) : '—'}
              </Typography>
            )}
          </Box>
        );
      },
    },
    { key: 'status', label: t('Status'), render: (o) => <OrderStatusChip status={o.status} /> },
    {
      key: 'actions',
      label: t('Action'),
      align: 'right',
      width: actionsWidth(2),
      // An order with an advance is cancelled (so the money is settled), not deleted.
      render: (o) => <RowActions onView={() => navigate(`/orders/${o.id}`)} viewTitle={t('View order')} deleteType="order" deleteStatus={deleteStatus(o.id)} id={o.id} name={o.orderNo} />,
    },
  ];

  const summary = data?.meta?.summary;
  return (
    <>
      <PageHeader
        title={t('Orders')}
        subtitle={t('Custom orders and bookings: what the customer wants, the advance paid, and when it is due.')}
        phoneSubtitle={summary ? t('{{open}} open · {{ready}} ready to deliver', { open: summary.open, ready: summary.ready }) : t('Custom orders and bookings')}
        actions={
          canCreate && (
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => navigate('/orders/new')}>
              {t('New order')}
            </Button>
          )
        }
      />
      {data?.meta?.summary && (
        <SummaryCards>
          <SummaryCard icon={AssignmentOutlinedIcon} label={t('Open orders')} value={data.meta.summary.open} caption={data.meta.summary.estimatedPaise ? t('Worth about {{estimated}}', { estimated: formatINR(data.meta.summary.estimatedPaise, { decimals: 0 }) }) : t('Being made or waiting')} onClick={() => list.setFilter('status', 'open')} />
          <SummaryCard icon={Inventory2OutlinedIcon} label={t('Ready to deliver')} value={data.meta.summary.ready} caption={data.meta.summary.ready ? t('Call the customer') : t('Nothing ready yet')} tone="green" onClick={() => list.setFilter('status', 'ready')} />
          <SummaryCard icon={EventBusyOutlinedIcon} label={t('Overdue')} value={data.meta.summary.overdue} caption={data.meta.summary.overdue ? t('Past the promised date') : t('All on time')} tone={data.meta.summary.overdue ? 'red' : 'green'} valueTone={data.meta.summary.overdue ? 'due' : undefined} />
          <SummaryCard icon={SavingsOutlinedIcon} label={t('Advance held')} value={formatINR(data.meta.summary.advancePaise, { decimals: 0 })} caption={t('Taken on open orders')} tone="blue" />
        </SummaryCards>
      )}
      <ViewTabs value={list.filters.status} onChange={(v) => list.setFilter('status', v)} items={tabs} />
      <DataTable
        columns={columns}
        rows={data?.items}
        getRowId={(o) => o.id}
        loading={isLoading}
        fetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={list.filtered && list.search ? { title: t('No matching orders') } : { title: t('No orders here'), description: canCreate ? t('Book a customer order with New order.') : undefined }}
        pagination={list.pagination(data?.meta)}
        toolbar={<SearchField value={list.search} onChange={list.setSearch} placeholder={t('Search order no., customer, mobile or item')} />}
      />
    </>
  );
}
