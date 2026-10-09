import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { Box, Button, Chip, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { formatINR, formatWeight, METAL_OPTIONS, PRODUCT_STATUS_LABELS } from '@jerp/shared';
import { useNavigate } from 'react-router';
import AuthImage from '../../components/AuthImage.jsx';
import DataTable from '../../components/DataTable.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import SearchField from '../../components/SearchField.jsx';
import { useListParams } from '../../hooks/useListParams.js';
import { usePermission } from '../../hooks/usePermission.js';
import { buildCategoryTree, useCategoriesQuery } from '../categories/categoryApi.js';
import { useProductListQuery } from './productApi.js';
import SummaryCards, { SummaryCard } from '../../components/SummaryCards.jsx';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import ScaleOutlinedIcon from '@mui/icons-material/ScaleOutlined';
import CurrencyRupeeOutlinedIcon from '@mui/icons-material/CurrencyRupeeOutlined';
import EditNoteOutlinedIcon from '@mui/icons-material/EditNoteOutlined';
import { purityLabel } from './productForm.js';
import { viewColumn } from '../../components/ViewButton.jsx';

const STATUS_COLORS = { draft: 'default', in_stock: 'success', reserved: 'warning', sold: 'info', with_karigar: 'warning', in_repair: 'warning', in_transit: 'info' };

export function ProductStatusChip({ status }) {
  return <Chip size="small" label={PRODUCT_STATUS_LABELS[status] ?? status} color={STATUS_COLORS[status] ?? 'default'} variant={status === 'in_stock' ? 'filled' : 'outlined'} sx={{ height: 22 }} />;
}

// Filters always show their label on top and a value ("All categories"), so picking one does not shift the layout.
const filterSlots = {
  inputLabel: { shrink: true },
  select: { displayEmpty: true, MenuProps: { slotProps: { paper: { sx: { maxHeight: 360 } } } } },
};

export default function ProductsPage() {
  const navigate = useNavigate();
  const canCreate = usePermission('product.create');
  const list = useListParams({ categoryId: '', metal: '', status: 'in_stock' });
  const { data, isLoading, isFetching, error, refetch } = useProductListQuery(list.params);
  const { data: categories = [] } = useCategoriesQuery();
  const tree = buildCategoryTree(categories);

  const columns = [
    {
      key: 'name',
      label: 'Product',
      render: (p) => (
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', minWidth: 0 }}>
          <AuthImage fileId={p.images[0]} alt={p.name} size={44} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" noWrap>
              {p.name}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              {p.sku}
              {p.huid && ` · HUID ${p.huid}`}
            </Typography>
          </Box>
        </Stack>
      ),
    },
    { key: 'category', label: 'Category', render: (p) => [p.category?.name, p.subcategory?.name].filter(Boolean).join(' › ') },
    { key: 'purity', label: 'Metal', render: (p) => `${METAL_OPTIONS.find((m) => m.value === p.metal)?.label} ${purityLabel(p.metal, p.purity)}` },
    {
      key: 'weight',
      label: 'Gross / Net',
      align: 'right',
      render: (p) => (
        <Box sx={{ whiteSpace: 'nowrap' }}>
          <Typography variant="body2">{formatWeight(p.grossWeightMg)}</Typography>
          <Typography variant="caption" color="textSecondary">
            net {formatWeight(p.netWeightMg)}
            {p.stockType === 'lot' && ` · ${p.quantity} pcs`}
          </Typography>
        </Box>
      ),
    },
    { key: 'branch', label: 'Branch', render: (p) => p.branch?.name },
    { key: 'status', label: 'Status', render: (p) => <ProductStatusChip status={p.status} /> },
  ];

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Your jewellery catalogue: tagged pieces and lots, with weights, stones and hallmark details."
        actions={
          canCreate && (
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => navigate('/products/new')}>
              New product
            </Button>
          )
        }
      />
      {data?.meta?.summary && (
        <SummaryCards>
          <SummaryCard icon={Inventory2OutlinedIcon} label="In stock" value={`${data.meta.summary.inStock.pieces} pcs`} caption={`${data.meta.summary.sold} sold so far`} onClick={() => list.setFilter('status', 'in_stock')} />
          <SummaryCard icon={ScaleOutlinedIcon} label="Stock weight" value={formatWeight(data.meta.summary.inStock.grossMg)} caption={`Fine ${formatWeight(data.meta.summary.inStock.fineMg)}`} tone="blue" />
          {data.meta.summary.inStock.costPaise !== undefined && <SummaryCard icon={CurrencyRupeeOutlinedIcon} label="Stock value" value={formatINR(data.meta.summary.inStock.costPaise, { decimals: 0 })} caption="At cost price" tone="green" />}
          <SummaryCard icon={EditNoteOutlinedIcon} label="Drafts" value={data.meta.summary.drafts} caption={data.meta.summary.drafts ? 'Not yet in stock — tap to see' : 'Nothing waiting'} tone={data.meta.summary.drafts ? 'amber' : 'grey'} onClick={() => list.setFilter('status', 'draft')} />
        </SummaryCards>
      )}
      <DataTable
        columns={[...columns, viewColumn((p) => navigate(`/products/${p.id}`), { name: (p) => p.sku })]}
        rows={data?.items}
        loading={isLoading}
        fetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={
          list.filtered
            ? { title: 'No matching products', description: 'Try a different SKU, HUID, name or filter.' }
            : { title: 'No products yet', description: 'Create your first tagged item to build your catalogue.' }
        }
        pagination={list.pagination(data?.meta)}
        toolbar={
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
            <SearchField value={list.search} onChange={list.setSearch} placeholder="Search name, SKU, barcode or HUID" />
            <TextField select label="Category" value={list.filters.categoryId} onChange={(e) => list.setFilter('categoryId', e.target.value)} slotProps={filterSlots} sx={{ width: { md: 220 }, flexShrink: 0 }}>
              <MenuItem value="">All categories</MenuItem>
              {tree.flatMap((c) => [
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                </MenuItem>,
                ...c.children.map((s) => (
                  <MenuItem key={s.id} value={s.id} sx={{ pl: 4 }}>
                    {s.name}
                  </MenuItem>
                )),
              ])}
            </TextField>
            <TextField select label="Metal" value={list.filters.metal} onChange={(e) => list.setFilter('metal', e.target.value)} slotProps={filterSlots} sx={{ width: { md: 160 }, flexShrink: 0 }}>
              <MenuItem value="">All metals</MenuItem>
              {METAL_OPTIONS.map((m) => (
                <MenuItem key={m.value} value={m.value}>
                  {m.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label="Status" value={list.filters.status} onChange={(e) => list.setFilter('status', e.target.value)} slotProps={filterSlots} sx={{ width: { md: 170 }, flexShrink: 0 }}>
              <MenuItem value="">All statuses</MenuItem>
              {Object.entries(PRODUCT_STATUS_LABELS).map(([value, label]) => (
                <MenuItem key={value} value={value}>
                  {label}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        }
      />
    </>
  );
}
