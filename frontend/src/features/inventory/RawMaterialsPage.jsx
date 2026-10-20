import BuildCircleOutlinedIcon from '@mui/icons-material/BuildCircleOutlined';
import DiamondOutlinedIcon from '@mui/icons-material/DiamondOutlined';
import ScaleOutlinedIcon from '@mui/icons-material/ScaleOutlined';
import { Box, Button, Chip, Stack, Typography } from '@mui/material';
import { formatINR, formatWeight, METAL_POOL_KINDS, MOVEMENT_TYPE_LABELS } from '@jerp/shared';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router';
import DataTable from '../../components/DataTable.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import SummaryCards, { SummaryCard } from '../../components/SummaryCards.jsx';
import ViewTabs from '../../components/ViewTabs.jsx';
import { useTabParam } from '../../hooks/useListParams.js';
import { usePermission } from '../../hooks/usePermission.js';
import { formatDate } from '../../utils/format.js';
import { purityLabel } from '../products/productForm.js';
import ProductionDrawer from './ProductionDrawer.jsx';
import { useProductionsQuery, useStockMovementsQuery, useStockSummaryQuery } from './inventoryApi.js';

const inr = (p) => formatINR(p, { decimals: 0 });
const kindLabel = (k) => METAL_POOL_KINDS.find((x) => x.value === k)?.label ?? k;
const metalName = (m) => m.charAt(0).toUpperCase() + m.slice(1);
const metalPurity = (l) => `${metalName(l.metal)} ${purityLabel(l.metal, l.purity)}`;
const METALS = ['gold', 'silver', 'platinum'];

function StockTab({ pools, showCost, loading, error, onRetry }) {
  return (
    <DataTable
      columns={[
        {
          key: 'metal',
          label: 'Metal',
          render: (p) => (
            <Box>
              <Typography variant="subtitle2">{metalPurity(p)}</Typography>
              <Typography variant="caption" color="textSecondary">
                {kindLabel(p.kind)}
              </Typography>
            </Box>
          ),
        },
        { key: 'branch', label: 'Branch', render: (p) => p.branch?.name ?? '—' },
        { key: 'gross', label: 'Weight', align: 'right', render: (p) => <Typography variant="body2" sx={{ fontWeight: 700 }}>{formatWeight(p.grossMg)}</Typography> },
        { key: 'fine', label: 'Fine (pure)', align: 'right', render: (p) => formatWeight(p.fineMg) },
        ...(showCost
          ? [
              { key: 'rate', label: 'Avg. cost / g', align: 'right', render: (p) => (p.grossMg > 0 ? inr(Math.round((p.valuePaise * 1000) / p.grossMg)) : '—') },
              { key: 'value', label: 'Value', align: 'right', render: (p) => <Typography variant="body2" sx={{ fontWeight: 700 }}>{inr(p.valuePaise)}</Typography> },
            ]
          : []),
      ]}
      rows={pools}
      getRowId={(p) => p.id}
      loading={loading}
      error={error}
      onRetry={onRetry}
      empty={{ title: 'No raw metal in stock', description: 'Bullion, old gold and scrap bought on a purchase bill (Loose metal) show here — not in Products.' }}
    />
  );
}

function MadeTab({ showCost }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, error, refetch } = useProductionsQuery({ page, limit: 20 });
  return (
    <DataTable
      columns={[
        {
          key: 'no',
          label: 'Made on',
          render: (d) => (
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {formatDate(d.businessDate)}
              </Typography>
              <Typography variant="caption" color="textSecondary">
                {d.productionNo}
              </Typography>
            </Box>
          ),
        },
        {
          key: 'metal',
          label: 'Metal used',
          render: (d) => (
            <Stack spacing={0.25}>
              {d.metalUsed.map((l, i) => (
                <Typography key={i} variant="body2" noWrap>
                  {formatWeight(l.grossWeightMg)} · {metalPurity(l)}
                </Typography>
              ))}
            </Stack>
          ),
        },
        {
          key: 'pieces',
          label: 'Pieces made',
          wide: true,
          render: (d) => (
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
              {d.pieces.map((p) => (
                <Chip key={p.productId} size="small" component={RouterLink} to={`/products/${p.productId}`} clickable label={`${p.sku} · ${formatWeight(p.grossWeightMg)}`} sx={{ height: 22 }} />
              ))}
            </Stack>
          ),
        },
        ...(showCost ? [{ key: 'cost', label: 'Cost', align: 'right', render: (d) => <Typography variant="body2" sx={{ fontWeight: 700 }}>{inr(d.totalCostPaise)}</Typography> }] : []),
      ]}
      rows={data?.items}
      loading={isLoading}
      fetching={isFetching}
      error={error}
      onRetry={refetch}
      pagination={data?.meta && { ...data.meta, onPageChange: setPage }}
      empty={{ title: 'Nothing made yet', description: 'Use Make jewellery to turn raw metal into pieces ready to sell.' }}
    />
  );
}

function MovementsTab({ showCost }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, error, refetch } = useStockMovementsQuery({ stock: 'raw', page, limit: 20 });
  return (
    <DataTable
      columns={[
        { key: 'date', label: 'Date', render: (m) => formatDate(m.businessDate) },
        { key: 'type', label: 'What', render: (m) => MOVEMENT_TYPE_LABELS[m.type] ?? m.type },
        { key: 'metal', label: 'Metal', render: (m) => `${metalPurity(m)} · ${kindLabel(m.kind)}` },
        {
          key: 'weight',
          label: 'In / out',
          align: 'right',
          render: (m) => (
            <Typography variant="body2" sx={{ fontWeight: 700, color: m.direction > 0 ? 'success.main' : 'error.main', whiteSpace: 'nowrap' }}>
              {m.direction > 0 ? '+' : '−'}
              {formatWeight(m.grossMg)}
            </Typography>
          ),
        },
        ...(showCost ? [{ key: 'value', label: 'Value', align: 'right', render: (m) => inr(m.valuePaise ?? 0) }] : []),
        { key: 'doc', label: 'Document', render: (m) => m.source?.docNo ?? '—' },
      ]}
      rows={data?.items}
      loading={isLoading}
      fetching={isFetching}
      error={error}
      onRetry={refetch}
      pagination={data?.meta && { ...data.meta, onPageChange: setPage }}
      empty={{ title: 'No metal movements yet' }}
    />
  );
}

/**
 * Raw material: metal bought by weight (bullion, old gold, scrap). It is kept apart from Products — it is not sold as
 * it is — until "Make jewellery" turns some of it into pieces, which then go into Products ready to sell.
 */
export default function RawMaterialsPage() {
  const canMake = usePermission('inventory.adjust');
  const showCost = usePermission('product.viewCost');
  const [tab, setTab] = useTabParam('stock');
  const [making, setMaking] = useState(false);
  const { data, isLoading, error, refetch } = useStockSummaryQuery({});
  const pools = (data?.metalPools ?? []).filter((p) => p.grossMg !== 0);
  const byMetal = METALS.map((m) => ({ metal: m, fine: pools.filter((p) => p.metal === m).reduce((n, p) => n + p.fineMg, 0), gross: pools.filter((p) => p.metal === m).reduce((n, p) => n + p.grossMg, 0) })).filter((m) => m.gross);
  const value = pools.reduce((n, p) => n + (p.valuePaise ?? 0), 0);

  return (
    <>
      <PageHeader
        title="Raw materials"
        subtitle="Bullion, old gold and scrap held by weight — kept apart from the jewellery you sell."
        actions={
          canMake && (
            <Button variant="contained" startIcon={<BuildCircleOutlinedIcon />} onClick={() => setMaking(true)}>
              Make jewellery
            </Button>
          )
        }
      />
      <SummaryCards>
        {byMetal.length ? (
          byMetal.map((m) => <SummaryCard key={m.metal} icon={ScaleOutlinedIcon} label={`Raw ${m.metal}`} value={formatWeight(m.gross)} caption={`${formatWeight(m.fine)} fine (pure)`} tone={m.metal === 'gold' ? 'gold' : 'grey'} />)
        ) : (
          <SummaryCard icon={ScaleOutlinedIcon} label="Raw metal" value="Nil" caption="Buy it on a purchase bill" tone="grey" />
        )}
        {showCost && <SummaryCard icon={DiamondOutlinedIcon} label="Value of raw stock" value={inr(value)} caption="At what it cost" tone="green" />}
      </SummaryCards>
      <ViewTabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'stock', label: 'Stock', count: pools.length },
          { value: 'made', label: 'Made jewellery', short: 'Made' },
          { value: 'movements', label: 'Movements' },
        ]}
      />
      {tab === 'stock' && <StockTab pools={pools} showCost={showCost} loading={isLoading} error={error} onRetry={refetch} />}
      {tab === 'made' && <MadeTab showCost={showCost} />}
      {tab === 'movements' && <MovementsTab showCost={showCost} />}
      <ProductionDrawer open={making} onClose={() => setMaking(false)} pools={pools} />
    </>
  );
}
