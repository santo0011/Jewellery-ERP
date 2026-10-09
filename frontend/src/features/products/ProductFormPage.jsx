import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { Alert, Box, Button, Card, CardContent, Divider, Grid, IconButton, InputAdornment, Paper, Stack, Typography } from '@mui/material';
import { deriveWeights, formatWeight, JEWELLERY_TYPES, METAL_OPTIONS, PURITIES, STONE_TYPES } from '@jerp/shared';
import { productSchema } from '@jerp/shared/schemas';
import { useEffect, useMemo } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router';
import RHFSelect from '../../components/form/RHFSelect.jsx';
import RHFTextField from '../../components/form/RHFTextField.jsx';
import MoreDetails from '../../components/MoreDetails.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import { usePermission, useSession } from '../../hooks/usePermission.js';
import { applyServerErrors, getErrorMessage } from '../../utils/errors.js';
import { buildCategoryTree, useCategoriesQuery } from '../categories/categoryApi.js';
import { useSupplierListQuery } from '../suppliers/supplierApi.js';
import { useCreateProductMutation, useProductQuery, useUpdateProductMutation } from './productApi.js';
import { emptyProduct, FieldError, formToProduct, productToForm, safeWeights } from './productForm.js';

const upper = (v) => v.toUpperCase();
const adorn = (text, position = 'end') => ({ input: { [`${position}Adornment`]: <InputAdornment position={position}>{text}</InputAdornment> }, htmlInput: { inputMode: 'decimal' } });

function Section({ title, description, children }) {
  return (
    <Card>
      <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
        <Typography variant="h4">{title}</Typography>
        {description && (
          <Typography variant="body2" color="textSecondary" sx={{ mt: 0.5 }}>
            {description}
          </Typography>
        )}
        <Divider sx={{ my: 2 }} />
        {children}
      </CardContent>
    </Card>
  );
}

function WeightSummary({ control }) {
  const [gross, stones, purity, metal] = useWatch({ control, name: ['grossWeightMg', 'stones', 'purity', 'metal'] });
  const parsed = safeWeights({ grossWeightMg: gross, stones, purity });
  const w = parsed ? deriveWeights(parsed) : null;
  const row = (label, value, strong) => (
    <Stack direction="row" sx={{ justifyContent: 'space-between', py: 0.75 }}>
      <Typography variant="body2" color="textSecondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: strong ? 700 : 500, color: strong ? 'accent.main' : 'text.primary' }}>
        {value}
      </Typography>
    </Stack>
  );
  return (
    <Card sx={{ position: { lg: 'sticky' }, top: { lg: 88 } }}>
      <CardContent>
        <Typography variant="overline" color="textSecondary">
          Weight summary
        </Typography>
        {!w ? (
          <Typography variant="body2" color="error" sx={{ mt: 1 }}>
            Check the weights entered
          </Typography>
        ) : (
          <Box sx={{ mt: 1 }}>
            {row('Gross', formatWeight(parsed.grossWeightMg))}
            {row('Stones', `− ${formatWeight(w.stoneWeightMg)}`)}
            <Divider />
            {row('Net', formatWeight(w.netWeightMg), true)}
            {row(`Fine (${PURITIES[metal]?.find((p) => p.fineness === Number(purity))?.label ?? '—'})`, formatWeight(w.fineWeightMg))}
            {w.netWeightMg < 0 && (
              <Typography variant="caption" color="error">
                Stones weigh more than the item
              </Typography>
            )}
          </Box>
        )}
        <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 1.5 }}>
          1 carat = 0.2 g. The server recalculates and stores these on save.
        </Typography>
      </CardContent>
    </Card>
  );
}

function Stones({ control }) {
  const { fields, append, remove } = useFieldArray({ control, name: 'stones' });
  const stones = useWatch({ control, name: 'stones' });
  return (
    <Stack spacing={2}>
      {fields.map((field, i) => (
        <Paper key={field.id} variant="outlined" sx={{ p: 2 }}>
          <Grid container spacing={1.5}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <RHFSelect control={control} name={`stones.${i}.type`} label="Stone" options={STONE_TYPES} />
            </Grid>
            <Grid size={{ xs: 12, sm: 8 }}>
              <RHFTextField control={control} name={`stones.${i}.name`} label="Description" placeholder="e.g. VVS1 round brilliant" />
            </Grid>
            <Grid size={{ xs: 4, sm: 2 }}>
              <RHFTextField control={control} name={`stones.${i}.count`} label="Pieces" slotProps={{ htmlInput: { inputMode: 'numeric' } }} />
            </Grid>
            <Grid size={{ xs: 8, sm: 3 }}>
              <RHFTextField control={control} name={`stones.${i}.weight`} label="Weight" slotProps={adorn(stones?.[i]?.weightUnit === 'g' ? 'g' : 'ct')} />
            </Grid>
            <Grid size={{ xs: 6, sm: 2 }}>
              <RHFSelect
                control={control}
                name={`stones.${i}.weightUnit`}
                label="Unit"
                options={[
                  { value: 'ct', label: 'Carat' },
                  { value: 'g', label: 'Gram' },
                ]}
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <RHFTextField control={control} name={`stones.${i}.ratePaise`} label={`Rate per ${stones?.[i]?.weightUnit === 'g' ? 'gram' : 'carat'}`} slotProps={adorn('₹', 'start')} />
            </Grid>
            <Grid size={{ xs: 12, sm: 1 }} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
              <IconButton color="error" onClick={() => remove(i)} aria-label="Remove stone">
                <DeleteOutlineRoundedIcon />
              </IconButton>
            </Grid>
          </Grid>
        </Paper>
      ))}
      <Box>
        <Button startIcon={<AddRoundedIcon />} color="secondary" variant="outlined" onClick={() => append({ type: 'diamond', name: '', count: '1', weight: '', weightUnit: 'ct', ratePaise: '' })}>
          Add stone
        </Button>
      </Box>
    </Stack>
  );
}

export default function ProductFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const navigate = useNavigate();
  const { data: session } = useSession();
  const canSeeCost = usePermission('product.viewCost');
  const canSeeSuppliers = usePermission('supplier.view');
  const { data: product, isLoading, error, refetch } = useProductQuery(id, { skip: !editing });
  const { data: categories = [] } = useCategoriesQuery();
  const { data: suppliers } = useSupplierListQuery({ page: 1, limit: 100, status: 'active' }, { skip: !canSeeSuppliers });
  const [create, createState] = useCreateProductMutation();
  const [update, updateState] = useUpdateProductMutation();
  const catalog = session.catalog;
  const selectedBranchId = useSelector((s) => s.auth.activeBranchId);
  const activeBranchId = selectedBranchId ?? session.branches[0]?.id;

  const { control, handleSubmit, reset, setError, setValue, formState } = useForm({ defaultValues: emptyProduct({ catalog, branchId: activeBranchId }) });
  const [metal, categoryId, stockType, wastageMode, makingType, pricingMode] = useWatch({ control, name: ['metal', 'categoryId', 'stockType', 'wastage.mode', 'making.type', 'pricingMode'] });

  useEffect(() => {
    if (product) reset(productToForm(product));
  }, [product, reset]);

  const tree = useMemo(() => buildCategoryTree(categories), [categories]);
  const subcategories = tree.find((c) => c.id === categoryId)?.children ?? [];
  const locked = editing && product?.status !== 'draft';

  const purityOptions = PURITIES[metal]
    ?.filter((p) => catalog.enabledPurities[metal]?.includes(p.fineness) || (editing && product?.metal === metal && product?.purity === p.fineness))
    .map((p) => ({ value: p.fineness, label: p.label })) ?? [];

  const supplierOptions = useMemo(() => {
    const list = (suppliers?.items ?? []).map((s) => ({ value: String(s.id), label: s.companyName }));
    if (product?.supplier && !list.some((o) => o.value === String(product.supplier.id))) list.unshift({ value: String(product.supplier.id), label: product.supplier.name });
    return list;
  }, [suppliers, product]);

  const onMetalChange = (value) => {
    setValue('metal', value, { shouldDirty: true });
    setValue('purity', catalog.enabledPurities[value]?.[0] ?? '', { shouldDirty: true });
    if (value === 'silver') setValue('jewelleryType', 'silver', { shouldDirty: true });
    if (value === 'platinum') setValue('jewelleryType', 'platinum', { shouldDirty: true });
  };

  const onSubmit = handleSubmit(async (values) => {
    let payload;
    try {
      payload = formToProduct(values, { includeCost: canSeeCost });
    } catch (err) {
      if (err instanceof FieldError) return setError(err.path, { type: 'client', message: err.message });
      throw err;
    }
    const check = productSchema.safeParse(payload);
    if (!check.success) {
      check.error.issues.forEach((i) => setError(i.path.join('.'), { type: 'client', message: i.message }));
      toast.error('Please correct the highlighted fields');
      return undefined;
    }
    try {
      const saved = editing ? await update({ id, ...payload }).unwrap() : await create(payload).unwrap();
      toast.success(editing ? 'Product updated' : `Product ${saved.sku} created`);
      navigate(`/products/${saved.id}`, { replace: !editing });
    } catch (err) {
      if (!applyServerErrors(err, setError)) toast.error(getErrorMessage(err));
    }
    return undefined;
  });

  if (editing && isLoading) return <LoadingState label="Loading product" />;
  if (editing && error) return <ErrorState error={error} onRetry={refetch} />;

  const saving = createState.isLoading || updateState.isLoading;

  return (
    <Box component="form" noValidate onSubmit={onSubmit}>
      <PageHeader
        title={editing ? `Edit ${product.name}` : 'New product'}
        subtitle={editing ? product.sku : undefined}
        back={editing ? { to: `/products/${id}`, label: product.sku } : { to: '/products', label: 'Products' }}
      />
      {locked && (
        <Alert severity="info" sx={{ mb: 2 }}>
          This item is in stock. Metal, purity, weights, stones and branch can only change through stock adjustments or transfers.
        </Alert>
      )}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Stack spacing={2}>
            <Section title="Item" description="Weights in grams as shown on your scale. SKU and barcode are created on save.">
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 8 }}>
                  <RHFTextField control={control} name="name" label="Product name" placeholder="e.g. 22K Temple Necklace" autoFocus={!editing} />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <RHFSelect
                    control={control}
                    name="categoryId"
                    label="Category"
                    options={tree.map((c) => ({ value: String(c.id), label: c.name }))}
                    placeholder="Select category"
                    onChange={(e) => {
                      setValue('categoryId', e.target.value, { shouldDirty: true });
                      setValue('subcategoryId', '', { shouldDirty: true });
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <RHFSelect control={control} name="metal" label="Metal" options={METAL_OPTIONS} disabled={locked} onChange={(e) => onMetalChange(e.target.value)} />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <RHFSelect control={control} name="purity" label="Purity" options={purityOptions} disabled={locked} helperText={purityOptions.length ? undefined : 'Enable a purity in Business settings'} />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <RHFTextField control={control} name="grossWeightMg" label="Gross weight" slotProps={adorn('g')} disabled={locked} />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <RHFTextField
                    control={control}
                    name="huid"
                    label="HUID"
                    transform={upper}
                    helperText={metal === 'gold' && catalog.huidMandatory ? 'Needed to sell' : undefined}
                    slotProps={{ htmlInput: { maxLength: 6 } }}
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <RHFSelect
                    control={control}
                    name="making.type"
                    label="Making charge"
                    options={[
                      { value: 'per_gram', label: 'Per gram' },
                      { value: 'percent', label: '% of metal' },
                      { value: 'fixed', label: 'Per piece' },
                    ]}
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <RHFTextField control={control} name="making.value" label={makingType === 'percent' ? 'Making %' : 'Making ₹'} slotProps={makingType === 'percent' ? adorn('%') : adorn('₹', 'start')} />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <RHFSelect
                    control={control}
                    name="wastage.mode"
                    label="Wastage"
                    options={[
                      { value: 'percent', label: '% of weight' },
                      { value: 'weight', label: 'Fixed grams' },
                      { value: 'none', label: 'None' },
                    ]}
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  {wastageMode !== 'none' && <RHFTextField control={control} name="wastage.value" label={wastageMode === 'percent' ? 'Wastage %' : 'Wastage g'} slotProps={adorn(wastageMode === 'percent' ? '%' : 'g')} />}
                </Grid>
                {session.branches.length > 1 && (
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <RHFSelect control={control} name="branchId" label="Branch" options={session.branches.map((b) => ({ value: String(b.id), label: b.name }))} disabled={locked} />
                  </Grid>
                )}
                {canSeeCost && (
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <RHFTextField control={control} name="costPricePaise" label="Cost price (optional)" slotProps={adorn('₹', 'start')} />
                  </Grid>
                )}
              </Grid>
            </Section>

            <Section title="Stones" description="Only for items with diamonds or gemstones. Stone weight is taken off the gross weight.">
              {locked ? (
                <Typography variant="body2" color="textSecondary">
                  Stones are locked while the item is in stock.
                </Typography>
              ) : (
                <Stones control={control} />
              )}
            </Section>

            <MoreDetails
              hint="Subcategory, lot, fixed price, other charges, HSN, certificate, supplier, description"
              defaultOpen={Boolean(editing && product && (product.subcategory || product.stockType === 'lot' || product.pricingMode === 'fixed' || product.otherChargePaise || product.certificateNo || product.supplier || product.description || product.hsnCode))}
              forceOpen={['subcategoryId', 'jewelleryType', 'quantity', 'fixedPricePaise', 'otherChargePaise', 'hsnCode', 'certificateNo', 'description'].some((k) => formState.errors[k])}
            >
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <RHFSelect control={control} name="subcategoryId" label="Subcategory" options={subcategories.map((c) => ({ value: String(c.id), label: c.name }))} placeholder="None" disabled={!subcategories.length} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <RHFSelect control={control} name="jewelleryType" label="Jewellery type" options={JEWELLERY_TYPES} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <RHFSelect
                    control={control}
                    name="stockType"
                    label="Stock type"
                    options={[
                      { value: 'tagged', label: 'Single tagged piece' },
                      { value: 'lot', label: 'Lot of identical pieces' },
                    ]}
                    disabled={locked}
                  />
                </Grid>
                {stockType === 'lot' && (
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <RHFTextField control={control} name="quantity" label="Pieces in lot" slotProps={{ htmlInput: { inputMode: 'numeric' } }} disabled={locked} helperText="Gross weight is for the whole lot" />
                  </Grid>
                )}
                <Grid size={{ xs: 12, sm: 6 }}>
                  <RHFSelect
                    control={control}
                    name="pricingMode"
                    label="Price"
                    options={[
                      { value: 'rate_based', label: 'From daily metal rate' },
                      { value: 'fixed', label: 'Fixed price (MRP)' },
                    ]}
                  />
                </Grid>
                {pricingMode === 'fixed' && (
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <RHFTextField control={control} name="fixedPricePaise" label="Selling price" slotProps={adorn('₹', 'start')} />
                  </Grid>
                )}
                <Grid size={{ xs: 12, sm: 6 }}>
                  <RHFTextField control={control} name="otherChargePaise" label="Other charges" helperText="Hallmarking, certificate, packaging" slotProps={adorn('₹', 'start')} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <RHFTextField control={control} name="hsnCode" label="HSN code" helperText="Blank uses the default" slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 8 } }} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <RHFTextField control={control} name="certificateNo" label="Certificate no." helperText="Diamond certificate (IGI, GIA…)" />
                </Grid>
                {canSeeSuppliers && (
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <RHFSelect control={control} name="supplierId" label="Supplier" options={supplierOptions} placeholder="None" />
                  </Grid>
                )}
                <Grid size={12}>
                  <RHFTextField control={control} name="description" label="Description" multiline minRows={2} />
                </Grid>
              </Grid>
            </MoreDetails>
          </Stack>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <WeightSummary control={control} />
        </Grid>
      </Grid>

      <Paper
        square
        sx={{ position: 'sticky', bottom: { xs: 64, md: 0 }, mt: 3, mx: { xs: -2, sm: -3, lg: -4 }, px: { xs: 2, sm: 3, lg: 4 }, py: 1.5, borderTop: 1, borderColor: 'divider', display: 'flex', justifyContent: 'flex-end', gap: 1, zIndex: 2 }}
      >
        <Button color="secondary" onClick={() => navigate(editing ? `/products/${id}` : '/products')} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" variant="contained" loading={saving} disabled={editing && !formState.isDirty}>
          {editing ? 'Save changes' : 'Create product'}
        </Button>
      </Paper>
    </Box>
  );
}
