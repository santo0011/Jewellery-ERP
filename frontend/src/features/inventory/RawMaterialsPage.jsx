import AddRoundedIcon from '@mui/icons-material/AddRounded';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import BuildCircleOutlinedIcon from '@mui/icons-material/BuildCircleOutlined';
import DiamondOutlinedIcon from '@mui/icons-material/DiamondOutlined';
import ScaleOutlinedIcon from '@mui/icons-material/ScaleOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { Box, Button, Card, CardContent, Chip, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { formatINR, formatWeight, METAL_POOL_KINDS, MOVEMENT_TYPE_LABELS } from '@jerp/shared';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router';
import DataTable from '../../components/DataTable.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import SummaryCards, { SummaryCard } from '../../components/SummaryCards.jsx';
import ViewTabs from '../../components/ViewTabs.jsx';
import { useTabParam } from '../../hooks/useListParams.js';
import { usePermission, useSession } from '../../hooks/usePermission.js';
import { formatDate } from '../../utils/format.js';
import { purityLabel } from '../products/productForm.js';
import ProductionDrawer from './ProductionDrawer.jsx';
import StockEntryDrawer from './StockEntryDrawer.jsx';
import { useProductionsQuery, useStockMovementsQuery, useStockSummaryQuery } from './inventoryApi.js';
import { t } from '../../i18n/index.js';

const inr = (p) => formatINR(p, { decimals: 0 });
const kindLabel = (k) => METAL_POOL_KINDS.find((x) => x.value === k)?.label ?? k;
const metalName = (m) => t(m.charAt(0).toUpperCase() + m.slice(1));
const metalPurity = (l) => `${metalName(l.metal)} ${purityLabel(l.metal, l.purity)}`;
const METALS = ['gold', 'silver', 'platinum'];

function Step({ no, title, text, action }) {
  return (
    <Stack spacing={0.75} sx={{ flex: 1, minWidth: 0 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Box sx={{ width: 24, height: 24, borderRadius: '50%', bgcolor: 'primary.main', color: 'primary.contrastText', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{no}</Box>
        <Typography variant="subtitle2">{title}</Typography>
      </Stack>
      <Typography variant="body2" color="textSecondary">
        {text}
      </Typography>
      {action && <Box>{action}</Box>}
    </Stack>
  );
}

const StepArrow = () => <ArrowForwardRoundedIcon color="disabled" sx={{ display: { xs: 'none', md: 'block' }, alignSelf: 'center', flexShrink: 0 }} />;

/** The whole page in three steps: metal comes in → Make jewellery → the pieces are in Products, ready to sell. */
function HowItWorks({ canBuy, canMake, onAddGold, onMake }) {
  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <Step
            no="1"
            title={t('Metal comes in')}
            text={t('Old gold from customers, or bullion / scrap you buy, is kept here by weight.')}
            action={
              (canMake || canBuy) && (
                <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
                  {canMake && (
                    <Button size="small" variant="contained" startIcon={<AddRoundedIcon />} onClick={onAddGold}>
                      {t('Add gold')}
                    </Button>
                  )}
                  {canBuy && (
                    <Button size="small" variant="outlined" component={RouterLink} to="/purchases/new">
                      {t('New purchase')}
                    </Button>
                  )}
                </Stack>
              )
            }
          />
          <StepArrow />
          <Step
            no="2"
            title={t('Make jewellery')}
            text={t('The karigar makes pieces from it: enter the metal used and the pieces made.')}
            action={
              canMake && (
                <Button size="small" variant="outlined" onClick={onMake}>
                  {t('Make jewellery')}
                </Button>
              )
            }
          />
          <StepArrow />
          <Step
            no="3"
            title={t('Ready to sell')}
            text={t('The metal comes off this stock and the pieces go into Products.')}
          />
        </Stack>
      </CardContent>
    </Card>
  );
}

function StockTab({ pools, showCost, showBranch, loading, error, onRetry }) {
  return (
    <DataTable
      columns={[
        {
          key: 'metal',
          label: t('Metal'),
          render: (p) => (
            <Box>
              <Typography variant="subtitle2">{metalPurity(p)}</Typography>
              <Typography variant="caption" color="textSecondary">
                {kindLabel(p.kind)}
              </Typography>
            </Box>
          ),
        },
        // One shop: every row is the same branch, so the column is left out.
        ...(showBranch ? [{ key: 'branch', label: t('Branch'), render: (p) => p.branch?.name ?? '—' }] : []),
        {
          key: 'gross',
          label: t('Weight'),
          align: 'right',
          render: (p) => (
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {formatWeight(p.grossMg)}
              </Typography>
              <Typography variant="caption" color="textSecondary">
                {t('{{fine}} fine (pure)', { fine: formatWeight(p.fineMg) })}
              </Typography>
            </Box>
          ),
        },
        ...(showCost
          ? [
              {
                key: 'value',
                label: t('Value'),
                align: 'right',
                render: (p) => (
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {inr(p.valuePaise)}
                    </Typography>
                    {p.grossMg > 0 && (
                      <Typography variant="caption" color="textSecondary">
                        {t('{{rate}}/g', { rate: inr(Math.round((p.valuePaise * 1000) / p.grossMg)) })}
                      </Typography>
                    )}
                  </Box>
                ),
              },
            ]
          : []),
      ]}
      rows={pools}
      getRowId={(p) => p.id}
      loading={loading}
      error={error}
      onRetry={onRetry}
      empty={{ title: t('No raw metal in stock'), description: t('Take old gold from a customer, or buy bullion on a purchase bill (Loose metal) — it shows here.') }}
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
          label: t('Made on'),
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
          label: t('Metal used'),
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
          label: t('Pieces made'),
          wide: true,
          render: (d) => (
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
              {d.pieces.map((p) => (
                <Chip key={p.productId} size="small" component={RouterLink} to={`/products/${p.productId}`} clickable label={`${p.sku} · ${formatWeight(p.grossWeightMg)}`} sx={{ height: 22 }} />
              ))}
            </Stack>
          ),
        },
        ...(showCost ? [{ key: 'cost', label: t('Cost'), align: 'right', render: (d) => <Typography variant="body2" sx={{ fontWeight: 700 }}>{inr(d.totalCostPaise)}</Typography> }] : []),
      ]}
      rows={data?.items}
      loading={isLoading}
      fetching={isFetching}
      error={error}
      onRetry={refetch}
      pagination={data?.meta && { ...data.meta, onPageChange: setPage }}
      empty={{ title: t('Nothing made yet'), description: t('Use Make jewellery to turn raw metal into pieces ready to sell.') }}
    />
  );
}

function MovementsTab({ showCost, onEdit }) {
  const [page, setPage] = useState(1);
  const { data, isLoading, isFetching, error, refetch } = useStockMovementsQuery({ stock: 'raw', page, limit: 20 });
  return (
    <DataTable
      columns={[
        { key: 'date', label: t('Date'), render: (m) => formatDate(m.businessDate) },
        { key: 'type', label: t('What'), render: (m) => MOVEMENT_TYPE_LABELS[m.type] ?? m.type },
        { key: 'metal', label: t('Metal'), render: (m) => `${metalPurity(m)} · ${kindLabel(m.kind)}` },
        {
          key: 'weight',
          label: t('In / out'),
          align: 'right',
          render: (m) => (
            <Typography variant="body2" sx={{ fontWeight: 700, color: m.direction > 0 ? 'success.main' : 'error.main', whiteSpace: 'nowrap' }}>
              {m.direction > 0 ? '+' : '−'}
              {formatWeight(m.grossMg)}
            </Typography>
          ),
        },
        ...(showCost ? [{ key: 'value', label: t('Value'), align: 'right', render: (m) => inr(m.valuePaise ?? 0) }] : []),
        { key: 'doc', label: t('Document'), render: (m) => m.source?.docNo ?? '—' },
        // Gold added as opening stock can be corrected (the form says when it no longer can).
        ...(onEdit
          ? [
              {
                key: 'edit',
                label: '',
                align: 'right',
                width: 56,
                render: (m) =>
                  m.type === 'opening' &&
                  m.source?.docType === 'stock_entry' && (
                    <Tooltip title={t('Edit')}>
                      <IconButton size="small" onClick={() => onEdit(m.source.docId)} aria-label={t('Edit {{name}}', { name: m.source.docNo })}>
                        <EditOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  ),
              },
            ]
          : []),
      ]}
      rows={data?.items}
      loading={isLoading}
      fetching={isFetching}
      error={error}
      onRetry={refetch}
      pagination={data?.meta && { ...data.meta, onPageChange: setPage }}
      empty={{ title: t('No metal movements yet') }}
    />
  );
}

/**
 * Raw material: metal bought by weight (bullion, old gold, scrap). It is kept apart from Products — it is not sold as
 * it is — until "Make jewellery" turns some of it into pieces, which then go into Products ready to sell.
 */
export default function RawMaterialsPage() {
  const canMake = usePermission('inventory.adjust');
  const canBuy = usePermission('purchase.create');
  const showCost = usePermission('product.viewCost');
  const { data: session } = useSession();
  const [tab, setTab] = useTabParam('stock');
  const [making, setMaking] = useState(false);
  const [addingGold, setAddingGold] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const { data, isLoading, error, refetch } = useStockSummaryQuery({});
  const pools = (data?.metalPools ?? []).filter((p) => p.grossMg !== 0);
  const byMetal = METALS.map((m) => ({ metal: m, fine: pools.filter((p) => p.metal === m).reduce((n, p) => n + p.fineMg, 0), gross: pools.filter((p) => p.metal === m).reduce((n, p) => n + p.grossMg, 0) })).filter((m) => m.gross);
  const value = pools.reduce((n, p) => n + (p.valuePaise ?? 0), 0);

  return (
    <>
      <PageHeader
        title={t('Raw materials')}
        subtitle={t('Gold and silver not made into jewellery yet — old gold, bullion and scrap.')}
        actions={
          canMake && (
            <Stack direction="row" spacing={1}>
              <Button variant="outlined" startIcon={<AddRoundedIcon />} onClick={() => setAddingGold(true)}>
                {t('Add gold')}
              </Button>
              <Button variant="contained" startIcon={<BuildCircleOutlinedIcon />} onClick={() => setMaking(true)}>
                {t('Make jewellery')}
              </Button>
            </Stack>
          )
        }
      />
      <SummaryCards>
        {byMetal.length ? (
          byMetal.map((m) => <SummaryCard key={m.metal} icon={ScaleOutlinedIcon} label={t('Raw {{metal}}', { metal: m.metal })} value={formatWeight(m.gross)} caption={t('{{fine}} fine (pure)', { fine: formatWeight(m.fine) })} tone={m.metal === 'gold' ? 'gold' : 'grey'} />)
        ) : (
          <SummaryCard icon={ScaleOutlinedIcon} label={t('Raw metal')} value={t('Nil')} caption={t('Buy it on a purchase bill')} tone="grey" />
        )}
        {showCost && <SummaryCard icon={DiamondOutlinedIcon} label={t('Value of raw stock')} value={inr(value)} caption={t('At what it cost')} tone="green" />}
      </SummaryCards>
      <HowItWorks canBuy={canBuy} canMake={canMake} onAddGold={() => setAddingGold(true)} onMake={() => setMaking(true)} />
      <ViewTabs
        value={tab}
        onChange={setTab}
        items={[
          { value: 'stock', label: t('In stock'), count: pools.length },
          { value: 'made', label: t('Made jewellery'), short: t('Made') },
          { value: 'movements', label: t('In / out history'), short: t('History') },
        ]}
      />
      {tab === 'stock' && <StockTab pools={pools} showCost={showCost} showBranch={session.branches.length > 1} loading={isLoading} error={error} onRetry={refetch} />}
      {tab === 'made' && <MadeTab showCost={showCost} />}
      {tab === 'movements' && <MovementsTab showCost={showCost} onEdit={canMake ? setEditingId : null} />}
      <ProductionDrawer open={making} onClose={() => setMaking(false)} pools={pools} onAddGold={() => (setMaking(false), setAddingGold(true))} />
      <StockEntryDrawer mode="opening" metalOnly open={addingGold} onClose={() => setAddingGold(false)} />
      <StockEntryDrawer mode="opening" metalOnly editId={editingId} open={Boolean(editingId)} onClose={() => setEditingId(null)} />
    </>
  );
}
