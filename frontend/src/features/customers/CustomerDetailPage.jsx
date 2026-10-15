import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import CallReceivedRoundedIcon from '@mui/icons-material/CallReceivedRounded';
import CreditCardOffOutlinedIcon from '@mui/icons-material/CreditCardOffOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';
import { Box, Button, Card, CardContent, Chip, Divider, Grid, Link, Stack, Tab, Tabs, Typography } from '@mui/material';
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
  advance: { title: 'Order advance', icon: CallReceivedRoundedIcon, tone: 'paid' },
  payment: { title: 'Paid on bill', icon: PaymentsOutlinedIcon, tone: 'paid' },
  refund: { title: 'Advance refunded', icon: ReplayRoundedIcon, tone: 'due' },
  credit: { title: 'On credit (due)', icon: CreditCardOffOutlinedIcon, tone: 'due' },
  collection: { title: 'Due collected', icon: CallReceivedRoundedIcon, tone: 'paid' },
};

const BILL_STATUS = {
  paid: { label: 'Paid', color: MONEY_TONE.paid, bg: 'rgba(46, 107, 79, 0.10)' },
  partly_paid: { label: 'Partly paid', color: MONEY_TONE.due, bg: 'rgba(155, 44, 44, 0.08)' },
  due: { label: 'Unpaid', color: MONEY_TONE.due, bg: 'rgba(155, 44, 44, 0.08)' },
  cancelled: { label: 'Cancelled', color: 'text.secondary', bg: 'action.hover' },
};

function BillStatus({ status }) {
  const st = BILL_STATUS[status] ?? BILL_STATUS.due;
  return (
    <Box component="span" sx={{ display: 'inline-block', px: 1, py: 0.25, borderRadius: 999, fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap', color: st.color, bgcolor: st.bg }}>
      {st.label}
    </Box>
  );
}

function PaymentsTimeline({ payments, openingBalance }) {
  const rows = [...payments];
  if (!rows.length && !openingBalance) return <EmptyState title="No payments yet" description="Advances, bill payments and credit for this customer appear here." />;
  return (
    <Card>
      <CardContent>
        <Stack divider={<Divider flexItem />} spacing={1.5}>
          {rows.map((p, n) => {
            const kind = PAYMENT_KIND[p.kind];
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
                        {p.ref.no} · for {p.ref.bills.join(', ')}
                      </Box>
                    ) : (
                      <Link component={RouterLink} to={p.ref.type === 'sale' ? `/sales/${p.ref.id}` : `/orders/${p.ref.id}`} underline="hover" color="inherit" sx={{ fontWeight: 600 }}>
                        {p.ref.type === 'sale' ? p.ref.no : `${p.docNo} · ${p.ref.no}`}
                      </Link>
                    )}
                    {p.reference ? ` · ${p.reference}` : ''}
                  </Typography>
                </Box>
                <Amount paise={Math.abs(p.amountPaise)} tone={kind.tone} prefix={p.kind === 'refund' ? '− ' : p.kind === 'credit' ? '' : '+ '} sx={{ fontSize: '1rem', fontWeight: 700 }} />
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
                  Opening balance
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  Carried over from before the software
                </Typography>
              </Box>
              <BalanceAmount paise={openingBalance} owedLabel="due" advanceLabel="advance" sx={{ fontSize: '1rem', fontWeight: 700 }} />
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

  if (isLoading) return <LoadingState label="Loading customer" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const balance = c.openingBalancePaise;
  const stats = activity?.stats;
  // Purchases/Orders tabs exist only once loaded and permitted; fall back to Payments otherwise.
  const hidden = (t) => ((t === 'bills' || t === 'purchases') && !activity?.purchases) || (t === 'orders' && !activity?.orders);
  const tab = hidden(chosenTab) ? 'payments' : chosenTab;

  const purchaseColumns = [
    {
      key: 'item',
      label: 'Item',
      render: (p) => (
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center' }}>
          <AuthImage fileId={p.imageFileId} alt={p.name} size={44} sx={{ borderRadius: 1.5 }} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {p.name}
              {p.returned && <Chip size="small" label="Returned" color="warning" variant="outlined" sx={{ ml: 1, height: 20, fontSize: '0.6875rem' }} />}
            </Typography>
            <Typography variant="caption" color="textSecondary">
              {[p.sku, purityLabel(p.metal, p.purity), p.huid && `HUID ${p.huid}`].filter(Boolean).join(' · ')}
            </Typography>
          </Box>
        </Stack>
      ),
    },
    { key: 'weight', label: 'Weight', render: (p) => <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>{formatWeight(p.grossWeightMg)}</Typography> },
    {
      key: 'bought',
      label: 'Bought',
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
      label: 'Amount',
      align: 'right',
      render: (p) => (
        <Box sx={{ whiteSpace: 'nowrap' }}>
          <Typography variant="body2" sx={{ fontWeight: 700, textDecoration: p.returned ? 'line-through' : 'none' }}>
            {formatINR(p.totalPaise)}
          </Typography>
          {p.discountPaise > 0 && (
            <Typography variant="caption" sx={{ color: MONEY_TONE.paid }}>
              {formatINR(p.discountPaise, { decimals: 0 })} off
            </Typography>
          )}
        </Box>
      ),
    },
    { key: 'actions', label: 'Action', align: 'right', width: 80, render: (p) => <ViewButton title="Open invoice" name={p.invoiceNo} icon={ReceiptLongOutlinedIcon} onClick={() => navigate(`/sales/${p.saleId}`)} /> },
  ];

  // One row per bill: what it came to, what was paid (at billing, from advances and collected later) and what is still due.
  const billColumns = [
    {
      key: 'bill',
      label: 'Bill',
      render: (b) => (
        <Box>
          <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
            {b.invoiceNo}
          </Typography>
          <Typography variant="caption" color="textSecondary">
            {[formatDate(b.at), `${b.itemCount} item${b.itemCount === 1 ? '' : 's'}`, b.orderNo].filter(Boolean).join(' · ')}
          </Typography>
        </Box>
      ),
    },
    {
      key: 'total',
      label: 'Bill amount',
      align: 'right',
      render: (b) => (
        <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: 'nowrap', textDecoration: b.status === 'cancelled' ? 'line-through' : 'none', color: b.status === 'cancelled' ? 'text.secondary' : 'text.primary' }}>
          {formatINR(b.grandTotalPaise)}
        </Typography>
      ),
    },
    {
      key: 'paid',
      label: 'Paid',
      align: 'right',
      render: (b) =>
        b.status === 'cancelled' ? (
          <Typography variant="body2" color="textSecondary">—</Typography>
        ) : (
          <Box sx={{ whiteSpace: 'nowrap' }}>
            <Amount paise={b.paidPaise} tone="paid" variant="body2" sx={{ fontWeight: 600 }} />
            {b.collectedLaterPaise > 0 && (
              <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>
                incl. {formatINR(b.collectedLaterPaise, { decimals: 0 })} collected later
              </Typography>
            )}
          </Box>
        ),
    },
    {
      key: 'due',
      label: 'Due',
      align: 'right',
      render: (b) =>
        b.status !== 'cancelled' && b.duePaise > 0 ? (
          <Amount paise={b.duePaise} tone="due" variant="body2" sx={{ fontWeight: 800, whiteSpace: 'nowrap' }} />
        ) : (
          <Typography variant="body2" color="textSecondary">—</Typography>
        ),
    },
    { key: 'status', label: 'Status', render: (b) => <BillStatus status={b.status === 'cancelled' ? 'cancelled' : b.paymentStatus} /> },
    {
      key: 'actions',
      label: 'Action',
      align: 'right',
      width: 150,
      render: (b) => (
        <Stack direction="row" spacing={0.5} sx={{ justifyContent: 'flex-end', alignItems: 'center' }}>
          {canCollect && b.status !== 'cancelled' && b.duePaise > 0 && (
            <Button size="small" variant="outlined" color="primary" onClick={() => setCollecting(String(b.id))} sx={{ whiteSpace: 'nowrap' }}>
              Collect
            </Button>
          )}
          <ViewButton title="Open invoice" name={b.invoiceNo} icon={ReceiptLongOutlinedIcon} onClick={() => navigate(`/sales/${b.id}`)} />
        </Stack>
      ),
    },
  ];

  const orderColumns = [
    {
      key: 'order',
      label: 'Order',
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
    { key: 'summary', label: 'Items', render: (o) => <Typography variant="body2">{o.summary}</Typography> },
    { key: 'advance', label: 'Advance', align: 'right', render: (o) => <Amount paise={o.advancePaise} tone={o.advancePaise ? 'paid' : undefined} decimals={0} /> },
    { key: 'status', label: 'Status', render: (o) => <OrderStatusChip status={o.status} /> },
    { key: 'actions', label: 'Action', align: 'right', width: 80, render: (o) => <ViewButton name={o.orderNo} onClick={() => navigate(`/orders/${o.id}`)} /> },
  ];

  return (
    <>
      <PageHeader
        back={{ to: '/customers', label: 'Customers' }}
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
            <span>· Customer since {formatDate(c.createdAt)}</span>
          </Stack>
        }
        actions={
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            {canCollect && stats?.duePaise > 0 && (
              <Button variant="contained" startIcon={<PaymentsOutlinedIcon />} onClick={() => setCollecting(true)}>
                Collect payment
              </Button>
            )}
            <RecordActions
              name={c.name}
              status={c.status}
              canEdit={canEdit}
              onStatus={async (status) => {
                await setStatus({ id, status }).unwrap();
                toast.success(status === 'active' ? 'Customer activated' : 'Customer deactivated');
              }}
            />
          </Stack>
        }
      />
      <CollectDueDialog open={Boolean(collecting)} onClose={() => setCollecting(false)} customerId={id} saleId={typeof collecting === 'string' ? collecting : null} />

      {stats && (
        <SummaryCards>
          {stats.purchasesPaise != null && (
            <SummaryCard icon={ReceiptLongOutlinedIcon} label="Total purchases" value={formatINR(stats.purchasesPaise, { decimals: 0 })} caption={`${stats.bills} bill${stats.bills === 1 ? '' : 's'}${stats.lastPurchaseAt ? ` · last ${formatDate(stats.lastPurchaseAt)}` : ''}`} />
          )}
          <SummaryCard icon={PaymentsOutlinedIcon} label="Paid" value={formatINR(stats.paidPaise, { decimals: 0 })} caption={stats.advanceLeftPaise ? `${formatINR(stats.advanceLeftPaise, { decimals: 0 })} advance left for next bills` : 'Advances and bill payments'} tone="green" valueTone="paid" />
          <SummaryCard
            icon={CreditCardOffOutlinedIcon}
            label="Due"
            value={stats.duePaise ? formatINR(stats.duePaise, { decimals: 0 }) : 'Nil'}
            caption={stats.duePaise ? [stats.creditDuePaise && `Bills ${formatINR(stats.creditDuePaise, { decimals: 0 })}`, stats.openingDuePaise && `Old ${formatINR(stats.openingDuePaise, { decimals: 0 })}`].filter(Boolean).join(' · ') : 'Nothing owed'}
            tone={stats.duePaise ? 'red' : 'green'}
            valueTone={stats.duePaise ? 'due' : 'paid'}
          />
          {stats.openOrders != null && (
            <SummaryCard icon={AssignmentOutlinedIcon} label="Open orders" value={stats.openOrders} caption={stats.advanceHeldPaise ? `${formatINR(stats.advanceHeldPaise, { decimals: 0 })} advance held` : 'No advance held'} tone="blue" />
          )}
        </SummaryCards>
      )}

      <Tabs value={tab} onChange={(e, v) => setTab(v)} variant="scrollable" sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
        {activity?.invoices && <Tab value="bills" label={`Bills (${activity.invoices.length})`} />}
        {activity?.purchases && <Tab value="purchases" label={`Items bought (${activity.purchases.length})`} />}
        <Tab value="payments" label={`Payments (${activity?.payments.length ?? 0})`} />
        {activity?.orders && <Tab value="orders" label={`Orders (${activity.orders.length})`} />}
        <Tab value="details" label="Details" />
        <Tab value="history" label={history.data?.length ? `Edit history (${history.data.length})` : 'Edit history'} />
      </Tabs>

      {loadingActivity && tab !== 'details' && tab !== 'history' && <LoadingState />}

      {tab === 'bills' && activity?.invoices && (
        <>
          <DataTable columns={billColumns} rows={activity.invoices} getRowId={(b) => b.id} empty={{ title: 'No bills yet', description: 'Bills made for this customer appear here with what is paid and what is still due.' }} />
        </>
      )}
      {tab === 'bills' && activity && !activity.invoices && <EmptyState title="Bills hidden" description="You need permission to view invoices." />}

      {tab === 'purchases' && activity?.purchases && (
        <DataTable columns={purchaseColumns} rows={activity.purchases} getRowId={(p) => `${p.saleId}-${p.productId}`} empty={{ title: 'No purchases yet', description: 'Items bought by this customer appear here with their invoice.' }} />
      )}
      {tab === 'purchases' && activity && !activity.purchases && <EmptyState title="Purchases hidden" description="You need permission to view invoices." />}

      {tab === 'payments' && activity && <PaymentsTimeline payments={activity.payments} openingBalance={balance} />}

      {tab === 'orders' && activity?.orders && (
        <DataTable columns={orderColumns} rows={activity.orders} getRowId={(o) => o.id} empty={{ title: 'No orders yet', description: 'Custom orders booked for this customer appear here.' }} />
      )}

      {tab === 'details' && (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <InfoCard
              title="Contact"
              items={[
                { label: 'Mobile', value: c.mobile },
                { label: 'Alternate', value: c.alternateMobile, hidden: !c.alternateMobile },
                { label: 'Email', value: c.email, hidden: !c.email },
                { label: 'Address', value: formatAddress(c.address) },
                { label: 'Birthday', value: c.dob && formatDate(c.dob), hidden: !c.dob },
                { label: 'Anniversary', value: c.anniversary && formatDate(c.anniversary), hidden: !c.anniversary },
                { label: 'Notes', value: c.notes, hidden: !c.notes },
              ]}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <InfoCard
              title="Account & ID"
              items={[
                { label: 'Old due', value: <BalanceAmount paise={balance} owedLabel="due" advanceLabel="advance held" /> },
                { label: 'GSTIN', value: c.gstin, hidden: !c.gstin },
                { label: 'PAN', value: c.pan },
                { label: 'ID document', value: c.kyc.type && `${KYC_DOC_TYPES.find((k) => k.value === c.kyc.type)?.label} · ${c.kyc.number}` },
              ]}
            />
          </Grid>
        </Grid>
      )}

      {tab === 'history' && <EditHistory entries={history.data} isLoading={history.isLoading} error={history.error} showSource={false} />}

    </>
  );
}
