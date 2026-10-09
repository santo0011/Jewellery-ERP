import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import CreditCardOutlinedIcon from '@mui/icons-material/CreditCardOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import { Box, Link, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router';
import DataTable from '../../components/DataTable.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import SearchField from '../../components/SearchField.jsx';
import SummaryCards, { SummaryCard } from '../../components/SummaryCards.jsx';
import { useListParams } from '../../hooks/useListParams.js';
import { formatDate, formatDateTime } from '../../utils/format.js';
import { inr, methodLabel, PaymentStatusChip } from '../billing/billingUi.jsx';
import { usePaymentsQuery } from './platformApi.js';

export const paymentColumns = ({ showOrg = true } = {}) => [
  {
    key: 'when',
    label: 'Date',
    render: (p) => (
      <Box>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {formatDate(p.paidAt ?? p.createdAt)}
        </Typography>
        <Typography variant="caption" color="textSecondary">
          {p.orderId}
        </Typography>
      </Box>
    ),
  },
  ...(showOrg
    ? [{ key: 'org', label: 'Organisation', render: (p) => <Link component={RouterLink} to={`/admin/organisations/${p.organisation.id}`} underline="hover" sx={{ fontWeight: 600 }}>{p.organisation.name}</Link> }]
    : []),
  { key: 'plan', label: 'Plan', render: (p) => `${p.plan.name} · ${p.months} mo` },
  {
    key: 'period',
    label: 'Period',
    render: (p) => (p.periodStart ? <Typography variant="body2">{formatDate(p.periodStart)} – {formatDate(p.periodEnd)}</Typography> : <Typography variant="body2" color="textSecondary">—</Typography>),
  },
  {
    key: 'method',
    label: 'Paid by',
    render: (p) => (
      <Box>
        <Typography variant="body2">{p.source === 'manual' ? `Manual · ${methodLabel(p.paymentMethod)}` : `Cashfree${p.paymentMethod ? ` · ${methodLabel(p.paymentMethod)}` : ''}`}</Typography>
        {p.reference && (
          <Typography variant="caption" color="textSecondary">
            Ref {p.reference}
          </Typography>
        )}
      </Box>
    ),
  },
  { key: 'amount', label: 'Amount', align: 'right', render: (p) => <Typography variant="body2" sx={{ fontWeight: 700 }}>{inr(p.amountPaise)}</Typography> },
  { key: 'status', label: 'Status', render: (p) => <PaymentStatusChip status={p.status} /> },
];

export default function PaymentsPage() {
  const list = useListParams({ status: '', source: '' });
  const { data, isLoading, isFetching, error, refetch } = usePaymentsQuery(list.params);
  const s = data?.meta?.summary;
  return (
    <>
      <PageHeader title="Payments" subtitle="Every subscription payment — online through Cashfree or recorded by you." />
      {s && (
        <SummaryCards>
          <SummaryCard icon={AccountBalanceWalletOutlinedIcon} label="Total collected" value={inr(s.revenuePaise)} caption={`${s.paidCount} paid payment${s.paidCount === 1 ? '' : 's'}`} tone="green" valueTone="paid" />
          <SummaryCard icon={CreditCardOutlinedIcon} label="Online (Cashfree)" value={inr(s.onlinePaise)} caption="Paid by organisations" tone="blue" onClick={() => list.setFilter('source', 'cashfree')} />
          <SummaryCard icon={ReceiptLongOutlinedIcon} label="Recorded manually" value={inr(s.revenuePaise - s.onlinePaise)} caption="Cash / bank, entered by you" onClick={() => list.setFilter('source', 'manual')} />
        </SummaryCards>
      )}
      <DataTable
        columns={paymentColumns()}
        rows={data?.items}
        loading={isLoading}
        fetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={{ title: 'No payments yet', description: 'Payments appear here when organisations pay online or you record one.' }}
        pagination={list.pagination(data?.meta)}
        toolbar={
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ alignItems: { md: 'center' } }}>
            <SearchField value={list.search} onChange={list.setSearch} placeholder="Search organisation, order or reference" />
            <ToggleButtonGroup exclusive size="small" value={list.filters.status} onChange={(e, v) => v !== null && list.setFilter('status', v)} sx={{ height: 40, flexShrink: 0 }}>
              <ToggleButton value="">All</ToggleButton>
              <ToggleButton value="paid">Paid</ToggleButton>
              <ToggleButton value="created">Pending</ToggleButton>
              <ToggleButton value="failed">Failed</ToggleButton>
            </ToggleButtonGroup>
            <ToggleButtonGroup exclusive size="small" value={list.filters.source} onChange={(e, v) => v !== null && list.setFilter('source', v)} sx={{ height: 40, flexShrink: 0 }}>
              <ToggleButton value="">Any source</ToggleButton>
              <ToggleButton value="cashfree">Online</ToggleButton>
              <ToggleButton value="manual">Manual</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        }
      />
      <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 1 }}>
        Times in your local time · last updated {formatDateTime(new Date())}
      </Typography>
    </>
  );
}
