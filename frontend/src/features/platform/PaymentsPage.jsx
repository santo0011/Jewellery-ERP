import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import CreditCardOutlinedIcon from '@mui/icons-material/CreditCardOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import { Box, Chip, Link, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router';
import DataTable from '../../components/DataTable.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import SearchField from '../../components/SearchField.jsx';
import SummaryCards, { SummaryCard } from '../../components/SummaryCards.jsx';
import { useListParams } from '../../hooks/useListParams.js';
import { formatDate, formatDateTime } from '../../utils/format.js';
import { inr, methodLabel, PaymentStatusChip } from '../billing/billingUi.jsx';
import { usePaymentsQuery } from './platformApi.js';

/** How a plan was activated, as a short label and its colour. */
const ACTIVATION = {
  online: { label: 'Paid online', color: 'info' },
  checkout: { label: 'Online checkout', color: 'default' }, // started on Cashfree, not (yet) paid
  payment: { label: 'Payment received', color: 'success' },
  complimentary: { label: 'Complimentary', color: 'secondary' },
  trial: { label: 'Free trial', color: 'warning' },
  extension: { label: 'Extended', color: 'default' },
};

/** "Bank transfer · Ref UTR123", "14 days", … — the details under the activation label. */
function activationDetail(p) {
  if (p.activation === 'trial' || p.activation === 'extension') return p.days ? `${p.days} day${p.days === 1 ? '' : 's'}` : null;
  if (p.activation === 'complimentary') return 'Free of charge';
  if (p.activation === 'online') return `Cashfree${p.paymentMethod ? ` · ${methodLabel(p.paymentMethod)}` : ''}`;
  return methodLabel(p.paymentMethod);
}

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
  { key: 'plan', label: 'Plan', render: (p) => (p.months ? `${p.plan.name} · ${p.months} mo` : p.plan.name) },
  {
    key: 'period',
    label: 'Period',
    render: (p) => (p.periodStart ? <Typography variant="body2">{formatDate(p.periodStart)} – {formatDate(p.periodEnd)}</Typography> : <Typography variant="body2" color="textSecondary">—</Typography>),
  },
  {
    key: 'method',
    label: 'How activated',
    // What happened and who did it: "Payment received · Bank transfer · Ref UTR123 · by Asha (Super Admin)".
    render: (p) => {
      // An online checkout that was never completed is not "paid": the Status column says pending / failed.
      const a = p.activation === 'online' && p.status !== 'paid' ? ACTIVATION.checkout : (ACTIVATION[p.activation] ?? ACTIVATION.payment);
      const detail = [activationDetail(p), p.reference && `Ref ${p.reference}`].filter(Boolean).join(' · ');
      return (
        <Box sx={{ minWidth: 0 }}>
          <Chip size="small" label={a.label} color={a.color} variant={p.activation === 'extension' ? 'outlined' : 'filled'} sx={{ height: 22, fontWeight: 600 }} />
          {detail && (
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              {detail}
            </Typography>
          )}
          {(p.activatedBy?.kind === 'admin' || p.note) && (
            <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>
              {[p.activatedBy?.kind === 'admin' && `by ${p.activatedBy.name} (Super Admin)`, p.note].filter(Boolean).join(' · ')}
            </Typography>
          )}
        </Box>
      );
    },
  },
  { key: 'amount', label: 'Amount', align: 'right', render: (p) => <Typography variant="body2" sx={{ fontWeight: 700, color: p.amountPaise ? 'text.primary' : 'text.secondary' }}>{p.amountPaise ? inr(p.amountPaise) : '—'}</Typography> },
  // A trial, extension or complimentary activation took no money: it is recorded, not paid.
  { key: 'status', label: 'Status', render: (p) => (p.status === 'paid' && !p.amountPaise ? <Chip size="small" label="Recorded" variant="outlined" sx={{ height: 22, fontWeight: 600 }} /> : <PaymentStatusChip status={p.status} />) },
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
