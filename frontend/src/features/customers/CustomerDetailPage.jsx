import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import CallReceivedRoundedIcon from '@mui/icons-material/CallReceivedRounded';
import CreditCardOffOutlinedIcon from '@mui/icons-material/CreditCardOffOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';
import { Box, Button, Card, CardContent, Chip, Divider, Grid, Link, Stack, Typography } from '@mui/material';
import CollectDueDialog from './CollectDueDialog.jsx';
import { formatINR, formatWeight, KYC_DOC_TYPES, stateName } from '@jerp/shared';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Link as RouterLink, useNavigate, useParams } from 'react-router';
import Amount, { BalanceAmount, MONEY_TONE } from '../../components/Amount.jsx';
import AuthImage from '../../components/AuthImage.jsx';
import DataTable from '../../components/DataTable.jsx';
import InfoCard from '../../components/InfoCard.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import RecordActions from '../../components/RecordActions.jsx';
import EditHistory from '../../components/EditHistory.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/StateViews.jsx';
import SummaryCards, { SummaryCard } from '../../components/SummaryCards.jsx';
import StatusChip from '../../components/StatusChip.jsx';
import ViewButton from '../../components/ViewButton.jsx';
import { usePermission } from '../../hooks/usePermission.js';
import { useTabParam } from '../../hooks/useListParams.js';
import { fonts, tokens } from '../../theme/tokens.js';
import { formatDate, formatDateTime } from '../../utils/format.js';
import { OrderStatusChip, paymentLabel } from '../orders/orderUi.jsx';
import { purityLabel } from '../products/productForm.js';
import { useCustomerActivityQuery, useCustomerHistoryQuery, useCustomerQuery, useSetCustomerStatusMutation } from './customerApi.js';
import ViewTabs from '../../components/ViewTabs.jsx';
import { t } from '../../i18n/index.js';


export function formatAddress(a = {}) {
  return [a.line1, a.line2, a.city, stateName(a.stateCode), a.pincode].filter(Boolean).join(', ');
}

const initials = (name) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('');

const PAYMENT_KIND = {
  advance: { title: t('Order advance'), icon: CallReceivedRoundedIcon, tone: 'paid' },
  payment: { title: t('Paid on bill'), icon: PaymentsOutlinedIcon, tone: 'paid' },
  refund: { title: t('Advance refunded'), icon: ReplayRoundedIcon, tone: 'due' },
  credit: { title: t('On credit (due)'), icon: CreditCardOffOutlinedIcon, tone: 'due' },
  collection: { title: t('Due collected'), icon: CallReceivedRoundedIcon, tone: 'paid' },
  collection_void: { title: t('Due receipt taken back'), icon: ReplayRoundedIcon, tone: 'due' },
  customer_advance: { title: t('Advance paid'), icon: CallReceivedRoundedIcon, tone: 'paid' },
  customer_advance_refund: { title: t('Advance paid back'), icon: ReplayRoundedIcon, tone: 'due' },
  // Advance paid before, moved onto an order when it was booked (and back if it was cancelled): no new money.
  advance_adjusted: { title: t('Earlier advance adjusted on order'), icon: ReplayRoundedIcon, tone: 'paid' },
  advance_adjusted_back: { title: t('Advance back from cancelled order'), icon: ReplayRoundedIcon, tone: 'paid' },
};

const BILL_STATUS = {
  paid: { label: t('Paid'), color: MONEY_TONE.paid, bg: 'rgba(46, 107, 79, 0.10)' },
  partly_paid: { label: t('Partly paid'), color: MONEY_TONE.due, bg: 'rgba(155, 44, 44, 0.08)' },
  due: { label: t('Unpaid'), color: MONEY_TONE.due, bg: 'rgba(155, 44, 44, 0.08)' },
  cancelled: { label: t('Cancelled'), color: 'text.secondary', bg: 'action.hover' },
};

function BillStatus({ status }) {
  const st = BILL_STATUS[status] ?? BILL_STATUS.due;
  return (
    <Box component="span" sx={{ display: 'inline-block', px: 1, py: 0.25, borderRadius: 999, fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap', color: st.color, bgcolor: st.bg }}>
      {st.label}
    </Box>
  );
}

function PaymentsTimeline({ payments, openingBalance: balance }) {
  const rows = [...payments];
  // Advances paid as money have their own rows; the opening balance row shows only what was carried over.
  const openingBalance = balance + rows.filter((p) => p.kind === 'customer_advance' || p.kind === 'customer_advance_refund').reduce((n, p) => n + p.amountPaise, 0);
  if (!rows.length && !openingBalance) return <EmptyState title={t('No payments yet')} description={t('Advances, bill payments and credit for this customer appear here.')} />;
  return (
    <Card>
      <CardContent>
        <Stack divider={<Divider flexItem />} spacing={1.5}>
          {rows.map((p, n) => {
            const kind = PAYMENT_KIND[p.kind === 'advance_adjusted' && p.amountPaise < 0 ? 'advance_adjusted_back' : p.kind];
            const Icon = kind.icon;
            return (
              <Stack key={n} direction="row" spacing={1.75} sx={{ alignItems: 'center' }}>
                <Box sx={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: kind.tone === 'due' ? 'rgba(155, 44, 44, 0.10)' : 'rgba(46, 107, 79, 0.10)', color: MONEY_TONE[kind.tone] }}>
                  <Icon fontSize="small" />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {kind.title}
                    {p.kind !== 'credit' && (
                      <Typography component="span" variant="body2" color="textSecondary">
                        {' '}
                        · {paymentLabel(p.mode)}
                      </Typography>
                    )}
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    {formatDateTime(p.at)} ·{' '}
                    {p.ref.type === 'receipt' ? (
                      <Box component="span" sx={{ fontWeight: 600 }}>
                        {p.ref.no}
                        {p.ref.bills.length ? t(' · for {{bills}}', { bills: p.ref.bills.join(', ') }) : ''}
                      </Box>
                    ) : (
                      <Link component={RouterLink} to={p.ref.type === 'sale' ? `/sales/${p.ref.id}` : `/orders/${p.ref.id}`} underline="hover" color="inherit" sx={{ fontWeight: 600 }}>
                        {p.ref.type === 'sale' ? p.ref.no : `${p.docNo} · ${p.ref.no}`}
                      </Link>
                    )}
                    {p.reference ? ` · ${p.reference}` : ''}
                  </Typography>
                </Box>
                <Amount paise={Math.abs(p.amountPaise)} tone={kind.tone} prefix={p.kind === 'refund' || p.kind === 'customer_advance_refund' ? '− ' : p.kind === 'credit' || p.kind === 'advance_adjusted' ? '' : '+ '} sx={{ fontSize: '1rem', fontWeight: 700 }} />
              </Stack>
            );
          })}
          {openingBalance ? (
            <Stack direction="row" spacing={1.75} sx={{ alignItems: 'center' }}>
              <Box sx={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: 'action.hover', color: 'text.secondary' }}>
                <ReceiptLongOutlinedIcon fontSize="small" />
              </Box>
              <Box sx={{ flex: 1 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {t('Opening balance')}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  {t('Carried over from before the software')}
                </Typography>
              </Box>
              <BalanceAmount paise={openingBalance} owedLabel={t('due')} advanceLabel={t('advance')} sx={{ fontSize: '1rem', fontWeight: 700 }} />
            </Stack>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function CustomerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [chosenTab, setTab] = useTabParam('bills');
  const canEdit = usePermission('customer.edit');
  const canCollect = usePermission('accounts.receipt');
  const [collecting, setCollecting] = useState(false);
  const history = useCustomerHistoryQuery(id);
  const { data: c, isLoading, error, refetch } = useCustomerQuery(id);
  const { data: activity, isLoading: loadingActivity } = useCustomerActivityQuery(id);
  const [setStatus] = useSetCustomerStatusMutation();

  if (isLoading) return <LoadingState label={t('Loading customer')} />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const balance = c.openingBalancePaise;
  const stats = activity?.stats;
  // Purchases/Orders tabs exist only once loaded and permitted; fall back to Payments otherwise.
  const hidden = (tab2) => ((tab2 === 'bills' || tab2 === 'purchases') && !activity?.purchases) || (tab2 === 'orders' && !activity?.orders);
  const tab = hidden(chosenTab) ? 'payments' : chosenTab;

  const purchaseColumns = [
    {
      key: 'item',
      label: t('Item'),
      render: (p) => (
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <AuthImage fileId={p.imageFileId} alt={p.name} size={44} sx={{ borderRadius: 1.5 }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {p.name}
              {p.returned && <Chip size="small" label={t('Returned')} color="warning" variant="outlined" sx={{ ml: 1, height: 20, fontSize: '0.6875rem' }} />}
            </Typography>
            <Typography variant="caption" color="textSecondary">
              {[p.sku, purityLabel(p.metal, p.purity), p.huid && t('HUID {{huid}}', { huid: p.huid })].filter(Boolean).join(' · ')}
            </Typography>
          </Box>
        </Stack>
      ),
    },
    { key: 'weight', label: t('Weight'), render: (p) => <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>{formatWeight(p.grossWeightMg)}</Typography> },
    {
      key: 'bought',
      label: t('Bought'),
      render: (p) => (
        <Box>
          <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
            {formatDate(p.at)}
          </Typography>
          <Typography variant="caption" color="textSecondary">
            {p.invoiceNo}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'amount',
      label: t('Amount'),
      align: 'right',
      render: (p) => (
        <Box sx={{ whiteSpace: 'nowrap' }}>
          <Typography variant="body2" sx={{ fontWeight: 700, textDecoration: p.returned ? 'line-through' : 'none' }}>
            {formatINR(p.totalPaise)}
          </Typography>
          {p.discountPaise > 0 && (
            <Typography variant="caption" sx={{ color: MONEY_TONE.paid }}>
              {t('{{discount}} off', { discount: formatINR(p.discountPaise, { decimals: 0 }) })}
            </Typography>
          )}
        </Box>
      ),
    },
    { key: 'actions', label: t('Action'), align: 'right', width: 80, render: (p) => <ViewButton title={t('Open invoice')} name={p.invoiceNo} icon={ReceiptLongOutlinedIcon} onClick={() => navigate(`/sales/${p.saleId}`)} /> },
  ];

  // One row per bill: what it came to, what was paid (at billing, from advances and collected later) and what is still due.
  const billColumns = [
    {
      key: 'bill',
      label: t('Bill'),
      render: (b) => (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
            {b.invoiceNo}
          </Typography>
          <Typography variant="caption" color="textSecondary">
            {[formatDate(b.at), (b.itemCount === 1 ? t('{{itemCount}} item', { itemCount: b.itemCount }) : t('{{itemCount}} items', { itemCount: b.itemCount })), b.orderNo].filter(Boolean).join(' · ')}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'total',
      label: t('Bill amount'),
      align: 'right',
      render: (b) => (
        <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: 'nowrap', textDecoration: b.status === 'cancelled' ? 'line-through' : 'none', color: b.status === 'cancelled' ? 'text.secondary' : 'text.primary' }}>
          {formatINR(b.grandTotalPaise)}
        </Typography>
      ),
    },
    {
      key: 'paid',
      label: t('Paid'),
      align: 'right',
      render: (b) =>
        b.status === 'cancelled' ? (
          <Typography variant="body2" color="textSecondary">—</Typography>
        ) : (
          <Box sx={{ whiteSpace: 'nowrap' }}>
            <Amount paise={b.paidPaise} tone="paid" variant="body2" sx={{ fontWeight: 600 }} />
            {b.collectedLaterPaise > 0 && (
              <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>
                {t('incl. {{collectedLater}} collected later', { collectedLater: formatINR(b.collectedLaterPaise, { decimals: 0 }) })}
              </Typography>
            )}
          </Box>
        ),
    },
    {
      key: 'due',
      label: t('Due'),
      align: 'right',
      render: (b) =>
        b.status !== 'cancelled' && b.duePaise > 0 ? (
          <Amount paise={b.duePaise} tone="due" variant="body2" sx={{ fontWeight: 800, whiteSpace: 'nowrap' }} />
        ) : (
          <Typography variant="body2" color="textSecondary">—</Typography>
        ),
    },
    { key: 'status', label: t('Status'), render: (b) => <BillStatus status={b.status === 'cancelled' ? 'cancelled' : b.paymentStatus} /> },
    {
      key: 'actions',
      label: t('Action'),
      align: 'right',
      width: 150,
      render: (b) => (
        <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end', alignItems: 'center' }}>
          {canCollect && b.status !== 'cancelled' && b.duePaise > 0 && (
            <Button size="small" variant="outlined" color="primary" onClick={() => setCollecting(String(b.id))} sx={{ whiteSpace: 'nowrap' }}>
              {t('Collect')}
            </Button>
          )}
          <ViewButton title={t('Open invoice')} name={b.invoiceNo} icon={ReceiptLongOutlinedIcon} onClick={() => navigate(`/sales/${b.id}`)} />
        </Stack>
      ),
    },
  ];

  const orderColumns = [
    {
      key: 'order',
      label: t('Order'),
      render: (o) => (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {o.orderNo}
          </Typography>
          <Typography variant="caption" color="textSecondary">
            {formatDate(o.at)}
          </Typography>
        </Box>
      ),
    },
    { key: 'summary', label: t('Items'), render: (o) => <Typography variant="body2">{o.summary}</Typography> },
    { key: 'advance', label: t('Advance'), align: 'right', render: (o) => <Amount paise={o.advancePaise} tone={o.advancePaise ? 'paid' : undefined} decimals={0} /> },
    { key: 'status', label: t('Status'), render: (o) => <OrderStatusChip status={o.status} /> },
    { key: 'actions', label: t('Action'), align: 'right', width: 80, render: (o) => <ViewButton name={o.orderNo} onClick={() => navigate(`/orders/${o.id}`)} /> },
  ];

  return (
    <>
      <PageHeader
        back={{ to: '/customers', label: t('Customers') }}
        title={
          <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }} component="span">
            <Box component="span" sx={{ width: 52, height: 52, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', background: tokens.sidebar.goldGradient, color: 'var(--brand-contrast)', fontFamily: fonts.display, fontSize: 22, fontWeight: 700, boxShadow: '0 6px 18px rgba(var(--brand-rgb), 0.35)' }}>
              {initials(c.name)}
            </Box>
            <span>{c.name}</span>
          </Stack>
        }
        subtitle={
          <Stack component="span" direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', mt: 0.5 }}>
            <span>
              {c.code} · {c.mobile}
            </span>
            <StatusChip status={c.status} />
            <span>{t('· Customer since {{createdAt}}', { createdAt: formatDate(c.createdAt) })}</span>
          </Stack>
        }
        actions={
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            {canCollect && stats?.duePaise > 0 && (
              <Button variant="contained" startIcon={<PaymentsOutlinedIcon />} onClick={() => setCollecting(true)}>
                {t('Collect payment')}
              </Button>
            )}
            <RecordActions
              name={c.name}
              status={c.status}
              canEdit={canEdit}
              onStatus={async (status) => {
                await setStatus({ id, status }).unwrap();
                toast.success(status === 'active' ? t('Customer activated') : t('Customer deactivated'));
              }}
            />
          </Stack>
        }
      />
      <CollectDueDialog open={Boolean(collecting)} onClose={() => setCollecting(false)} customerId={id} saleId={typeof collecting === 'string' ? collecting : null} />

      {stats && (
        <SummaryCards>
          {stats.purchasesPaise != null && (
            <SummaryCard icon={ReceiptLongOutlinedIcon} label={t('Total purchases')} value={formatINR(stats.purchasesPaise, { decimals: 0 })} caption={(stats.bills === 1 ? (stats.lastPurchaseAt ? t('{{bills}} bill · last {{lastPurchaseAt}}', { bills: stats.bills, lastPurchaseAt: formatDate(stats.lastPurchaseAt) }) : t('{{bills}} bill', { bills: stats.bills })) : (stats.lastPurchaseAt ? t('{{bills}} bills · last {{lastPurchaseAt}}', { bills: stats.bills, lastPurchaseAt: formatDate(stats.lastPurchaseAt) }) : t('{{bills}} bills', { bills: stats.bills })))} />
          )}
          <SummaryCard icon={PaymentsOutlinedIcon} label={t('Paid')} value={formatINR(stats.paidPaise, { decimals: 0 })} caption={stats.advanceLeftPaise ? t('{{advanceLeft}} advance left for next bills', { advanceLeft: formatINR(stats.advanceLeftPaise, { decimals: 0 }) }) : t('Advances and bill payments')} tone="green" valueTone="paid" />
          <SummaryCard
            icon={CreditCardOffOutlinedIcon}
            label={t('Due')}
            value={stats.duePaise ? formatINR(stats.duePaise, { decimals: 0 }) : t('Nil')}
            caption={stats.duePaise ? [stats.creditDuePaise && t('Bills {{creditDue}}', { creditDue: formatINR(stats.creditDuePaise, { decimals: 0 }) }), stats.openingDuePaise && t('Old {{openingDue}}', { openingDue: formatINR(stats.openingDuePaise, { decimals: 0 }) })].filter(Boolean).join(' · ') : t('Nothing owed')}
            tone={stats.duePaise ? 'red' : 'green'}
            valueTone={stats.duePaise ? 'due' : 'paid'}
          />
          {stats.openOrders != null && (
            <SummaryCard icon={AssignmentOutlinedIcon} label={t('Open orders')} value={stats.openOrders} caption={stats.advanceHeldPaise ? t('{{advanceHeld}} advance held', { advanceHeld: formatINR(stats.advanceHeldPaise, { decimals: 0 }) }) : t('No advance held')} tone="blue" />
          )}
        </SummaryCards>
      )}

      <ViewTabs
        value={tab}
        onChange={setTab}
        items={[
          activity?.invoices && { value: 'bills', label: t('Bills'), count: activity.invoices.length },
          activity?.purchases && { value: 'purchases', label: t('Items bought'), short: t('Items'), count: activity.purchases.length },
          { value: 'payments', label: t('Payments'), count: activity?.payments.length ?? 0 },
          activity?.orders && { value: 'orders', label: t('Orders'), count: activity.orders.length },
          { value: 'details', label: t('Details') },
          { value: 'history', label: t('Edit history'), short: t('History'), count: history.data?.length || undefined },
        ]}
      />

      {loadingActivity && tab !== 'details' && tab !== 'history' && <LoadingState />}

      {tab === 'bills' && activity?.invoices && (
        <>
          <DataTable columns={billColumns} rows={activity.invoices} getRowId={(b) => b.id} empty={{ title: t('No bills yet'), description: t('Bills made for this customer appear here with what is paid and what is still due.') }} />
        </>
      )}
      {tab === 'bills' && activity && !activity.invoices && <EmptyState title={t('Bills hidden')} description={t('You need permission to view invoices.')} />}

      {tab === 'purchases' && activity?.purchases && (
        <DataTable columns={purchaseColumns} rows={activity.purchases} getRowId={(p) => `${p.saleId}-${p.productId}`} empty={{ title: t('No purchases yet'), description: t('Items bought by this customer appear here with their invoice.') }} />
      )}
      {tab === 'purchases' && activity && !activity.purchases && <EmptyState title={t('Purchases hidden')} description={t('You need permission to view invoices.')} />}

      {tab === 'payments' && activity && <PaymentsTimeline payments={activity.payments} openingBalance={balance} />}

      {tab === 'orders' && activity?.orders && (
        <DataTable columns={orderColumns} rows={activity.orders} getRowId={(o) => o.id} empty={{ title: t('No orders yet'), description: t('Custom orders booked for this customer appear here.') }} />
      )}

      {tab === 'details' && (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <InfoCard
              title={t('Contact')}
              items={[
                { label: t('Mobile'), value: c.mobile },
                { label: t('Alternate'), value: c.alternateMobile, hidden: !c.alternateMobile },
                { label: t('Email'), value: c.email, hidden: !c.email },
                { label: t('Address'), value: formatAddress(c.address) },
                { label: t('Birthday'), value: c.dob && formatDate(c.dob), hidden: !c.dob },
                { label: t('Anniversary'), value: c.anniversary && formatDate(c.anniversary), hidden: !c.anniversary },
                { label: t('Notes'), value: c.notes, hidden: !c.notes },
              ]}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <InfoCard
              title={t('Account & ID')}
              items={[
                { label: t('Old due'), value: <BalanceAmount paise={balance} owedLabel={t('due')} advanceLabel={t('advance held')} /> },
                { label: t('GSTIN'), value: c.gstin, hidden: !c.gstin },
                { label: t('PAN'), value: c.pan },
                { label: t('ID document'), value: c.kyc.type && `${KYC_DOC_TYPES.find((k) => k.value === c.kyc.type)?.label} · ${c.kyc.number}` },
              ]}
            />
          </Grid>
        </Grid>
      )}

      {tab === 'history' && <EditHistory entries={history.data} isLoading={history.isLoading} error={history.error} showSource={false} />}

    </>
  );
}
