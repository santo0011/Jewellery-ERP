import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import { Alert, Box, Button, Card, CardContent, Grid, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { formatINR, formatPercent, formatWeight, JEWELLERY_TYPES, METAL_OPTIONS, STONE_TYPES } from '@jerp/shared';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import BarcodeView from '../../components/BarcodeView.jsx';
import DataTable from '../../components/DataTable.jsx';
import { useStockMovementsQuery } from '../inventory/inventoryApi.js';
import StockEntryDrawer from '../inventory/StockEntryDrawer.jsx';
import { MovementDetailsDrawer, movementColumns } from '../inventory/movements.jsx';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import InfoCard from '../../components/InfoCard.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import RecordHistory from '../../components/RecordHistory.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import { usePermission, useSession } from '../../hooks/usePermission.js';
import { formatDate } from '../../utils/format.js';
import { getErrorMessage } from '../../utils/errors.js';
import { useDeleteProductMutation, useProductQuery } from './productApi.js';
import { purityLabel } from './productForm.js';
import ProductImages from './ProductImages.jsx';
import { ProductStatusChip } from './ProductsPage.jsx';

const label = (list, value) => list.find((o) => o.value === value)?.label ?? value;

function describeWastage({ mode, value }) {
  if (mode === 'percent') return `${formatPercent(value)} of net weight`;
  if (mode === 'weight') return formatWeight(value);
  return 'None';
}

function describeMaking({ type, value }) {
  if (type === 'percent') return `${formatPercent(value)} of metal value`;
  if (type === 'per_gram') return `${formatINR(value)} per gram`;
  return `${formatINR(value)} per piece`;
}

export default function ProductDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [viewingMovement, setViewingMovement] = useState(null);
  const { data: session } = useSession();
  const canEdit = usePermission('product.edit');
  const canDelete = usePermission('product.delete');
  const canSeeCost = usePermission('product.viewCost');
  const { data: p, isLoading, error, refetch } = useProductQuery(id);
  const [remove, { isLoading: deleting }] = useDeleteProductMutation();
  const [confirm, setConfirm] = useState(false);
  const [stocking, setStocking] = useState(false);
  const canStock = usePermission('inventory.adjust');
  const canSeeStock = usePermission('inventory.view');
  const movements = useStockMovementsQuery({ productId: id, page: 1, limit: 50 }, { skip: !canSeeStock });

  if (isLoading) return <LoadingState label="Loading product" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const onDelete = async () => {
    try {
      await remove(id).unwrap();
      toast.success('Product deleted');
      navigate('/products', { replace: true });
    } catch (err) {
      toast.error(getErrorMessage(err));
      setConfirm(false);
    }
  };

  const missingHuid = p.metal === 'gold' && session.catalog.huidMandatory && !p.huid;

  return (
    <>
      <PageHeader
        back={{ to: '/products', label: 'Products' }}
        title={p.name}
        subtitle={
          <Stack component="span" direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <span>{p.sku}</span>
            <ProductStatusChip status={p.status} />
          </Stack>
        }
        breadcrumbs={[{ label: 'Products', to: '/products' }, { label: p.sku }]}
        actions={
          <>
            {canEdit && (
              <Button variant="contained" startIcon={<EditOutlinedIcon />} onClick={() => navigate(`/products/${id}/edit`)}>
                Edit
              </Button>
            )}
            {canStock && p.status === 'draft' && (
              <Button variant="outlined" color="secondary" startIcon={<Inventory2OutlinedIcon />} onClick={() => setStocking(true)}>
                Add to stock
              </Button>
            )}
            {canDelete && p.status === 'draft' && (
              <Button color="error" startIcon={<DeleteOutlineRoundedIcon />} onClick={() => setConfirm(true)}>
                Delete
              </Button>
            )}
          </>
        }
      />
      {p.status === 'draft' && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Draft: this item is in the catalogue but not yet in stock. It enters stock through an opening-stock or purchase entry.
        </Alert>
      )}
      {missingHuid && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          HUID is missing. Hallmarked gold cannot be sold without it.
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
                  Barcode
                </Typography>
                <Box sx={{ mt: 1 }}>
                  <BarcodeView value={p.barcode} symbology={session.catalog.barcodeSymbology} />
                </Box>
                <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 1 }}>
                  Scan this at the counter. Label printing arrives with the POS.
                </Typography>
              </CardContent>
            </Card>
          </Stack>
        </Grid>
        <Grid size={{ xs: 12, md: 7, lg: 8 }}>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, lg: 6 }}>
              <InfoCard
                title="Metal & weight"
                items={[
                  { label: 'Metal', value: `${label(METAL_OPTIONS, p.metal)} ${purityLabel(p.metal, p.purity)}` },
                  { label: 'Gross weight', value: formatWeight(p.grossWeightMg) },
                  { label: 'Stone weight', value: formatWeight(p.stoneWeightMg) },
                  { label: 'Net weight', value: <Box component="span" sx={{ color: 'accent.main', fontWeight: 700 }}>{formatWeight(p.netWeightMg)}</Box> },
                  { label: 'Fine weight', value: formatWeight(p.fineWeightMg) },
                  { label: 'Stock type', value: p.stockType === 'lot' ? `Lot of ${p.quantity} pieces` : 'Tagged piece' },
                ]}
              />
            </Grid>
            <Grid size={{ xs: 12, lg: 6 }}>
              <InfoCard
                title="Classification"
                items={[
                  { label: 'Category', value: [p.category?.name, p.subcategory?.name].filter(Boolean).join(' › ') },
                  { label: 'Type', value: label(JEWELLERY_TYPES, p.jewelleryType) },
                  { label: 'Branch', value: p.branch?.name },
                  { label: 'Supplier', value: p.supplier && `${p.supplier.name} (${p.supplier.code})` },
                  { label: 'Tags', value: p.tags.join(', ') },
                ]}
              />
            </Grid>
            <Grid size={{ xs: 12, lg: 6 }}>
              <InfoCard
                title="Making & pricing"
                items={[
                  { label: 'Wastage', value: describeWastage(p.wastage) },
                  { label: 'Making', value: describeMaking(p.making) },
                  { label: 'Other charges', value: p.otherChargePaise ? formatINR(p.otherChargePaise) : null },
                  { label: 'Pricing', value: p.pricingMode === 'fixed' ? `Fixed ${formatINR(p.fixedPricePaise)}` : 'Daily metal rate' },
                  { label: 'Cost price', value: p.costPricePaise ? formatINR(p.costPricePaise) : null, hidden: !canSeeCost },
                  { label: 'HSN', value: p.hsnCode },
                ]}
              />
            </Grid>
            <Grid size={{ xs: 12, lg: 6 }}>
              <InfoCard
                title="Hallmark & certification"
                items={[
                  { label: 'HUID', value: p.huid },
                  { label: 'Hallmark centre', value: p.hallmarkCentre },
                  { label: 'Hallmark date', value: p.hallmarkDate && formatDate(p.hallmarkDate) },
                  { label: 'Certificate', value: p.certificateNo },
                  { label: 'Description', value: p.description },
                ]}
              />
            </Grid>
            {p.stones.length > 0 && (
              <Grid size={12}>
                <InfoCard title="Stones">
                  <Box sx={{ overflowX: 'auto' }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Stone</TableCell>
                          <TableCell align="right">Pieces</TableCell>
                          <TableCell align="right">Weight</TableCell>
                          <TableCell align="right">Rate</TableCell>
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
                            <TableCell align="right">{s.weightUnit === 'ct' ? `${(s.weight / 1000).toFixed(3)} ct` : formatWeight(s.weight)}</TableCell>
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
            Stock movements
          </Typography>
          <DataTable
            columns={movementColumns({ showProduct: false, onView: setViewingMovement })}
            rows={movements.data?.items}
            loading={movements.isLoading}
            error={movements.error}
            onRetry={movements.refetch}
            empty={{ title: 'No movements yet' }}
          />
        </Box>
      )}
      <StockEntryDrawer mode="opening" open={stocking} onClose={() => setStocking(false)} initialProducts={[p]} />
      <ConfirmDialog
        open={confirm}
        title={`Delete ${p.name}?`}
        message="Draft products can be deleted. Photos are removed too."
        confirmLabel="Delete"
        danger
        loading={deleting}
        onConfirm={onDelete}
        onClose={() => setConfirm(false)}
      />
      <MovementDetailsDrawer movement={viewingMovement} onClose={() => setViewingMovement(null)} showCost={canSeeCost} />
    </>
  );
}
