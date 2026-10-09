import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { formatINR, SUPPLIER_SUPPLIES } from '@jerp/shared';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import DataTable from '../../components/DataTable.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import SearchField from '../../components/SearchField.jsx';
import StatusChip from '../../components/StatusChip.jsx';
import { useListParams } from '../../hooks/useListParams.js';
import { usePermission } from '../../hooks/usePermission.js';
import SupplierFormDrawer from './SupplierFormDrawer.jsx';
import { useSupplierListQuery } from './supplierApi.js';
import SummaryCards, { SummaryCard } from '../../components/SummaryCards.jsx';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import ShoppingBagOutlinedIcon from '@mui/icons-material/ShoppingBagOutlined';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import { viewColumn } from '../../components/ViewButton.jsx';
import { BalanceAmount } from '../../components/Amount.jsx';

export const suppliesLabel = (list) => list.map((v) => SUPPLIER_SUPPLIES.find((s) => s.value === v)?.label ?? v).join(', ');

export default function SuppliersPage() {
  const navigate = useNavigate();
  const canCreate = usePermission('supplier.create');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const list = useListParams({ supplies: '', status: '' });
  const { data, isLoading, isFetching, error, refetch } = useSupplierListQuery(list.params);

  const columns = [
    {
      key: 'companyName',
      label: 'Supplier',
      render: (s) => (
        <Box>
          <Typography variant="subtitle2">{s.companyName}</Typography>
          <Typography variant="body2" color="textSecondary">
            {s.code}
            {s.contactPerson && ` · ${s.contactPerson}`}
          </Typography>
        </Box>
      ),
    },
    { key: 'mobile', label: 'Mobile', render: (s) => s.mobile },
    { key: 'gstin', label: 'GSTIN', render: (s) => s.gstin ?? '—' },
    { key: 'supplies', label: 'Supplies', render: (s) => suppliesLabel(s.supplies) || '—' },
    { key: 'balance', label: 'Opening payable', align: 'right', render: (s) => (s.openingBalancePaise ? <BalanceAmount paise={s.openingBalancePaise} owedLabel="payable" advanceLabel="advance" decimals={0} /> : '—') },
    { key: 'status', label: 'Status', render: (s) => <StatusChip status={s.status} /> },
  ];

  return (
    <>
      <PageHeader
        title="Suppliers"
        subtitle="Bullion dealers, manufacturers and vendors you buy from."
        actions={
          canCreate && (
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => setDrawerOpen(true)}>
              New supplier
            </Button>
          )
        }
      />
      {data?.meta?.summary && (
        <SummaryCards>
          <SummaryCard icon={LocalShippingOutlinedIcon} label="Active suppliers" value={data.meta.summary.active} caption="You buy from" />
          <SummaryCard icon={ShoppingBagOutlinedIcon} label="Bought this month" value={formatINR(data.meta.summary.monthPaise, { decimals: 0 })} caption="Purchase bills" tone="blue" onClick={() => navigate('/purchases')} />
          <SummaryCard
            icon={AccountBalanceWalletOutlinedIcon}
            label="To pay suppliers"
            value={formatINR(data.meta.summary.duePaise, { decimals: 0 })}
            caption={data.meta.summary.dueSuppliers ? `Owed to ${data.meta.summary.dueSuppliers} supplier${data.meta.summary.dueSuppliers === 1 ? '' : 's'}` : 'All bills paid'}
            tone={data.meta.summary.duePaise ? 'red' : 'green'}
            valueTone={data.meta.summary.duePaise ? 'due' : 'paid'}
            onClick={() => navigate('/purchases?payment=due')}
          />
        </SummaryCards>
      )}
      <DataTable
        columns={[...columns, viewColumn((s) => navigate(`/suppliers/${s.id}`), { name: (s) => s.companyName })]}
        rows={data?.items}
        loading={isLoading}
        fetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={list.filtered ? { title: 'No matching suppliers' } : { title: 'No suppliers yet', description: 'Add the dealers and manufacturers you purchase from.' }}
        pagination={list.pagination(data?.meta)}
        toolbar={
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <SearchField value={list.search} onChange={list.setSearch} placeholder="Search name, mobile, GSTIN or code" />
            <TextField select label="Supplies" value={list.filters.supplies} onChange={(e) => list.setFilter('supplies', e.target.value)} sx={{ maxWidth: { sm: 200 } }}>
              <MenuItem value="">Everything</MenuItem>
              {SUPPLIER_SUPPLIES.map((s) => (
                <MenuItem key={s.value} value={s.value}>
                  {s.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label="Status" value={list.filters.status} onChange={(e) => list.setFilter('status', e.target.value)} sx={{ maxWidth: { sm: 160 } }}>
              <MenuItem value="">All</MenuItem>
              <MenuItem value="active">Active</MenuItem>
              <MenuItem value="inactive">Inactive</MenuItem>
            </TextField>
          </Stack>
        }
      />
      <SupplierFormDrawer open={drawerOpen} supplier={null} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
