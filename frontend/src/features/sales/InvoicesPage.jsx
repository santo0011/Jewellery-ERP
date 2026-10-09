import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import TodayOutlinedIcon from '@mui/icons-material/TodayOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { Box, Button, Chip, IconButton, MenuItem, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { formatINR } from '@jerp/shared';
import { useNavigate } from 'react-router';
import Amount, { MONEY_TONE } from '../../components/Amount.jsx';
import DataTable from '../../components/DataTable.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import SearchField from '../../components/SearchField.jsx';
import StatusChip from '../../components/StatusChip.jsx';
import { usePermission } from '../../hooks/usePermission.js';
import { useListParams } from '../../hooks/useListParams.js';
import { formatDateTime } from '../../utils/format.js';
import { paymentLabel } from '../orders/orderUi.jsx';
import { useSalesQuery } from './saleApi.js';
import SummaryCards, { SummaryCard } from '../../components/SummaryCards.jsx';

/** Today, this month, collected and credit owed — the four numbers people check first. */
function SalesCards({ summary }) {
  const bills = (n) => `${n} bill${n === 1 ? '' : 's'}`;
  const inr = (p) => formatINR(p, { decimals: 0 });
  return (
    <SummaryCards>
      <SummaryCard icon={TodayOutlinedIcon} label="Today's sales" value={inr(summary.today.totalPaise)} caption={summary.today.bills ? bills(summary.today.bills) : 'No bills yet today'} />
      <SummaryCard icon={CalendarMonthOutlinedIcon} label="This month" value={inr(summary.month.totalPaise)} caption={`${bills(summary.month.bills)} · avg ${inr(summary.month.averagePaise)}`} tone="blue" />
      <SummaryCard icon={PaymentsOutlinedIcon} label="Collected this month" value={inr(summary.month.collectedPaise)} caption="Cash, card, UPI, bank" tone="green" valueTone="paid" />
      <SummaryCard
        icon={AccountBalanceWalletOutlinedIcon}
        label="Due from customers"
        value={inr(summary.due.totalPaise)}
        caption={summary.due.bills ? `On credit · ${bills(summary.due.bills)}` : 'Nothing on credit'}
        tone={summary.due.totalPaise ? 'red' : 'green'}
        valueTone={summary.due.totalPaise ? 'due' : 'paid'}
      />
    </SummaryCards>
  );
}

export default function InvoicesPage() {
  const navigate = useNavigate();
  const canBill = usePermission('sales.create');
  const list = useListParams({ status: '' });
  const { data, isLoading, isFetching, error, refetch } = useSalesQuery(list.params);

  const columns = [
    {
      key: 'invoiceNo',
      label: 'Invoice',
      render: (s) => (
        <Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
            {s.invoiceNo}
          </Typography>
          <Typography variant="caption" color="textSecondary">
            {formatDateTime(s.createdAt)}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'customer',
      label: 'Customer',
      render: (s) =>
        s.customer ? (
          <Box>
            <Typography variant="body2" sx={{ fontWeight: 500 }}>
              {s.customer.name}
            </Typography>
            <Typography variant="caption" color="textSecondary">
              {s.customer.mobile}
            </Typography>
          </Box>
        ) : (
          <Typography variant="body2" color="textSecondary">
            Walk-in
          </Typography>
        ),
    },
    {
      key: 'items',
      label: 'Items',
      render: (s) => (
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant="body2">{s.itemCount}</Typography>
          {s.orderNo && <Chip size="small" label={s.orderNo} variant="outlined" sx={{ height: 20, fontSize: '0.6875rem' }} />}
          {s.returnedCount > 0 && <Chip size="small" label={`${s.returnedCount} returned`} color="warning" variant="outlined" sx={{ height: 20, fontSize: '0.6875rem' }} />}
        </Stack>
      ),
    },
    { key: 'payment', label: 'Paid by', render: (s) => s.paymentModes.map(paymentLabel).join(', ') || 'Order advance' },
    {
      key: 'total',
      label: 'Total',
      align: 'right',
      render: (s) => (
        <Box sx={{ whiteSpace: 'nowrap' }}>
          <Typography variant="body2" sx={{ fontWeight: 700, textDecoration: s.status === 'cancelled' ? 'line-through' : 'none' }}>
            {formatINR(s.grandTotalPaise)}
          </Typography>
          {s.status === 'completed' &&
            (s.duePaise > 0 ? (
              <Amount paise={s.duePaise} tone="due" prefix="Due " variant="caption" sx={{ display: 'block' }} />
            ) : (
              <Typography variant="caption" sx={{ color: MONEY_TONE.paid, fontWeight: 600 }}>
                Fully paid
              </Typography>
            ))}
        </Box>
      ),
    },
    { key: 'status', label: 'Status', render: (s) => (s.status !== 'completed' ? <StatusChip status="cancelled" label="Cancelled" /> : s.duePaise > 0 ? <StatusChip status="suspended" label="Due" /> : <StatusChip status="active" label="Paid" />) },
    {
      key: 'actions',
      label: 'Action',
      align: 'right',
      width: 56,
      render: (s) => (
        <Tooltip title="View invoice">
          <IconButton size="small" onClick={() => navigate(`/sales/${s.id}`)} aria-label={`View ${s.invoiceNo}`}>
            <VisibilityOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle="Every bill issued from this branch, ready to view or print."
        actions={
          canBill && (
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => navigate('/billing')}>
              New bill
            </Button>
          )
        }
      />
      {data?.meta?.summary && <SalesCards summary={data.meta.summary} />}
      <DataTable
        columns={columns}
        rows={data?.items}
        getRowId={(s) => s.id}
        loading={isLoading}
        fetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={list.filtered ? { title: 'No matching invoices' } : { title: 'No invoices yet', description: canBill ? 'Bills you generate appear here.' : undefined }}
        pagination={list.pagination(data?.meta)}
        toolbar={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <SearchField value={list.search} onChange={list.setSearch} placeholder="Search invoice no., customer, mobile or SKU" />
            <TextField select label="Status" value={list.filters.status} onChange={(e) => list.setFilter('status', e.target.value)} sx={{ maxWidth: { sm: 180 } }}>
              <MenuItem value="">All</MenuItem>
              <MenuItem value="completed">Paid</MenuItem>
              <MenuItem value="cancelled">Cancelled</MenuItem>
            </TextField>
          </Stack>
        }
      />
    </>
  );
}
