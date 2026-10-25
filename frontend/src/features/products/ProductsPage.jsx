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
import RowActions, { actionsWidth } from '../../components/RowActions.jsx';
import { useDeleteStatus } from '../../services/recordApi.js';
import { t } from '../../i18n/index.js';

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
  const canEdit = usePermission('product.edit');
  const list = useListParams({ categoryId: '', metal: '', status: '' });
  const { data, isLoading, isFetching, error, refetch } = useProductListQuery(list.params);
  // Which rows can be deleted (Delete stays visible; it is disabled with the reason when not).
  const deleteStatus = useDeleteStatus('product', data?.items);
  const { data: categories = [] } = useCategoriesQuery();
  const tree = buildCategoryTree(categories);

  const columns = [
    {
      key: 'name',
      label: t('Product'),
      render: (p) => (
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', minWidth: 0 }}>
          <AuthImage fileId={p.images[0]} alt={p.name} size={44} />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" noWrap>
              {p.name}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              {p.sku}
              {p.huid && t(' · HUID {{huid}}', { huid: p.huid })}
            </Typography>
          </Box>
        </Stack>
      ),
    },
    { key: 'category', label: t('Category'), render: (p) => [p.category?.name, p.subcategory?.name].filter(Boolean).join(' › ') },
    { key: 'purity', label: t('Metal'), render: (p) => `${METAL_OPTIONS.find((m) => m.value === p.metal)?.label} ${purityLabel(p.metal, p.purity)}` },
    {
      key: 'weight',
      label: t('Gross / Net'),
      align: 'right',
      render: (p) => (
        <Box sx={{ whiteSpace: 'nowrap' }}>
          <Typography variant="body2">{formatWeight(p.grossWeightMg)}</Typography>
          <Typography variant="caption" color="textSecondary">
            {t('net {{netWeight}}', { netWeight: formatWeight(p.netWeightMg) })}
            {p.stockType === 'lot' && t(' · {{quantity}} pcs', { quantity: p.quantity })}
          </Typography>
        </Box>
      ),
    },
    { key: 'branch', label: t('Branch'), render: (p) => p.branch?.name },
    { key: 'status', label: t('Status'), render: (p) => <ProductStatusChip status={p.status} /> },
  ];

  return (
    <>
      <PageHeader
        title={t('Products')}
        subtitle={t('Your jewellery catalogue: tagged pieces and lots, with weights, stones and hallmark details.')}
        actions={
          canCreate && (
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => navigate('/products/new')}>
              {t('New product')}
            </Button>
          )
        }
      />
      {data?.meta?.summary && (
        <SummaryCards>
          <SummaryCard icon={Inventory2OutlinedIcon} label={t('In stock')} value={t('{{pieces}} pcs', { pieces: data.meta.summary.inStock.pieces })} caption={t('{{sold}} sold so far', { sold: data.meta.summary.sold })} onClick={() => list.setFilter('status', 'in_stock')} />
          <SummaryCard icon={ScaleOutlinedIcon} label={t('Stock weight')} value={formatWeight(data.meta.summary.inStock.grossMg)} caption={t('Fine {{fine}}', { fine: formatWeight(data.meta.summary.inStock.fineMg) })} tone="blue" />
          {data.meta.summary.inStock.costPaise !== undefined && <SummaryCard icon={CurrencyRupeeOutlinedIcon} label={t('Stock value')} value={formatINR(data.meta.summary.inStock.costPaise, { decimals: 0 })} caption={t('At cost price')} tone="green" />}
          <SummaryCard icon={EditNoteOutlinedIcon} label={t('Drafts')} value={data.meta.summary.drafts} caption={data.meta.summary.drafts ? t('Not yet in stock — tap to see') : t('Nothing waiting')} tone={data.meta.summary.drafts ? 'amber' : 'grey'} onClick={() => list.setFilter('status', 'draft')} />
        </SummaryCards>
      )}
      <DataTable
        columns={[
          ...columns,
          {
            key: 'actions',
            label: t('Action'),
            align: 'right',
            width: actionsWidth(3),
            // Only draft pieces can be deleted; stocked ones leave through a sale, return or adjustment.
            render: (p) => (
              <RowActions
                onView={() => navigate(`/products/${p.id}`)}
                onEdit={canEdit ? () => navigate(`/products/${p.id}/edit`) : undefined}
                deleteType="product"
                deleteStatus={deleteStatus(p.id)}
                id={p.id}
                name={p.sku}
              />
            ),
          },
        ]}
        rows={data?.items}
        loading={isLoading}
        fetching={isFetching}
        error={error}
        onRetry={refetch}
        empty={
          list.filtered
            ? { title: t('No matching products'), description: t('Try a different SKU, HUID, name or filter.') }
            : { title: t('No products yet'), description: t('Create your first tagged item to build your catalogue.') }
        }
        pagination={list.pagination(data?.meta)}
        toolbar={
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
            <SearchField value={list.search} onChange={list.setSearch} placeholder={t('Search name, SKU, barcode or HUID')} />
            <TextField select label={t('Category')} value={list.filters.categoryId} onChange={(e) => list.setFilter('categoryId', e.target.value)} slotProps={filterSlots} sx={{ width: { md: 220 }, flexShrink: 0 }}>
              <MenuItem value="">{t('All categories')}</MenuItem>
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
            <TextField select label={t('Metal')} value={list.filters.metal} onChange={(e) => list.setFilter('metal', e.target.value)} slotProps={filterSlots} sx={{ width: { md: 160 }, flexShrink: 0 }}>
              <MenuItem value="">{t('All metals')}</MenuItem>
              {METAL_OPTIONS.map((m) => (
                <MenuItem key={m.value} value={m.value}>
                  {m.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField select label={t('Status')} value={list.filters.status} onChange={(e) => list.setFilter('status', e.target.value)} slotProps={filterSlots} sx={{ width: { md: 170 }, flexShrink: 0 }}>
              <MenuItem value="">{t('All statuses')}</MenuItem>
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
