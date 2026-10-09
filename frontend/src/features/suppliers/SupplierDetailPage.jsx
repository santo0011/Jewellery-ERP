import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CallOutlinedIcon from '@mui/icons-material/CallOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined';
import ShoppingBagOutlinedIcon from '@mui/icons-material/ShoppingBagOutlined';
import { Box, Button, Card, CardContent, Chip, Grid, Link, Stack, Tab, Tabs, Typography } from '@mui/material';
import { formatINR, formatWeight } from '@jerp/shared';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router';
import { BalanceAmount } from '../../components/Amount.jsx';
import DataTable from '../../components/DataTable.jsx';
import InfoCard from '../../components/InfoCard.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import RecordActions from '../../components/RecordActions.jsx';
import RecordHistory from '../../components/RecordHistory.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import StatusChip from '../../components/StatusChip.jsx';
import SummaryCards, { SummaryCard } from '../../components/SummaryCards.jsx';
import { viewColumn } from '../../components/ViewButton.jsx';
import { usePermission } from '../../hooks/usePermission.js';
import { fonts, tokens } from '../../theme/tokens.js';
import { formatDate } from '../../utils/format.js';
import { formatAddress } from '../customers/CustomerDetailPage.jsx';
import { usePurchaseListQuery, usePurchaseOrderListQuery } from '../purchases/purchaseApi.js';
import { OrderStatusChip, PaymentChip } from '../purchases/purchaseUi.jsx';
import SupplierFormDrawer from './SupplierFormDrawer.jsx';
import { suppliesLabel } from './SuppliersPage.jsx';
import { useDeleteSupplierMutation, useSetSupplierStatusMutation, useSupplierQuery } from './supplierApi.js';

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

export default function SupplierDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState('bills');
  const canEdit = usePermission('supplier.edit');
  const canDelete = usePermission('supplier.delete');
  const canBuy = usePermission('purchase.create');
  const { data: s, isLoading, error, refetch } = useSupplierQuery(id);
  const [setStatus] = useSetSupplierStatusMutation();
  const [remove] = useDeleteSupplierMutation();

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
            {canBuy && s.status === 'active' && (
              <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => navigate(`/purchases/new?supplierId=${id}`)}>
                New purchase
              </Button>
            )}
            <RecordActions
              name={s.companyName}
              status={s.status}
              canEdit={canEdit}
              canDelete={canDelete}
              onEdit={() => setEditing(true)}
              onStatus={async (status) => {
                await setStatus({ id, status }).unwrap();
                toast.success(status === 'active' ? 'Supplier activated' : 'Supplier deactivated');
              }}
              onDelete={async () => {
                await remove(id).unwrap();
                toast.success('Supplier deleted');
                navigate('/suppliers', { replace: true });
              }}
              deleteMessage="Suppliers linked to products cannot be deleted; deactivate them instead."
            />
          </Stack>
        }
      />

      {/* Profile: who they are and how to reach them. */}
      <Card sx={{ mb: 2 }}>
        <CardContent sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, alignItems: 'center', gap: { xs: 2, md: 3 } }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2.5} sx={{ alignItems: 'center', textAlign: { xs: 'center', sm: 'left' }, flex: 1, minWidth: 0 }}>
            <Box sx={{ width: 72, height: 72, borderRadius: 3, flexShrink: 0, display: 'grid', placeItems: 'center', background: tokens.sidebar.goldGradient, color: '#171717', fontFamily: fonts.display, fontWeight: 700, fontSize: 30, boxShadow: '0 6px 18px rgba(201, 162, 39, 0.3)' }}>
              {initials(s.companyName)}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h2" sx={{ lineHeight: 1.2 }}>
                {s.companyName}
              </Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', rowGap: 0.75, justifyContent: { xs: 'center', sm: 'flex-start' } }}>
                <Chip size="small" label={s.code} variant="outlined" sx={{ height: 22 }} />
                <StatusChip status={s.status} />
                {(s.supplies ?? []).map((x) => (
                  <Chip key={x} size="small" label={suppliesLabel([x])} sx={{ height: 22, bgcolor: 'rgba(201, 162, 39, 0.12)', color: tokens.light.goldDark, fontWeight: 600 }} />
                ))}
              </Stack>
            </Box>
          </Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(4, auto)' }, columnGap: { xs: 3, sm: 4 }, rowGap: 1.5, width: { xs: '100%', md: 'auto' } }}>
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
          <SummaryCard icon={PaymentsOutlinedIcon} label="Paid" value={inr(st.paidPaise)} caption="Against purchase bills" tone="green" valueTone="paid" />
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

      <Tabs value={current} onChange={(e, v) => setTab(v)} variant="scrollable" sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
        {st && <Tab value="bills" label={`Bills (${st.bills})`} />}
        {st && <Tab value="orders" label="Orders" />}
        <Tab value="details" label="Details" />
        <Tab value="history" label="History" />
      </Tabs>

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
                { label: 'Amount', value: <BalanceAmount paise={s.openingBalancePaise} owedLabel="payable (due)" advanceLabel="receivable (advance paid)" /> },
                { label: 'Fine gold', value: signed(s.openingFineGoldMg, formatWeight, 'payable', 'receivable') },
                { label: 'Fine silver', value: signed(s.openingFineSilverMg, formatWeight, 'payable', 'receivable') },
                { label: 'Notes', value: s.notes },
              ]}
            />
          </Grid>
        </Grid>
      )}
      {current === 'history' && <RecordHistory recordId={id} />}

      <SupplierFormDrawer open={editing} supplier={s} onClose={() => setEditing(false)} />
    </>
  );
}
