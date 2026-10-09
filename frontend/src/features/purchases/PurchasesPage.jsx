import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { Box, Button, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { formatINR, formatWeight } from '@jerp/shared';
import { useNavigate } from 'react-router';
import Amount from '../../components/Amount.jsx';
import DataTable from '../../components/DataTable.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import SearchField from '../../components/SearchField.jsx';
import { viewColumn } from '../../components/ViewButton.jsx';
import { useListParams } from '../../hooks/useListParams.js';
import { usePermission } from '../../hooks/usePermission.js';
import { formatDate } from '../../utils/format.js';
import { usePurchaseListQuery, usePurchaseOrderListQuery } from './purchaseApi.js';
import { PaymentChip } from './purchaseUi.jsx';
import SummaryCards, { SummaryCard } from '../../components/SummaryCards.jsx';
import ShoppingBagOutlinedIcon from '@mui/icons-material/ShoppingBagOutlined';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined';

export default function PurchasesPage() {
  const navigate = useNavigate();
  const canCreate = usePermission('purchase.create');
  const list = useListParams({ payment: '' });
  const { data, isLoading, isFetching, error, refetch } = usePurchaseListQuery(list.params);
  const { data: orders } = usePurchaseOrderListQuery({ limit: 1, status: 'open' });
  const meta = data?.meta;

  const columns = [
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
    { key: 'supplier', label: 'Supplier', render: (p) => <Typography variant="body2" sx={{ fontWeight: 500 }}>{p.supplier.name}</Typography> },
    {
      key: 'items',
      label: 'Items',
      render: (p) => (
        <Typography variant="body2">
          {[p.totals.pieces ? `${p.totals.pieces} pcs` : null, p.metalLines.length ? `${p.metalLines.length} metal` : null].filter(Boolean).join(' + ')}
          <Typography component="span" variant="caption" color="textSecondary">
            {' '}
            · {formatWeight(p.totals.grossMg)}
          </Typography>
        </Typography>
      ),
    },
    { key: 'total', label: 'Amount', align: 'right', render: (p) => <Amount paise={p.totals.totalPaise} decimals={0} sx={{ fontWeight: 600 }} /> },
    {
      key: 'payment',
      label: 'Payment',
      render: (p) => (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <PaymentChip status={p.paymentStatus} />
          {p.duePaise > 0 && (
            <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 600 }}>
              {formatINR(p.duePaise, { decimals: 0 })} due
            </Typography>
          )}
        </Stack>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Purchases"
        subtitle="Supplier bills — stock received, what it cost and what is still to pay."
        actions={
          canCreate && (
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => navigate('/purchases/new')}>
              New purchase
            </Button>
          )
        }
      />
      <SummaryCards>
        <SummaryCard icon={ShoppingBagOutlinedIcon} label="Bought this month" value={formatINR(meta?.monthPaise ?? 0, { decimals: 0 })} caption={`${meta?.monthBills ?? 0} bill${meta?.monthBills === 1 ? '' : 's'}`} />
        <SummaryCard
          icon={AccountBalanceWalletOutlinedIcon}
          label="To pay suppliers"
          value={formatINR(meta?.duePaise ?? 0, { decimals: 0 })}
          caption={meta?.dueBills ? `${meta.dueBills} bill${meta.dueBills === 1 ? '' : 's'} unpaid — tap to see` : 'All bills paid'}
          tone={meta?.duePaise ? 'red' : 'green'}
          valueTone={meta?.duePaise ? 'due' : 'paid'}
          onClick={meta?.dueBills ? () => list.setFilter('payment', 'due') : undefined}
        />
        <SummaryCard
          icon={PendingActionsOutlinedIcon}
          label="Open orders"
          value={orders?.meta?.open ?? 0}
          caption={orders?.meta?.overdue ? `${orders.meta.overdue} overdue` : 'Waiting for delivery'}
          tone={orders?.meta?.overdue ? 'red' : 'blue'}
          onClick={() => navigate('/purchases/orders')}
        />
      </SummaryCards>
      <DataTable
        columns={[...columns, viewColumn((p) => navigate(`/purchases/${p.id}`), { name: (p) => p.billNo })]}
        rows={data?.items}
        loading={isLoading}
        fetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={list.filtered ? { title: 'No matching bills', description: 'Try another bill number, supplier or filter.' } : { title: 'No purchases yet', description: 'Enter a supplier’s bill to bring stock in at its real cost.' }}
        pagination={list.pagination(meta)}
        toolbar={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
            <SearchField value={list.search} onChange={list.setSearch} placeholder="Search bill no., supplier or order" />
            <ToggleButtonGroup exclusive size="small" value={list.filters.payment} onChange={(e, v) => v !== null && list.setFilter('payment', v)} sx={{ height: 40, flexShrink: 0 }}>
              <ToggleButton value="">All</ToggleButton>
              <ToggleButton value="due">Due</ToggleButton>
              <ToggleButton value="partly_paid">Partly paid</ToggleButton>
              <ToggleButton value="paid">Paid</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        }
      />
    </>
  );
}
