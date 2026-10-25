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
import { t } from '../../i18n/index.js';

/** How a plan was activated, as a short label and its colour. */
const ACTIVATION = {
  online: { label: t('Paid online'), color: 'info' },
  checkout: { label: t('Online checkout'), color: 'default' }, // started on Cashfree, not (yet) paid
  payment: { label: t('Payment received'), color: 'success' },
  complimentary: { label: t('Complimentary'), color: 'secondary' },
  trial: { label: t('Free trial'), color: 'warning' },
  extension: { label: t('Extended'), color: 'default' },
};

/** "Bank transfer · Ref UTR123", "14 days", … — the details under the activation label. */
function activationDetail(p) {
  if (p.activation === 'trial' || p.activation === 'extension') return p.days ? (p.days === 1 ? t('{{days}} day', { days: p.days }) : t('{{days}} days', { days: p.days })) : null;
  if (p.activation === 'complimentary') return t('Free of charge');
  if (p.activation === 'online') return (p.paymentMethod ? t('Cashfree · {{methodLabel}}', { methodLabel: methodLabel(p.paymentMethod) }) : t('Cashfree'));
  return methodLabel(p.paymentMethod);
}

export const paymentColumns = ({ showOrg = true } = {}) => [
  {
    key: 'when',
    label: t('Date'),
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
    ? [{ key: 'org', label: t('Organisation'), render: (p) => <Link component={RouterLink} to={`/admin/organisations/${p.organisation.id}`} underline="hover" sx={{ fontWeight: 600 }}>{p.organisation.name}</Link> }]
    : []),
  { key: 'plan', label: t('Plan'), render: (p) => (p.months ? t('{{name}} · {{months}} mo', { name: p.plan.name, months: p.months }) : p.plan.name) },
  {
    key: 'period',
    label: t('Period'),
    render: (p) => (p.periodStart ? <Typography variant="body2">{formatDate(p.periodStart)} – {formatDate(p.periodEnd)}</Typography> : <Typography variant="body2" color="textSecondary">—</Typography>),
  },
  {
    key: 'method',
    label: t('How activated'),
    // What happened and who did it: "Payment received · Bank transfer · Ref UTR123 · by Asha (Super Admin)".
    render: (p) => {
      // An online checkout that was never completed is not "paid": the Status column says pending / failed.
      const a = p.activation === 'online' && p.status !== 'paid' ? ACTIVATION.checkout : (ACTIVATION[p.activation] ?? ACTIVATION.payment);
      const detail = [activationDetail(p), p.reference && t('Ref {{reference}}', { reference: p.reference })].filter(Boolean).join(' · ');
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
              {[p.activatedBy?.kind === 'admin' && t('by {{name}} (Super Admin)', { name: p.activatedBy.name }), p.note].filter(Boolean).join(' · ')}
            </Typography>
          )}
        </Box>
      );
    },
  },
  { key: 'amount', label: t('Amount'), align: 'right', render: (p) => <Typography variant="body2" sx={{ fontWeight: 700, color: p.amountPaise ? 'text.primary' : 'text.secondary' }}>{p.amountPaise ? inr(p.amountPaise) : '—'}</Typography> },
  // A trial, extension or complimentary activation took no money: it is recorded, not paid.
  { key: 'status', label: t('Status'), render: (p) => (p.status === 'paid' && !p.amountPaise ? <Chip size="small" label={t('Recorded')} variant="outlined" sx={{ height: 22, fontWeight: 600 }} /> : <PaymentStatusChip status={p.status} />) },
];

export default function PaymentsPage() {
  const list = useListParams({ status: '', source: '' });
  const { data, isLoading, isFetching, error, refetch } = usePaymentsQuery(list.params);
  const s = data?.meta?.summary;
  return (
    <>
      <PageHeader title={t('Payments')} subtitle={t('Every subscription payment — online through Cashfree or recorded by you.')} />
      {s && (
        <SummaryCards>
          <SummaryCard icon={AccountBalanceWalletOutlinedIcon} label={t('Total collected')} value={inr(s.revenuePaise)} caption={(s.paidCount === 1 ? t('{{paidCount}} paid payment', { paidCount: s.paidCount }) : t('{{paidCount}} paid payments', { paidCount: s.paidCount }))} tone="green" valueTone="paid" />
          <SummaryCard icon={CreditCardOutlinedIcon} label={t('Online (Cashfree)')} value={inr(s.onlinePaise)} caption={t('Paid by organisations')} tone="blue" onClick={() => list.setFilter('source', 'cashfree')} />
          <SummaryCard icon={ReceiptLongOutlinedIcon} label={t('Recorded manually')} value={inr(s.revenuePaise - s.onlinePaise)} caption={t('Cash / bank, entered by you')} onClick={() => list.setFilter('source', 'manual')} />
        </SummaryCards>
      )}
      <DataTable
        columns={paymentColumns()}
        rows={data?.items}
        loading={isLoading}
        fetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={{ title: t('No payments yet'), description: t('Payments appear here when organisations pay online or you record one.') }}
        pagination={list.pagination(data?.meta)}
        toolbar={
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ alignItems: { md: 'center' } }}>
            <SearchField value={list.search} onChange={list.setSearch} placeholder={t('Search organisation, order or reference')} />
            <ToggleButtonGroup exclusive size="small" value={list.filters.status} onChange={(e, v) => v !== null && list.setFilter('status', v)} sx={{ height: 40, flexShrink: 0 }}>
              <ToggleButton value="">{t('All')}</ToggleButton>
              <ToggleButton value="paid">{t('Paid')}</ToggleButton>
              <ToggleButton value="created">{t('Pending')}</ToggleButton>
              <ToggleButton value="failed">{t('Failed')}</ToggleButton>
            </ToggleButtonGroup>
            <ToggleButtonGroup exclusive size="small" value={list.filters.source} onChange={(e, v) => v !== null && list.setFilter('source', v)} sx={{ height: 40, flexShrink: 0 }}>
              <ToggleButton value="">{t('Any source')}</ToggleButton>
              <ToggleButton value="cashfree">{t('Online')}</ToggleButton>
              <ToggleButton value="manual">{t('Manual')}</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        }
      />
      <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 1 }}>
        {t('Times in your local time · last updated {{formatDateTime}}', { formatDateTime: formatDateTime(new Date()) })}
      </Typography>
    </>
  );
}
