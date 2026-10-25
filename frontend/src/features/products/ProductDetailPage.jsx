import { Alert, Box, Button, Card, CardContent, Grid, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { formatINR, formatPercent, formatWeight, JEWELLERY_TYPES, METAL_OPTIONS, STONE_TYPES } from '@jerp/shared';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import BarcodeView from '../../components/BarcodeView.jsx';
import DataTable from '../../components/DataTable.jsx';
import { useStockMovementsQuery } from '../inventory/inventoryApi.js';
import StockEntryDrawer from '../inventory/StockEntryDrawer.jsx';
import { MovementDetailsDrawer, movementColumns } from '../inventory/movements.jsx';
import InfoCard from '../../components/InfoCard.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import RecordHistory from '../../components/RecordHistory.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import { usePermission, useSession } from '../../hooks/usePermission.js';
import { formatDate } from '../../utils/format.js';
import { useProductQuery } from './productApi.js';
import { purityLabel } from './productForm.js';
import ProductImages from './ProductImages.jsx';
import { ProductStatusChip } from './ProductsPage.jsx';
import { t } from '../../i18n/index.js';

const label = (list, value) => list.find((o) => o.value === value)?.label ?? value;

function describeWastage({ mode, value }) {
  if (mode === 'percent') return t('{{formatPercent}} of net weight', { formatPercent: formatPercent(value) });
  if (mode === 'weight') return formatWeight(value);
  return t('None');
}

function describeMaking({ type, value }) {
  if (type === 'percent') return t('{{formatPercent}} of metal value', { formatPercent: formatPercent(value) });
  if (type === 'per_gram') return t('{{formatINR}} per gram', { formatINR: formatINR(value) });
  return t('{{formatINR}} per piece', { formatINR: formatINR(value) });
}

export default function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [viewingMovement, setViewingMovement] = useState(null);
  const { data: session } = useSession();
  const canEdit = usePermission('product.edit');
  const canSeeCost = usePermission('product.viewCost');
  const { data: p, isLoading, error, refetch } = useProductQuery(id);
  const [stocking, setStocking] = useState(false);
  const canStock = usePermission('inventory.adjust');
  const canSeeStock = usePermission('inventory.view');
  const movements = useStockMovementsQuery({ productId: id, page: 1, limit: 50 }, { skip: !canSeeStock });

  if (isLoading) return <LoadingState label={t('Loading product')} />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const missingHuid = p.metal === 'gold' && session.catalog.huidMandatory && !p.huid;

  return (
    <>
      <PageHeader
        back={{ to: '/products', label: t('Products') }}
        title={p.name}
        subtitle={
          <Stack component="span" direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <span>{p.sku}</span>
            <ProductStatusChip status={p.status} />
          </Stack>
        }
        breadcrumbs={[{ label: t('Products'), to: '/products' }, { label: p.sku }]}
        actions={
          <>
            {canStock && p.status === 'draft' && (
              <Button variant="outlined" color="secondary" startIcon={<Inventory2OutlinedIcon />} onClick={() => setStocking(true)}>
                {t('Add to stock')}
              </Button>
            )}
          </>
        }
      />
      {p.status === 'draft' && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('Draft: this item is in the catalogue but not yet in stock. It enters stock through an opening-stock or purchase entry.')}
        </Alert>
      )}
      {missingHuid && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {t('HUID is missing. Hallmarked gold cannot be sold without it.')}
        </Alert>
      )}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 5, lg: 4 }}>
          <Stack spacing={2}>
            <Card>
              <CardContent>
                <ProductImages product={p} canEdit={canEdit} />
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <Typography variant="overline" color="textSecondary">
                  {t('Barcode')}
                </Typography>
                <Box sx={{ mt: 1 }}>
                  <BarcodeView value={p.barcode} symbology={session.catalog.barcodeSymbology} />
                </Box>
                <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 1 }}>
                  {t('Scan this at the counter. Label printing arrives with the POS.')}
                </Typography>
              </CardContent>
            </Card>
          </Stack>
        </Grid>
        <Grid size={{ xs: 12, md: 7, lg: 8 }}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, lg: 6 }}>
              <InfoCard
                title={t('Metal & weight')}
                items={[
                  { label: t('Metal'), value: `${label(METAL_OPTIONS, p.metal)} ${purityLabel(p.metal, p.purity)}` },
                  { label: t('Gross weight'), value: formatWeight(p.grossWeightMg) },
                  { label: t('Stone weight'), value: formatWeight(p.stoneWeightMg) },
                  { label: t('Net weight'), value: <Box component="span" sx={{ color: 'accent.main', fontWeight: 700 }}>{formatWeight(p.netWeightMg)}</Box> },
                  { label: t('Fine weight'), value: formatWeight(p.fineWeightMg) },
                  { label: t('Stock type'), value: p.stockType === 'lot' ? t('Lot of {{quantity}} pieces', { quantity: p.quantity }) : t('Tagged piece') },
                ]}
              />
            </Grid>
            <Grid size={{ xs: 12, lg: 6 }}>
              <InfoCard
                title={t('Classification')}
                items={[
                  { label: t('Category'), value: [p.category?.name, p.subcategory?.name].filter(Boolean).join(' › ') },
                  { label: t('Type'), value: label(JEWELLERY_TYPES, p.jewelleryType) },
                  { label: t('Branch'), value: p.branch?.name },
                  { label: t('Supplier'), value: p.supplier && `${p.supplier.name} (${p.supplier.code})` },
                  { label: t('Tags'), value: p.tags.join(', ') },
                ]}
              />
            </Grid>
            <Grid size={{ xs: 12, lg: 6 }}>
              <InfoCard
                title={t('Making & pricing')}
                items={[
                  { label: t('Wastage'), value: describeWastage(p.wastage) },
                  { label: t('Making'), value: describeMaking(p.making) },
                  { label: t('Other charges'), value: p.otherChargePaise ? formatINR(p.otherChargePaise) : null },
                  { label: t('Pricing'), value: p.pricingMode === 'fixed' ? t('Fixed {{fixedPrice}}', { fixedPrice: formatINR(p.fixedPricePaise) }) : t('Daily metal rate') },
                  { label: t('Cost price'), value: p.costPricePaise ? formatINR(p.costPricePaise) : null, hidden: !canSeeCost },
                  { label: t('HSN'), value: p.hsnCode },
                ]}
              />
            </Grid>
            <Grid size={{ xs: 12, lg: 6 }}>
              <InfoCard
                title={t('Hallmark & certification')}
                items={[
                  { label: t('HUID'), value: p.huid },
                  { label: t('Hallmark centre'), value: p.hallmarkCentre },
                  { label: t('Hallmark date'), value: p.hallmarkDate && formatDate(p.hallmarkDate) },
                  { label: t('Certificate'), value: p.certificateNo },
                  { label: t('Description'), value: p.description },
                ]}
              />
            </Grid>
            {p.stones.length > 0 && (
              <Grid size={12}>
                <InfoCard title={t('Stones')}>
                  <Box sx={{ overflowX: 'auto' }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>{t('Stone')}</TableCell>
                          <TableCell align="right">{t('Pieces')}</TableCell>
                          <TableCell align="right">{t('Weight')}</TableCell>
                          <TableCell align="right">{t('Rate')}</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {p.stones.map((s, i) => (
                          <TableRow key={i}>
                            <TableCell>
                              {label(STONE_TYPES, s.type)}
                              {s.name && (
                                <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>
                                  {s.name}
                                </Typography>
                              )}
                            </TableCell>
                            <TableCell align="right">{s.count}</TableCell>
                            <TableCell align="right">{s.weightUnit === 'ct' ? t('{{value}} ct', { value: (s.weight / 1000).toFixed(3) }) : formatWeight(s.weight)}</TableCell>
                            <TableCell align="right">{s.ratePaise ? `${formatINR(s.ratePaise)}/${s.weightUnit === 'ct' ? 'ct' : 'g'}` : '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Box>
                </InfoCard>
              </Grid>
            )}
            <Grid size={12}>
              <RecordHistory recordId={id} />
            </Grid>
          </Grid>
        </Grid>
      </Grid>
      {canSeeStock && p.status !== 'draft' && (
        // Full page width: the movement table has many columns.
        <Box sx={{ mt: 3 }}>
          <Typography variant="overline" color="textSecondary" sx={{ display: 'block', mb: 1 }}>
            {t('Stock movements')}
          </Typography>
          <DataTable
            columns={movementColumns({ showProduct: false, onView: setViewingMovement })}
            rows={movements.data?.items}
            loading={movements.isLoading}
            error={movements.error}
            onRetry={movements.refetch}
            empty={{ title: t('No movements yet') }}
          />
        </Box>
      )}
      <StockEntryDrawer mode="opening" open={stocking} onClose={() => setStocking(false)} initialProducts={[p]} />
      <MovementDetailsDrawer movement={viewingMovement} onClose={() => setViewingMovement(null)} showCost={canSeeCost} />
    </>
  );
}
