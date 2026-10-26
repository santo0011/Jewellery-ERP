import AddRoundedIcon from '@mui/icons-material/AddRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { Alert, Box, Button, Card, CardContent, Divider, Grid, IconButton, InputAdornment, Paper, Stack, Typography } from '@mui/material';
import { deriveWeights, formatWeight, JEWELLERY_TYPES, LOOKUP_ACCESS, METAL_OPTIONS, PURITIES, STONE_TYPES } from '@jerp/shared';
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
import KeepOnPhone from '../../components/KeepOnPhone.jsx';
import { usePermission, useSession } from '../../hooks/usePermission.js';
import { applyServerErrors, getErrorMessage } from '../../utils/errors.js';
import { buildCategoryTree, useCategoriesQuery } from '../categories/categoryApi.js';
import { useSupplierListQuery } from '../suppliers/supplierApi.js';
import { useCreateProductMutation, useProductQuery, useUpdateProductMutation } from './productApi.js';
import { emptyProduct, FieldError, formToProduct, productToForm, safeWeights } from './productForm.js';
import { t } from '../../i18n/index.js';

const upper = (v) => v.toUpperCase();
const adorn = (text, position = 'end') => ({ input: { [`${position}Adornment`]: <InputAdornment position={position}>{text}</InputAdornment> }, htmlInput: { inputMode: 'decimal' } });

function Section({ title, description, children }) {
  return (
    <Card>
      <CardContent sx={{ p: { xs: 2.5, sm: 3 } }}>
        <Typography variant="h4">{title}</Typography>
        {description && (
          <Typography variant="body2" color="textSecondary" sx={{ mt: 0.5, display: { xs: 'none', sm: 'block' } }}>
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
          {t('Weight summary')}
        </Typography>
        {!w ? (
          <Typography variant="body2" color="error" sx={{ mt: 1 }}>
            {t('Check the weights entered')}
          </Typography>
        ) : (
          <Box sx={{ mt: 1 }}>
            {row(t('Gross'), formatWeight(parsed.grossWeightMg))}
            {row(t('Stones'), `− ${formatWeight(w.stoneWeightMg)}`)}
            <Divider />
            {row(t('Net'), formatWeight(w.netWeightMg), true)}
            {row(t('Fine ({{value}})', { value: PURITIES[metal]?.find((p) => p.fineness === Number(purity))?.label ?? '—' }), formatWeight(w.fineWeightMg))}
            {w.netWeightMg < 0 && (
              <Typography variant="caption" color="error">
                {t('Stones weigh more than the item')}
              </Typography>
            )}
          </Box>
        )}
        <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 1.5 }}>
          {t('1 carat = 0.2 g. The server recalculates and stores these on save.')}
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
              <RHFSelect control={control} name={`stones.${i}.type`} label={t('Stone')} options={STONE_TYPES} />
            </Grid>
            <Grid size={{ xs: 12, sm: 8 }}>
              <RHFTextField control={control} name={`stones.${i}.name`} label={t('Description')} placeholder={t('e.g. VVS1 round brilliant')} />
            </Grid>
            <Grid size={{ xs: 4, sm: 2 }}>
              <RHFTextField control={control} name={`stones.${i}.count`} label={t('Pieces')} slotProps={{ htmlInput: { inputMode: 'numeric', 'data-number': true } }} />
            </Grid>
            <Grid size={{ xs: 8, sm: 3 }}>
              <RHFTextField control={control} name={`stones.${i}.weight`} label={t('Weight')} slotProps={adorn(stones?.[i]?.weightUnit === 'g' ? 'g' : 'ct')} />
            </Grid>
            <Grid size={{ xs: 6, sm: 2 }}>
              <RHFSelect
                control={control}
                name={`stones.${i}.weightUnit`}
                label={t('Unit')}
                options={[
                  { value: 'ct', label: t('Carat') },
                  { value: 'g', label: t('Gram') },
                ]}
              />
            </Grid>
            <Grid size={{ xs: 6, sm: 4 }}>
              <RHFTextField control={control} name={`stones.${i}.ratePaise`} label={(stones?.[i]?.weightUnit === 'g' ? t('Rate per gram') : t('Rate per carat'))} slotProps={adorn('₹', 'start')} />
            </Grid>
            <Grid size={{ xs: 12, sm: 1 }} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
              <IconButton color="error" onClick={() => remove(i)} aria-label={t('Remove stone')}>
                <DeleteOutlineRoundedIcon />
              </IconButton>
            </Grid>
          </Grid>
        </Paper>
      ))}
      <Box>
        <Button startIcon={<AddRoundedIcon />} color="secondary" variant="outlined" onClick={() => append({ type: 'diamond', name: '', count: '1', weight: '', weightUnit: 'ct', ratePaise: '' })}>
          {t('Add stone')}
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
  // Picking the supplier: creating or editing a product is enough (see LOOKUP_ACCESS).
  const canSeeSuppliers = usePermission(LOOKUP_ACCESS.supplier);
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
      if (err instanceof FieldError) return setError(err.path, { type: 'client', message: t(err.message) });
      throw err;
    }
    const check = productSchema.safeParse(payload);
    if (!check.success) {
      check.error.issues.forEach((i) => setError(i.path.join('.'), { type: 'client', message: t(i.message) }));
      toast.error(t('Please correct the highlighted fields'));
      return undefined;
    }
    try {
      const saved = editing ? await update({ id, ...payload }).unwrap() : await create(payload).unwrap();
      toast.success(editing ? t('Product updated') : t('Product {{sku}} created', { sku: saved.sku }));
      // Saved (new or edited): back to the product list. Replacing the form keeps Back from reopening it.
      navigate('/products', { replace: true });
    } catch (err) {
      if (!applyServerErrors(err, setError)) toast.error(getErrorMessage(err));
    }
    return undefined;
  });

  if (editing && isLoading) return <LoadingState label={t('Loading product')} />;
  if (editing && error) return <ErrorState error={error} onRetry={refetch} />;

  const saving = createState.isLoading || updateState.isLoading;

  return (
    <Box component="form" noValidate onSubmit={onSubmit}>
      <PageHeader
        title={editing ? t('Edit {{name}}', { name: product.name }) : t('New product')}
        subtitle={editing ? product.sku : undefined}
        back={editing ? { to: `/products/${id}`, label: product.sku } : { to: '/products', label: t('Products') }}
      />
      {locked && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('This item is in stock. Metal, purity, weights, stones and branch can only change through stock adjustments or transfers.')}
        </Alert>
      )}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Stack spacing={2}>
            <Section title={t('Item')} description={t('Weights in grams as shown on your scale. SKU and barcode are created on save.')}>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 8 }}>
                  <RHFTextField control={control} name="name" label={t('Product name')} placeholder={t('e.g. 22K Temple Necklace')} autoFocus={!editing} />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <RHFSelect
                    control={control}
                    name="categoryId"
                    label={t('Category')}
                    options={tree.map((c) => ({ value: String(c.id), label: c.name }))}
                    placeholder={t('Select category')}
                    onChange={(e) => {
                      setValue('categoryId', e.target.value, { shouldDirty: true });
                      setValue('subcategoryId', '', { shouldDirty: true });
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <RHFSelect control={control} name="metal" label={t('Metal')} options={METAL_OPTIONS} disabled={locked} onChange={(e) => onMetalChange(e.target.value)} />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <RHFSelect control={control} name="purity" label={t('Purity')} options={purityOptions} disabled={locked} helperText={purityOptions.length ? undefined : <KeepOnPhone>{t('Enable a purity in Business settings')}</KeepOnPhone>} />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <RHFTextField control={control} name="grossWeightMg" label={t('Gross weight')} slotProps={adorn('g')} disabled={locked} />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <RHFTextField
                    control={control}
                    name="huid"
                    label={t('HUID')}
                    transform={upper}
                    helperText={metal === 'gold' && catalog.huidMandatory ? <KeepOnPhone>{t('Needed to sell')}</KeepOnPhone> : undefined}
                    slotProps={{ htmlInput: { maxLength: 6 } }}
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <RHFSelect
                    control={control}
                    name="making.type"
                    label={t('Making charge')}
                    options={[
                      { value: 'per_gram', label: t('Per gram') },
                      { value: 'percent', label: t('% of metal') },
                      { value: 'fixed', label: t('Per piece') },
                    ]}
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <RHFTextField control={control} name="making.value" label={makingType === 'percent' ? t('Making %') : t('Making ₹')} slotProps={makingType === 'percent' ? adorn('%') : adorn('₹', 'start')} />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <RHFSelect
                    control={control}
                    name="wastage.mode"
                    label={t('Wastage')}
                    options={[
                      { value: 'percent', label: t('% of weight') },
                      { value: 'weight', label: t('Fixed grams') },
                      { value: 'none', label: t('None') },
                    ]}
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  {wastageMode !== 'none' && <RHFTextField control={control} name="wastage.value" label={wastageMode === 'percent' ? t('Wastage %') : t('Wastage g')} slotProps={adorn(wastageMode === 'percent' ? '%' : 'g')} />}
                </Grid>
                {session.branches.length > 1 && (
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <RHFSelect control={control} name="branchId" label={t('Branch')} options={session.branches.map((b) => ({ value: String(b.id), label: b.name }))} disabled={locked} />
                  </Grid>
                )}
                {canSeeCost && (
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <RHFTextField control={control} name="costPricePaise" label={t('Cost price (optional)')} slotProps={adorn('₹', 'start')} />
                  </Grid>
                )}
              </Grid>
            </Section>

            <Section title={t('Stones')} description={t('Only for items with diamonds or gemstones. Stone weight is taken off the gross weight.')}>
              {locked ? (
                <Typography variant="body2" color="textSecondary">
                  {t('Stones are locked while the item is in stock.')}
                </Typography>
              ) : (
                <Stones control={control} />
              )}
            </Section>

            <MoreDetails
              hint={t('Subcategory, lot, fixed price, other charges, HSN, certificate, supplier, description')}
              defaultOpen={Boolean(editing && product && (product.subcategory || product.stockType === 'lot' || product.pricingMode === 'fixed' || product.otherChargePaise || product.certificateNo || product.supplier || product.description || product.hsnCode))}
              forceOpen={['subcategoryId', 'jewelleryType', 'quantity', 'fixedPricePaise', 'otherChargePaise', 'hsnCode', 'certificateNo', 'description'].some((k) => formState.errors[k])}
            >
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <RHFSelect control={control} name="subcategoryId" label={t('Subcategory')} options={subcategories.map((c) => ({ value: String(c.id), label: c.name }))} placeholder={t('None')} disabled={!subcategories.length} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <RHFSelect control={control} name="jewelleryType" label={t('Jewellery type')} options={JEWELLERY_TYPES} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <RHFSelect
                    control={control}
                    name="stockType"
                    label={t('Stock type')}
                    options={[
                      { value: 'tagged', label: t('Single tagged piece') },
                      { value: 'lot', label: t('Lot of identical pieces') },
                    ]}
                    disabled={locked}
                  />
                </Grid>
                {stockType === 'lot' && (
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <RHFTextField control={control} name="quantity" label={t('Pieces in lot')} slotProps={{ htmlInput: { inputMode: 'numeric', 'data-number': true } }} disabled={locked} helperText={t('Gross weight is for the whole lot')} />
                  </Grid>
                )}
                <Grid size={{ xs: 12, sm: 6 }}>
                  <RHFSelect
                    control={control}
                    name="pricingMode"
                    label={t('Price')}
                    options={[
                      { value: 'rate_based', label: t('From daily metal rate') },
                      { value: 'fixed', label: t('Fixed price (MRP)') },
                    ]}
                  />
                </Grid>
                {pricingMode === 'fixed' && (
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <RHFTextField control={control} name="fixedPricePaise" label={t('Selling price')} slotProps={adorn('₹', 'start')} />
                  </Grid>
                )}
                <Grid size={{ xs: 12, sm: 6 }}>
                  <RHFTextField control={control} name="otherChargePaise" label={t('Other charges')} helperText={t('Hallmarking, certificate, packaging')} slotProps={adorn('₹', 'start')} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <RHFTextField control={control} name="hsnCode" label={t('HSN code')} helperText={t('Blank uses the default')} slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 8 } }} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <RHFTextField control={control} name="certificateNo" label={t('Certificate no.')} helperText={t('Diamond certificate (IGI, GIA…)')} />
                </Grid>
                {canSeeSuppliers && (
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <RHFSelect control={control} name="supplierId" label={t('Supplier')} options={supplierOptions} placeholder={t('None')} />
                  </Grid>
                )}
                <Grid size={12}>
                  <RHFTextField control={control} name="description" label={t('Description')} multiline minRows={2} />
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
        // Desktop: a bar along the bottom edge. Phones: a floating card just above the bottom navigation.
        sx={{
          position: 'sticky',
          bottom: { xs: 'calc(84px + env(safe-area-inset-bottom))', md: 0 },
          mt: 3,
          mx: { xs: 0, md: -3, lg: -4 },
          px: { xs: 1.5, md: 3, lg: 4 },
          py: 1.5,
          border: { xs: 1, md: 0 },
          borderTop: 1,
          borderColor: 'divider',
          borderRadius: { xs: 3, md: 0 },
          boxShadow: { xs: '0 10px 30px -10px rgba(23, 23, 23, 0.3)', md: 'none' },
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 1,
          zIndex: 2,
          '& .MuiButton-root': { flex: { xs: 1, md: 'none' } },
        }}
      >
        <Button color="secondary" onClick={() => navigate(editing ? `/products/${id}` : '/products')} disabled={saving}>
          {t('Cancel')}
        </Button>
        <Button type="submit" variant="contained" loading={saving} disabled={editing && !formState.isDirty}>
          {editing ? t('Save changes') : t('Create product')}
        </Button>
      </Paper>
    </Box>
  );
}
