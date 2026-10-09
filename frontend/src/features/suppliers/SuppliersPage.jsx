import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { Box, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { SUPPLIER_SUPPLIES } from '@jerp/shared';
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
