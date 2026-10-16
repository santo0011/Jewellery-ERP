import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CallOutlinedIcon from '@mui/icons-material/CallOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined';
import ShoppingBagOutlinedIcon from '@mui/icons-material/ShoppingBagOutlined';
import { Box, Button, Card, CardContent, Chip, Divider, Grid, Link, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { formatINR, formatWeight } from '@jerp/shared';
import toast from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router';
import { BalanceAmount } from '../../components/Amount.jsx';
import DataTable from '../../components/DataTable.jsx';
import InfoCard from '../../components/InfoCard.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import RecordActions from '../../components/RecordActions.jsx';
import RecordHistory from '../../components/RecordHistory.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/StateViews.jsx';
import StatusChip from '../../components/StatusChip.jsx';
import SummaryCards, { SummaryCard } from '../../components/SummaryCards.jsx';
import { viewColumn } from '../../components/ViewButton.jsx';
import { usePermission } from '../../hooks/usePermission.js';
import { useTabParam } from '../../hooks/useListParams.js';
import { fonts, tokens } from '../../theme/tokens.js';
import { formatDate, formatDateTime } from '../../utils/format.js';
import { formatAddress } from '../customers/CustomerDetailPage.jsx';
import { usePurchaseListQuery, usePurchaseOrderListQuery } from '../purchases/purchaseApi.js';
import { OrderStatusChip, PaymentChip, payModeLabel } from '../purchases/purchaseUi.jsx';
import PaySupplierDialog from './PaySupplierDialog.jsx';
import { suppliesLabel } from './SuppliersPage.jsx';
import { useSetSupplierStatusMutation, useSupplierPaymentsQuery, useSupplierQuery } from './supplierApi.js';
import ViewTabs from '../../components/ViewTabs.jsx';

const signed = (value, format, positive, negative) => (value ? `${format(Math.abs(value))} ${value > 0 ? positive : negative}` : 'Nil');
const inr = (p) => formatINR(p, { decimals: 0 });
const initials = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');

function Fact({ label, children }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>
        {label}
      </Typography>
      <Box sx={{ fontWeight: 600, fontSize: '0.9375rem' }}>{children || '—'}</Box>
    </Box>
  );
}

function BillsTab({ supplierId }) {
  const navigate = useNavigate();
  const { data, isLoading, isFetching, error, refetch } = usePurchaseListQuery({ supplierId, limit: 50 });
  return (
    <DataTable
      columns={[
        {
          key: 'bill',
          label: 'Bill',
          render: (p) => (
            <Box>
              <Typography variant="subtitle2">{p.billNo}</Typography>
              <Typography variant="caption" color="textSecondary">
                {formatDate(p.billDate)} · {p.purchaseNo}
              </Typography>
            </Box>
          ),
        },
        { key: 'items', label: 'Items', render: (p) => `${p.totals.pieces ? `${p.totals.pieces} pcs` : ''}${p.totals.pieces && p.metalLines.length ? ' + ' : ''}${p.metalLines.length ? `${p.metalLines.length} metal` : ''} · ${formatWeight(p.totals.grossMg)}` },
        { key: 'total', label: 'Amount', align: 'right', render: (p) => <Typography variant="body2" sx={{ fontWeight: 600 }}>{inr(p.totals.totalPaise)}</Typography> },
        {
          key: 'pay',
          label: 'Payment',
          render: (p) => (
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <PaymentChip status={p.paymentStatus} />
              {p.duePaise > 0 && (
                <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 600 }}>
                  {inr(p.duePaise)} due
                </Typography>
              )}
            </Stack>
          ),
        },
        viewColumn((p) => navigate(`/purchases/${p.id}`), { name: (p) => p.billNo }),
      ]}
      rows={data?.items}
      loading={isLoading}
      fetching={isFetching}
      error={error}
      onRetry={refetch}
      empty={{ title: 'No bills yet', description: 'Purchases from this supplier show here with what is paid and due.' }}
    />
  );
}

function OrdersTab({ supplierId }) {
  const navigate = useNavigate();
  const { data, isLoading, isFetching, error, refetch } = usePurchaseOrderListQuery({ supplierId, limit: 50 });
  return (
    <DataTable
      columns={[
        {
          key: 'order',
          label: 'Order',
          render: (o) => (
            <Box>
              <Typography variant="subtitle2">{o.orderNo}</Typography>
              <Typography variant="caption" color="textSecondary">
                {formatDate(o.orderDate)}
              </Typography>
            </Box>
          ),
        },
        { key: 'items', label: 'Items', render: (o) => <Typography variant="body2" noWrap sx={{ maxWidth: 280 }}>{o.lines.map((l) => l.description).join(', ')}</Typography> },
        { key: 'expected', label: 'Expected', render: (o) => (o.expectedDate ? formatDate(o.expectedDate) : '—') },
        { key: 'status', label: 'Status', render: (o) => <OrderStatusChip status={o.status} overdue={o.overdue} /> },
        viewColumn((o) => navigate(`/purchases/orders/${o.id}`), { name: (o) => o.orderNo }),
      ]}
      rows={data?.items}
      loading={isLoading}
      fetching={isFetching}
      error={error}
      onRetry={refetch}
      empty={{ title: 'No orders yet', description: 'Orders placed with this supplier show here until the goods arrive.' }}
    />
  );
}

/** Every payment to the supplier, newest first: on their account (old balance + bills) and on single bills. */
function PaymentHistory({ supplierId }) {
  const navigate = useNavigate();
  const { data: rows, isLoading, error, refetch } = useSupplierPaymentsQuery(supplierId);
  if (isLoading) return <LoadingState label="Loading payments" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const total = (rows ?? []).reduce((n, r) => n + r.amountPaise, 0);
  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', mb: 1.5, gap: 1, flexWrap: 'wrap' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Payment history
          </Typography>
          {rows?.length > 0 && (
            <Typography variant="body2" color="textSecondary">
              {rows.length} payment{rows.length === 1 ? '' : 's'} · <Box component="strong" sx={{ color: 'success.main' }}>{inr(total)}</Box> paid
            </Typography>
          )}
        </Stack>
        {!rows?.length ? (
          <EmptyState title="No payments yet" description="Payments to this supplier — on their account or on a bill — show here." />
        ) : (
          <Stack divider={<Divider flexItem />} spacing={1.5}>
            {rows.map((r, i) => (
              <Stack key={r.paymentNo ?? `${r.at}-${i}`} direction="row" sx={{ justifyContent: 'space-between', gap: 2 }}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {formatDate(r.date)} · {payModeLabel(r.mode)}
                    {r.paymentNo ? ` · ${r.paymentNo}` : ' · paid on bill'}
                  </Typography>
                  <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap', mt: 0.5 }}>
                    {r.allocations.map((a, j) => (
                      <Chip
                        key={j}
                        size="small"
                        variant="outlined"
                        label={`${a.purchaseId ? `Bill ${a.billNo}` : 'Old balance'} · ${inr(a.amountPaise)}`}
                        onClick={a.purchaseId ? () => navigate(`/purchases/${a.purchaseId}`) : undefined}
                        sx={{ height: 22 }}
                      />
                    ))}
                  </Stack>
                  <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 0.5 }}>
                    {[r.reference, r.note, r.branch?.name, r.by && `by ${r.by.name}`, r.at && formatDateTime(r.at)].filter(Boolean).join(' · ')}
                  </Typography>
                </Box>
                <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.main', whiteSpace: 'nowrap' }}>
                  {inr(r.amountPaise)}
                </Typography>
              </Stack>
            ))}
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

export default function SupplierDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useTabParam('bills');
  const canEdit = usePermission('supplier.edit');
  const canBuy = usePermission('purchase.create');
  const canPay = usePermission('purchase.edit');
  const canSeeBills = usePermission('purchase.view');
  const [paying, setPaying] = useState(false);
  const { data: s, isLoading, error, refetch } = useSupplierQuery(id);
  const [setStatus] = useSetSupplierStatusMutation();

  if (isLoading) return <LoadingState label="Loading supplier" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const bank = s.bankDetails;
  const st = s.stats;
  const current = !st && (tab === 'bills' || tab === 'orders') ? 'details' : tab;

  return (
    <>
      <PageHeader
        back={{ to: '/suppliers', label: 'Suppliers' }}
        title="Supplier"
        breadcrumbs={[{ label: 'Suppliers', to: '/suppliers' }, { label: s.code }]}
        actions={
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            {canPay && st?.duePaise > 0 && (
              <Button variant="outlined" color="success" startIcon={<PaymentsOutlinedIcon />} onClick={() => setPaying(true)}>
                Payment
              </Button>
            )}
            {canBuy && s.status === 'active' && (
              <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => navigate(`/purchases/new?supplierId=${id}`)}>
                New purchase
              </Button>
            )}
            <RecordActions
              name={s.companyName}
              status={s.status}
              canEdit={canEdit}
              onStatus={async (status) => {
                await setStatus({ id, status }).unwrap();
                toast.success(status === 'active' ? 'Supplier activated' : 'Supplier deactivated');
              }}
            />
          </Stack>
        }
      />

      {/* Profile: who they are and how to reach them. */}
      <Card sx={{ mb: 2 }}>
        {/* Phones: initials beside the name (not stacked above it), so the card stays short. */}
        <CardContent sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: { xs: 'stretch', md: 'center' }, gap: { xs: 1.75, md: 2.5 }, p: 2, '&:last-child': { pb: 2 } }}>
          <Stack direction="row" spacing={{ xs: 1.5, sm: 2 }} sx={{ alignItems: 'center', flex: 1, minWidth: 0 }}>
            <Box sx={{ width: { xs: 52, sm: 56 }, height: { xs: 52, sm: 56 }, borderRadius: 3, flexShrink: 0, display: 'grid', placeItems: 'center', background: tokens.sidebar.goldGradient, color: 'var(--brand-contrast)', fontFamily: fonts.display, fontWeight: 700, fontSize: { xs: 22, sm: 24 }, boxShadow: '0 6px 18px rgba(var(--brand-rgb), 0.3)' }}>
              {initials(s.companyName)}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h2" sx={{ lineHeight: 1.2, fontSize: { xs: '1.1875rem', sm: '1.3125rem' } }}>
                {s.companyName}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: { xs: 0.75, sm: 1 }, flexWrap: 'wrap', rowGap: 0.75 }}>
                <Chip size="small" label={s.code} variant="outlined" sx={{ height: 22 }} />
                <StatusChip status={s.status} />
                {(s.supplies ?? []).map((x) => (
                  <Chip key={x} size="small" label={suppliesLabel([x])} sx={{ height: 22, bgcolor: 'rgba(var(--brand-rgb), 0.12)', color: tokens.brand.strong, fontWeight: 600 }} />
                ))}
              </Stack>
            </Box>
          </Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, auto)' }, columnGap: { xs: 2, sm: 4 }, rowGap: { xs: 1, sm: 1.5 }, width: { xs: '100%', md: 'auto' }, pt: { xs: 1.5, md: 0 }, borderTop: { xs: 1, md: 0 }, borderColor: 'divider' }}>
            <Fact label="Mobile">
              <Link href={`tel:${s.mobile}`} underline="hover" color="inherit" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                <CallOutlinedIcon sx={{ fontSize: 15, color: 'text.secondary' }} />
                {s.mobile}
              </Link>
            </Fact>
            <Fact label="Contact person">{s.contactPerson}</Fact>
            <Fact label="GSTIN">{s.gstin}</Fact>
            <Fact label="Payment terms">{s.paymentTermsDays ? `${s.paymentTermsDays} days` : 'Immediate'}</Fact>
          </Box>
        </CardContent>
      </Card>

      {st && (
        <SummaryCards>
          <SummaryCard icon={ShoppingBagOutlinedIcon} label="Total purchased" value={inr(st.purchasedPaise)} caption={st.bills ? `${st.bills} bill${st.bills === 1 ? '' : 's'} · last ${formatDate(st.lastBillDate)}` : 'No bills yet'} />
          <SummaryCard icon={PaymentsOutlinedIcon} label="Paid" value={inr(st.paidPaise)} caption={st.openingPaidPaise ? `Bills ${inr(st.billPaidPaise)} · old balance ${inr(st.openingPaidPaise)}` : 'Against purchase bills'} tone="green" valueTone="paid" />
          <SummaryCard
            icon={AccountBalanceWalletOutlinedIcon}
            label="To pay"
            value={st.duePaise ? inr(st.duePaise) : 'Nil'}
            caption={st.duePaise ? [st.billDuePaise && `${st.unpaidBills} bill${st.unpaidBills === 1 ? '' : 's'} ${inr(st.billDuePaise)}`, st.openingDuePaise && `Old ${inr(st.openingDuePaise)}`].filter(Boolean).join(' · ') : 'Nothing owed'}
            tone={st.duePaise ? 'red' : 'green'}
            valueTone={st.duePaise ? 'due' : 'paid'}
            onClick={st.unpaidBills ? () => setTab('bills') : undefined}
          />
          <SummaryCard icon={PendingActionsOutlinedIcon} label="Open orders" value={st.openOrders} caption={st.openOrders ? 'Waiting for delivery' : 'Nothing on order'} tone="blue" onClick={() => setTab('orders')} />
        </SummaryCards>
      )}

      <ViewTabs
        value={current}
        onChange={setTab}
        items={[st && { value: 'bills', label: 'Bills', count: st.bills }, st && { value: 'orders', label: 'Orders' }, { value: 'details', label: 'Details' }, { value: 'history', label: 'History' }]}
      />

      {current === 'bills' && <BillsTab supplierId={id} />}
      {current === 'orders' && <OrdersTab supplierId={id} />}
      {current === 'details' && (
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <InfoCard
              title="Contact"
              items={[
                { label: 'Contact person', value: s.contactPerson },
                { label: 'Mobile', value: s.mobile },
                { label: 'Alternate', value: s.alternateMobile },
                { label: 'Email', value: s.email },
                { label: 'Address', value: formatAddress(s.address) },
              ]}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <InfoCard
              title="Tax & terms"
              items={[
                { label: 'GSTIN', value: s.gstin },
                { label: 'PAN', value: s.pan },
                { label: 'Supplies', value: suppliesLabel(s.supplies) },
                { label: 'Payment terms', value: s.paymentTermsDays ? `${s.paymentTermsDays} days` : 'Immediate' },
              ]}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <InfoCard
              title="Bank details"
              items={[
                { label: 'Account name', value: bank.accountName },
                { label: 'Account number', value: bank.accountNumber },
                { label: 'IFSC', value: bank.ifsc },
                { label: 'Bank', value: [bank.bankName, bank.branchName].filter(Boolean).join(', ') },
                { label: 'UPI', value: bank.upiId },
              ]}
            />
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <InfoCard
              title="Opening balances"
              items={[
                {
                  label: 'Old balance',
                  value: s.openingBalancePaise ? (
                    <>
                      <BalanceAmount paise={s.openingBalancePaise} owedLabel="payable (due)" advanceLabel="receivable (advance paid)" />
                      {s.openingDuePaidPaise > 0 && ` · ${inr(s.openingDuePaidPaise)} paid, ${inr(s.openingDuePaise)} left`}
                    </>
                  ) : (
                    'Nil'
                  ),
                },
                { label: 'Fine gold', value: signed(s.openingFineGoldMg, formatWeight, 'payable', 'receivable') },
                { label: 'Fine silver', value: signed(s.openingFineSilverMg, formatWeight, 'payable', 'receivable') },
                { label: 'Notes', value: s.notes },
              ]}
            />
          </Grid>
        </Grid>
      )}
      {current === 'history' && (
        <>
          {canSeeBills && <PaymentHistory supplierId={id} />}
          <RecordHistory recordId={id} />
        </>
      )}
      {paying && st && <PaySupplierDialog supplier={{ id, companyName: s.companyName, duePaise: st.duePaise, openingDuePaise: st.openingDuePaise }} onClose={() => setPaying(false)} />}

    </>
  );
}
