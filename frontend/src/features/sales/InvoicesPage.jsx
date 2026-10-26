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
import DisabledDelete from '../../components/DisabledDelete.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import SearchField from '../../components/SearchField.jsx';
import StatusChip from '../../components/StatusChip.jsx';
import { usePermission } from '../../hooks/usePermission.js';
import { useListParams } from '../../hooks/useListParams.js';
import { formatDateTime } from '../../utils/format.js';
import { useSalesQuery } from './saleApi.js';
import SummaryCards, { SummaryCard } from '../../components/SummaryCards.jsx';
import { t } from '../../i18n/index.js';

/** Today, this month, collected and credit owed — the four numbers people check first. */
function SalesCards({ summary }) {
  const bills = (n) => (n === 1 ? t('{{n}} bill', { n }) : t('{{n}} bills', { n }));
  const inr = (p) => formatINR(p, { decimals: 0 });
  return (
    <SummaryCards>
      <SummaryCard icon={TodayOutlinedIcon} label={t('Today\'s sales')} value={inr(summary.today.totalPaise)} caption={summary.today.bills ? bills(summary.today.bills) : t('No bills yet today')} />
      <SummaryCard icon={CalendarMonthOutlinedIcon} label={t('This month')} value={inr(summary.month.totalPaise)} caption={t('{{bills}} · avg {{inr}}', { bills: bills(summary.month.bills), inr: inr(summary.month.averagePaise) })} tone="blue" />
      <SummaryCard icon={PaymentsOutlinedIcon} label={t('Collected this month')} value={inr(summary.month.collectedPaise)} caption={t('Cash, card, UPI, bank')} tone="green" valueTone="paid" />
      <SummaryCard
        icon={AccountBalanceWalletOutlinedIcon}
        label={t('Due from customers')}
        value={inr(summary.due.totalPaise)}
        caption={summary.due.bills ? t('On credit · {{bills}}', { bills: bills(summary.due.bills) }) : t('Nothing on credit')}
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
      label: t('Invoice'),
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
      label: t('Customer'),
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
            {t('Walk-in')}
          </Typography>
        ),
    },
    {
      key: 'items',
      label: t('Items'),
      render: (s) => (
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Typography variant="body2">{s.itemCount}</Typography>
          {s.orderNo && <Chip size="small" label={s.orderNo} variant="outlined" sx={{ height: 20, fontSize: '0.6875rem' }} />}
          {s.returnedCount > 0 && <Chip size="small" label={t('{{returnedCount}} returned', { returnedCount: s.returnedCount })} color="warning" variant="outlined" sx={{ height: 20, fontSize: '0.6875rem' }} />}
        </Stack>
      ),
    },
    {
      key: 'total',
      label: t('Total'),
      align: 'right',
      render: (s) => (
        <Box sx={{ whiteSpace: 'nowrap' }}>
          <Typography variant="body2" sx={{ fontWeight: 700, textDecoration: s.status === 'cancelled' ? 'line-through' : 'none' }}>
            {formatINR(s.grandTotalPaise)}
          </Typography>
          {s.status === 'completed' &&
            (s.duePaise > 0 ? (
              <Amount paise={s.duePaise} tone="due" prefix={t('Due ')} variant="caption" sx={{ display: 'block' }} />
            ) : (
              <Typography variant="caption" sx={{ color: MONEY_TONE.paid, fontWeight: 600 }}>
                {t('Fully paid')}
              </Typography>
            ))}
        </Box>
      ),
    },
    { key: 'status', label: t('Status'), render: (s) => (s.status !== 'completed' ? <StatusChip status="cancelled" label={t('Cancelled')} /> : s.paymentStatus === 'partly_paid' ? <StatusChip status="past_due" label={t('Partly paid')} /> : s.duePaise > 0 ? <StatusChip status="suspended" label={t('Due')} /> : <StatusChip status="active" label={t('Paid')} />) },
    {
      key: 'actions',
      label: t('Action'),
      align: 'right',
      width: 96,
      render: (s) => (
        <Stack direction="row" spacing={0.25} sx={{ justifyContent: 'flex-end' }}>
          <Tooltip title={t('View invoice')}>
            <IconButton size="small" onClick={() => navigate(`/sales/${s.id}`)} aria-label={t('View {{invoiceNo}}', { invoiceNo: s.invoiceNo })}>
              <VisibilityOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <DisabledDelete reason={t('Invoices are GST records and cannot be deleted. Cancel the bill or take a sales return instead.')} />
        </Stack>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t('Invoices')}
        subtitle={t('Every bill issued from this branch, ready to view or print.')}
        actions={
          canBill && (
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => navigate('/billing')}>
              {t('New bill')}
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
        empty={list.filtered ? { title: t('No matching invoices') } : { title: t('No invoices yet'), description: canBill ? t('Bills you generate appear here.') : undefined }}
        pagination={list.pagination(data?.meta)}
        toolbar={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <SearchField value={list.search} onChange={list.setSearch} placeholder={t('Search invoice no., customer, mobile or SKU')} />
            <TextField select slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }} label={t('Status')} value={list.filters.status} onChange={(e) => list.setFilter('status', e.target.value)} sx={{ maxWidth: { sm: 180 } }}>
              <MenuItem value="">{t('All')}</MenuItem>
              <MenuItem value="completed">{t('Paid')}</MenuItem>
              <MenuItem value="cancelled">{t('Cancelled')}</MenuItem>
            </TextField>
          </Stack>
        }
      />
    </>
  );
}
