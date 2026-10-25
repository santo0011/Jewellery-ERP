import { zodResolver } from '@hookform/resolvers/zod';
import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { Alert, Box, Button, Card, CardContent, Chip, Divider, Grid, IconButton, InputAdornment, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import { decimalToScaledInt, formatINR, METAL_OPTIONS, PURITIES, STONE_TYPES, stoneWeightToMg, toBps, toMg, toPaise } from '@jerp/shared';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import { useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import { MONEY_TONE } from '../../components/Amount.jsx';
import CustomerPicker from '../../components/CustomerPicker.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import RHFSelect from '../../components/form/RHFSelect.jsx';
import RHFTextField from '../../components/form/RHFTextField.jsx';
import { useSession } from '../../hooks/usePermission.js';
import { tokens } from '../../theme/tokens.js';
import { applyServerErrors, getErrorMessage } from '../../utils/errors.js';
import { useCategoriesQuery } from '../categories/categoryApi.js';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import { useAddOrderImageMutation, useCreateOrderMutation, useEstimateOrderMutation, useOrderQuery, useUpdateOrderMutation } from './orderApi.js';
import { ADVANCE_MODE_OPTIONS } from './orderUi.jsx';
import { t } from '../../i18n/index.js';

const safe = (fn, fallback = null) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

const number = (label, places) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || new RegExp(`^\\d+(\\.\\d{0,${places}})?$`).test(v), t('Enter a valid {{label}}', { label }));

const stoneSchema = z.object({
  type: z.string().min(1, 'Select a stone'),
  name: z.string().trim().max(60, 'Up to 60 characters'),
  count: z.string().trim().regex(/^[1-9]\d{0,4}$/, t('At least 1')),
  weight: z
    .string()
    .trim()
    .min(1, t('Enter the weight'))
    .regex(/^\d+(\.\d{0,3})?$/, t('Up to 3 decimals'))
    .refine((v) => Number(v) > 0, t('Must be more than 0')),
  weightUnit: z.enum(['ct', 'g']),
  rate: number('rate', 2),
});

/** Total stone weight in mg, checked against the item weight as the server does. */
const stonesMg = (stones) => stones.reduce((sum, st) => sum + safe(() => stoneWeightToMg({ weight: decimalToScaledInt(st.weight || '0', 3), weightUnit: st.weightUnit }), 0), 0);

const itemSchema = z
  .object({
    description: z.string().trim().min(2, t('Describe the item')),
    categoryId: z.string(),
    jewelleryType: z.string(),
    metal: z.string().min(1, t('Select a metal')),
    purity: z.string(),
    weight: number('weight', 3),
    size: z.string().trim().max(40),
    quantity: z.string().regex(/^[1-9]\d{0,3}$/, t('At least 1')),
    stones: z.array(stoneSchema),
    pricingMode: z.enum(['rate_based', 'fixed']),
    fixedPrice: number('price', 2),
    wastage: number('percentage', 2).refine((v) => v === '' || Number(v) <= 50, t('Up to 50%')),
    makingType: z.enum(['per_gram', 'percent', 'fixed']),
    making: number('amount', 2),
    otherCharges: number('amount', 2),
    estimate: number('amount', 2),
    huid: z.string().trim().toUpperCase().refine((v) => v === '' || /^[A-Z0-9]{6}$/.test(v), t('HUID is 6 letters or digits')),
    notes: z.string().trim().max(500),
  })
  .refine((i) => i.pricingMode !== 'fixed' || Number(i.fixedPrice) > 0, { path: ['fixedPrice'], message: t('Enter the agreed price') })
  .refine((i) => !Number(i.weight) || stonesMg(i.stones) < safe(() => toMg(i.weight), 0), { path: ['weight'], message: t('Must be more than the stone weight') });

const formSchema = z
  .object({
    customer: z.object({ id: z.string() }, { error: t('Select the customer') }).passthrough().nullable().refine(Boolean, t('Select the customer')),
    branchId: z.string().min(1, t('Select a branch')),
    expectedDate: z.string(),
    priority: z.enum(['normal', 'urgent']),
    items: z.array(itemSchema).min(1, t('Add at least one item')),
    advanceAmount: number('amount', 2),
    advanceMode: z.string(),
    advanceReference: z.string().trim().max(60),
    notes: z.string().trim().max(1000),
  })
  .refine((v) => !v.advanceAmount || Number(v.advanceAmount) === 0 || v.advanceMode, { path: ['advanceMode'], message: t('How was the advance paid?') });

const DEFAULT_TYPE = { gold: 'plain_gold', silver: 'silver', platinum: 'platinum' };
const emptyItem = (catalog) => ({
  description: '',
  categoryId: '',
  jewelleryType: 'plain_gold',
  metal: 'gold',
  purity: String(catalog?.enabledPurities?.gold?.[0] ?? 916),
  weight: '',
  size: '',
  quantity: '1',
  stones: [],
  pricingMode: 'rate_based',
  fixedPrice: '',
  wastage: '',
  makingType: catalog?.defaultMakingChargeType === 'percent' ? 'percent' : 'per_gram',
  making: '',
  otherCharges: '',
  estimate: '',
  huid: '',
  notes: '',
});
/** Width of the side column: its share of the 12-column grid (same formula as MUI Grid), less 20px. */
const SIDE_WIDTH = (size) => `calc(100% * ${size} / 12 - (12 - ${size}) * (var(--Grid-parent-columnSpacing) / 12) - 20px)`;
const STONE_UNITS = [
  { value: 'ct', label: t('ct') },
  { value: 'g', label: t('g') },
];
const EMPTY_STONE ={ type: 'diamond', name: '', count: '1', weight: '', weightUnit: 'ct', rate: '' };
const MAKING_LABEL = { per_gram: t('Making (₹ per gram)'), percent: t('Making (% of metal)'), fixed: t('Making (₹ for the piece)') };
const today = () => new Date().toISOString().slice(0, 10);
const paiseOf = (v) => (v ? toPaise(v) : 0);

/** Jewellery type follows from the metal and stones, so the form does not ask for it. */
function typeFor(i) {
  const stones = (i.stones ?? []).filter((st) => st.type);
  if (stones.some((st) => st.type === 'diamond') && i.metal !== 'silver') return 'diamond';
  if (stones.length && i.metal === 'gold') return 'studded_gold';
  return DEFAULT_TYPE[i.metal] ?? 'plain_gold';
}

/** Form item -> API item (shared by booking and estimating). */
const toApiItem = (i) => ({
  description: i.description || t('Item'),
  categoryId: i.categoryId || null,
  jewelleryType: typeFor(i),
  metal: i.metal,
  purity: i.purity ? Number(i.purity) : null,
  approxWeightMg: i.weight ? toMg(i.weight) : null,
  size: i.size || null,
  quantity: Number(i.quantity) || 1,
  stones: i.stones.map((s) => ({ type: s.type, name: s.name || null, count: Number(s.count) || 1, weight: decimalToScaledInt(s.weight || '0', 3), weightUnit: s.weightUnit, ratePaise: paiseOf(s.rate) })),
  pricingMode: i.pricingMode,
  fixedPricePaise: i.pricingMode === 'fixed' ? paiseOf(i.fixedPrice) : null,
  ...(i.pricingMode === 'rate_based' && {
    wastage: i.wastage ? { mode: 'percent', value: toBps(i.wastage) } : { mode: 'none', value: 0 },
    making: { type: i.makingType, value: i.making ? (i.makingType === 'percent' ? toBps(i.making) : toPaise(i.making)) : 0 },
  }),
  otherChargePaise: paiseOf(i.otherCharges),
});

/** API item (a saved order line) -> form item, for editing an order. */
const text = (v) => (v == null ? '' : String(v));
const fromApiItem = (i) => ({
  description: i.description ?? '',
  categoryId: text(i.categoryId),
  jewelleryType: i.jewelleryType ?? 'plain_gold',
  metal: i.metal,
  purity: text(i.purity),
  weight: i.approxWeightMg ? String(i.approxWeightMg / 1000) : '',
  size: i.size ?? '',
  quantity: String(i.quantity ?? 1),
  stones: (i.stones ?? []).map((s) => ({ type: s.type, name: s.name ?? '', count: String(s.count ?? 1), weight: String((s.weight ?? 0) / 1000), weightUnit: s.weightUnit ?? 'ct', rate: s.ratePaise ? String(s.ratePaise / 100) : '' })),
  pricingMode: i.pricingMode ?? 'rate_based',
  fixedPrice: i.fixedPricePaise ? String(i.fixedPricePaise / 100) : '',
  wastage: i.wastage?.mode === 'percent' && i.wastage.value ? String(i.wastage.value / 100) : '',
  makingType: i.making?.type ?? 'per_gram',
  making: i.making?.value ? String(i.making.value / 100) : '',
  otherCharges: i.otherChargePaise ? String(i.otherChargePaise / 100) : '',
  estimate: i.estimatedPaise ? String(i.estimatedPaise / 100) : '',
  huid: i.huid ?? '',
  notes: i.notes ?? '',
});

function Section({ title, children, action }) {
  return (
    <Box sx={{ mt: 2.5 }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.25 }}>
        <Typography variant="overline" color="textSecondary">
          {title}
        </Typography>
        {action}
      </Stack>
      {children}
    </Box>
  );
}

function StonesEditor({ control, index }) {
  const name = `items.${index}.stones`;
  const { fields, append, remove } = useFieldArray({ control, name });
  const stones = useWatch({ control, name });
  return (
    <Section
      title={t('Stones{{value}}', { value: fields.length ? ` (${fields.length})` : '' })}
      action={
        <Button size="small" startIcon={<AddRoundedIcon />} onClick={() => append(EMPTY_STONE)}>
          {t('Add stone')}
        </Button>
      }
    >
      {fields.length === 0 ? (
        <Typography variant="caption" color="textSecondary">
          {t('No stones. Add diamonds or gemstones the customer chose.')}
        </Typography>
      ) : (
        <Stack spacing={1.25}>
          {fields.map((f, i) => (
            <Grid container spacing={1.25} key={f.id} sx={{ alignItems: 'flex-start' }}>
              <Grid size={{ xs: 6, md: 3 }}>
                <RHFSelect control={control} name={`${name}.${i}.type`} label={t('Stone')} options={STONE_TYPES} />
              </Grid>
              <Grid size={{ xs: 6, md: 2.5 }}>
                <RHFTextField control={control} name={`${name}.${i}.name`} label={t('Details')} placeholder={t('e.g. VVS1 round')} />
              </Grid>
              <Grid size={{ xs: 4, md: 1.25 }}>
                <RHFTextField control={control} name={`${name}.${i}.count`} label={t('Pcs')} slotProps={{ htmlInput: { inputMode: 'numeric', 'data-number': true } }} />
              </Grid>
              <Grid size={{ xs: 4, md: 1.75 }}>
                <RHFTextField control={control} name={`${name}.${i}.weight`} label={t('Weight')} slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
              </Grid>
              <Grid size={{ xs: 4, md: 1.5 }}>
                <RHFSelect control={control} name={`${name}.${i}.weightUnit`} label={t('Unit')} options={STONE_UNITS} />
              </Grid>
              <Grid size={{ xs: 10, md: 2 }}>
                <RHFTextField control={control} name={`${name}.${i}.rate`} label={(stones?.[i]?.weightUnit === 'g' ? t('₹ per g') : t('₹ per ct'))} slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
              </Grid>
              <Grid size={{ xs: 2, md: 0.5 }} sx={{ display: 'flex', justifyContent: 'center' }}>
                <IconButton size="small" onClick={() => remove(i)} aria-label={t('Remove stone')} sx={{ mt: 1 }}>
                  <CloseRoundedIcon fontSize="small" />
                </IconButton>
              </Grid>
            </Grid>
          ))}
        </Stack>
      )}
    </Section>
  );
}

function ItemCard({ index, control, setValue, categories, onRemove, canRemove, estimate }) {
  const [metal, pricingMode, makingType] = useWatch({ control, name: [`items.${index}.metal`, `items.${index}.pricingMode`, `items.${index}.makingType`] });
  const purities = PURITIES[metal] ?? [];
  const p = `items.${index}`;
  return (
    <Box sx={{ p: 2.5, border: 1, borderColor: 'divider', borderRadius: 3, bgcolor: 'background.paper' }}>
      <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1.5 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Box sx={{ width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', background: tokens.sidebar.goldGradient, color: 'var(--brand-contrast)', fontSize: 12, fontWeight: 800 }}>{index + 1}</Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {t('Item {{value}}', { value: index + 1 })}
          </Typography>
        </Stack>
        {canRemove && (
          <Tooltip title={t('Remove item')}>
            <IconButton size="small" onClick={onRemove} aria-label={t('Remove item {{value}}', { value: index + 1 })}>
              <DeleteOutlineRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 8 }}>
          <RHFTextField control={control} name={`${p}.description`} label={t('What does the customer want?')} placeholder={t('e.g. 22K bridal necklace with matching earrings')} />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <RHFSelect control={control} name={`${p}.categoryId`} label={t('Category')} options={categories} placeholder={t('None')} />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Controller
            control={control}
            name={`${p}.metal`}
            render={({ field, fieldState }) => (
              <TextField
                select
                label={t('Metal')}
                {...field}
                onChange={(e) => {
                  field.onChange(e);
                  setValue(`${p}.purity`, String(PURITIES[e.target.value]?.[0]?.fineness ?? ''));
                  setValue(`${p}.jewelleryType`, DEFAULT_TYPE[e.target.value] ?? 'plain_gold');
                }}
                error={Boolean(fieldState.error)}
                helperText={t(fieldState.error?.message)}
              >
                {METAL_OPTIONS.map((m) => (
                  <MenuItem key={m.value} value={m.value}>
                    {m.label}
                  </MenuItem>
                ))}
              </TextField>
            )}
          />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <RHFSelect control={control} name={`${p}.purity`} label={t('Purity')} options={purities.map((x) => ({ value: String(x.fineness), label: x.label }))} placeholder={t('Not decided')} />
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          <RHFTextField control={control} name={`${p}.weight`} label={t('Weight')} slotProps={{ input: { endAdornment: <InputAdornment position="end">{t('g')}</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }} />
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          <RHFTextField control={control} name={`${p}.size`} label={t('Size')} placeholder={t('e.g. 14, 2.6')} />
        </Grid>
        <Grid size={{ xs: 12, md: 2 }}>
          <RHFTextField control={control} name={`${p}.quantity`} label={t('Qty')} slotProps={{ htmlInput: { inputMode: 'numeric', 'data-number': true } }} />
        </Grid>
        <Grid size={12}>
          <RHFTextField control={control} name={`${p}.notes`} label={t('Design notes')} placeholder={t('Finish, engraving, design reference, chain length…')} multiline minRows={1} />
        </Grid>
      </Grid>

      <StonesEditor control={control} index={index} />

      <Section title={t('Pricing')}>
        <Controller
          control={control}
          name={`${p}.pricingMode`}
          render={({ field }) => (
            <ToggleButtonGroup exclusive size="small" value={field.value} onChange={(e, v) => v && field.onChange(v)} sx={{ mb: 2 }}>
              <ToggleButton value="rate_based">{t('At day\'s metal rate')}</ToggleButton>
              <ToggleButton value="fixed">{t('Fixed agreed price')}</ToggleButton>
            </ToggleButtonGroup>
          )}
        />
        {pricingMode === 'fixed' ? (
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <RHFTextField control={control} name={`${p}.fixedPrice`} label={t('Agreed price (₹ each, before GST)')} slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
            </Grid>
          </Grid>
        ) : (
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 3 }}>
              <RHFTextField control={control} name={`${p}.wastage`} label={t('Wastage')} placeholder="0" slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              {/* Phones: the making type as a full-width switch above its amount. */}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Controller
                  control={control}
                  name={`${p}.makingType`}
                  render={({ field }) => (
                    <ToggleButtonGroup exclusive size="small" value={field.value} onChange={(e, v) => v && field.onChange(v)} aria-label={t('Making charge type')} sx={{ height: 41, flexShrink: 0, width: { xs: '100%', sm: 'auto' }, '& .MuiToggleButton-root': { flex: { xs: 1, sm: 'none' }, minWidth: 44, fontWeight: 700 } }}>
                      <ToggleButton value="per_gram">{t('₹/g')}</ToggleButton>
                      <ToggleButton value="percent">%</ToggleButton>
                      <ToggleButton value="fixed">₹</ToggleButton>
                    </ToggleButtonGroup>
                  )}
                />
                <RHFTextField control={control} name={`${p}.making`} label={MAKING_LABEL[makingType]} placeholder="0" slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
              </Stack>
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <RHFTextField control={control} name={`${p}.otherCharges`} label={t('Other charges (₹)')} placeholder="0" slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
            </Grid>
          </Grid>
        )}
      </Section>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 2.5, p: 1.75, borderRadius: 2, bgcolor: 'rgba(var(--brand-rgb), 0.07)', border: '1px solid rgba(var(--brand-rgb), 0.25)', alignItems: { sm: 'center' } }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {t('Estimated price (each, incl. GST)')}
          </Typography>
          {estimate?.estimatedPaise != null ? (
            <Typography variant="caption" color="textSecondary">
              {estimate.ratePerGramPaise != null ? (estimate.rateIsToday ? t('At {{ratePerGram}}/g (today) · ', { ratePerGram: formatINR(estimate.ratePerGramPaise, { decimals: 0 }) }) : t('At {{ratePerGram}}/g (rate of {{rateDate}}) · ', { ratePerGram: formatINR(estimate.ratePerGramPaise, { decimals: 0 }), rateDate: estimate.rateDate })) : ''}
              {t('metal {{formatINR}} · making {{making}}', { formatINR: formatINR(estimate.breakdown.metalPaise + estimate.breakdown.wastagePaise, { decimals: 0 }), making: formatINR(estimate.breakdown.makingPaise, { decimals: 0 }) })}
              {estimate.breakdown.stonePaise ? t(' · stones {{stone}}', { stone: formatINR(estimate.breakdown.stonePaise, { decimals: 0 }) }) : ''} {t('· GST {{gst}}', { gst: formatINR(estimate.breakdown.gstPaise, { decimals: 0 }) })}
            </Typography>
          ) : (
            <Typography variant="caption" color={estimate?.reason ? 'warning.main' : 'textSecondary'}>
              {estimate?.reason ?? t('Use Calculate estimate, or type an amount you agreed.')}
            </Typography>
          )}
        </Box>
        <Box sx={{ width: { sm: 200 } }}>
          <RHFTextField control={control} name={`${p}.estimate`} label={t('Estimate (₹ each)')} slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
        </Box>
      </Stack>
    </Box>
  );
}

function PhotoPicker({ files, onChange }) {
  const previews = useMemo(() => files.map((f) => ({ file: f, url: URL.createObjectURL(f) })), [files]);
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);
  return (
    <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1.25 }}>
      {previews.map(({ file, url }, i) => (
        <Box key={url} sx={{ position: 'relative', width: 84, height: 84, borderRadius: 2, overflow: 'hidden', border: 1, borderColor: 'divider' }}>
          <Box component="img" src={url} alt={file.name} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <IconButton size="small" onClick={() => onChange(files.filter((_, n) => n !== i))} aria-label={t('Remove photo')} sx={{ position: 'absolute', top: 2, right: 2, bgcolor: 'rgba(0,0,0,0.55)', color: '#fff', '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' } }}>
            <CloseRoundedIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Box>
      ))}
      {files.length < 6 && (
        <Button component="label" variant="outlined" color="secondary" sx={{ width: 84, height: 84, flexDirection: 'column', gap: 0.5, borderStyle: 'dashed' }}>
          <AddPhotoAlternateOutlinedIcon />
          <Typography variant="caption">{t('Add')}</Typography>
          <input hidden type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(e) => onChange([...files, ...Array.from(e.target.files ?? [])].slice(0, 6))} />
        </Button>
      )}
    </Stack>
  );
}

export default function OrderFormPage() {
  const navigate = useNavigate();
  // /orders/:id/edit edits an order that is not ready yet; /orders/new books one.
  const { id: editId } = useParams();
  const editing = Boolean(editId);
  const { data: editOrder, isLoading: loadingOrder, error: loadError, refetch } = useOrderQuery(editId, { skip: !editing });
  const [updateOrder, { isLoading: updating }] = useUpdateOrderMutation();
  const { data: session } = useSession();
  const activeBranchId = useSelector((s) => s.auth.activeBranchId);
  const { data: categoryList = [] } = useCategoriesQuery();
  const categories = useMemo(() => categoryList.filter((c) => !c.parentId && c.status !== 'inactive').map((c) => ({ value: String(c.id), label: c.name })), [categoryList]);
  const [createOrder, { isLoading, error }] = useCreateOrderMutation();
  const [estimateOrder, { isLoading: estimating }] = useEstimateOrderMutation();
  const [addImage] = useAddOrderImageMutation();
  const [estimates, setEstimates] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [saving, setSaving] = useState(false);

  const { control, handleSubmit, setError, setValue, getValues, getFieldState, trigger, reset, watch } = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: { customer: null, branchId: activeBranchId ?? session.branches[0]?.id ?? '', expectedDate: '', priority: 'normal', items: [emptyItem(session.catalog)], advanceAmount: '', advanceMode: 'cash', advanceReference: '', notes: '' },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  // Errors shown by "Calculate estimate" (before any submit) go away as soon as the field is fixed.
  useEffect(() => {
    const sub = watch((_, { name, type }) => {
      if (type !== 'change' || !name) return;
      const toCheck = [name];
      // A stone change can fix the item's "more than the stone weight" error.
      const item = name.match(/^items\.\d+/)?.[0];
      if (item && name.includes('.stones') && getFieldState(`${item}.weight`).error) toCheck.push(`${item}.weight`);
      const withErrors = toCheck.filter((n) => getFieldState(n).error);
      if (withErrors.length) trigger(withErrors);
    });
    return () => sub.unsubscribe();
  }, [watch, getFieldState, trigger]);
  useEffect(() => {
    if (!editOrder) return;
    reset({
      customer: editOrder.customer,
      branchId: String(editOrder.branch?.id ?? ''),
      expectedDate: editOrder.expectedDate ?? '',
      priority: editOrder.priority ?? 'normal',
      items: editOrder.items.map(fromApiItem),
      advanceAmount: '',
      advanceMode: 'cash',
      advanceReference: '',
      notes: editOrder.notes ?? '',
    });
  }, [editOrder, reset]);
  const items = useWatch({ control, name: 'items' });
  const advanceAmount = useWatch({ control, name: 'advanceAmount' });

  const estimate = items.reduce((s, i) => s + safe(() => paiseOf(i.estimate), 0) * (Number(i.quantity) || 0), 0);
  const advance = editing ? (editOrder?.advancePaise ?? 0) : safe(() => paiseOf(advanceAmount), 0);

  const calculate = async () => {
    // Show what is missing on the form (same messages as booking) before asking for prices.
    const valid = await trigger('items');
    const v = getValues();
    let missing = false;
    v.items.forEach((i, n) => {
      if (i.pricingMode === 'rate_based' && !(Number(i.weight) > 0)) {
        setError(`items.${n}.weight`, { type: 'estimate', message: t('Enter the weight to estimate') });
        missing = true;
      }
      if (i.pricingMode === 'rate_based' && !i.purity) {
        setError(`items.${n}.purity`, { type: 'estimate', message: t('Select the purity') });
        missing = true;
      }
    });
    if (!valid || missing) return toast.error(t('Fill in the highlighted fields first'));
    const apiItems = safe(() => v.items.map(toApiItem));
    if (!apiItems) return toast.error(t('Fix the highlighted numbers first'));
    try {
      const res = await estimateOrder({ branchId: v.branchId, items: apiItems }).unwrap();
      setEstimates(res.items);
      res.items.forEach((line, n) => line.estimatedPaise != null && setValue(`items.${n}.estimate`, String(line.estimatedPaise / 100)));
      toast.success(t('Estimate {{total}} at today\'s rates', { total: formatINR(res.totalPaise, { decimals: 0 }) }));
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
    return undefined;
  };

  const onSubmit = handleSubmit(async (v) => {
    if (editing) {
      try {
        const items = v.items.map((i) => ({ ...toApiItem(i), description: i.description, estimatedPaise: paiseOf(i.estimate), huid: i.metal === 'gold' && i.huid ? i.huid : null, notes: i.notes || null }));
        await updateOrder({ id: editId, items, expectedDate: v.expectedDate || null, priority: v.priority, notes: v.notes || null }).unwrap();
        toast.success(t('Order {{orderNo}} updated', { orderNo: editOrder.orderNo }));
        navigate(`/orders/${editId}`, { replace: true });
      } catch (err) {
        const details = err?.data?.error?.details?.map((d) => ({ ...d, path: d.path.replace(/\.fixedPricePaise$/, '.fixedPrice').replace(/\.approxWeightMg$/, '.weight').replace(/\.ratePaise$/, '.rate') }));
        if (!applyServerErrors({ data: { error: { details } } }, setError)) toast.error(getErrorMessage(err));
      }
      return;
    }
    const payload = {
      branchId: v.branchId,
      customerId: v.customer.id,
      expectedDate: v.expectedDate || null,
      priority: v.priority,
      notes: v.notes || null,
      items: v.items.map((i) => ({ ...toApiItem(i), description: i.description, estimatedPaise: paiseOf(i.estimate), huid: i.metal === 'gold' && i.huid ? i.huid : null, notes: i.notes || null })),
      ...(paiseOf(v.advanceAmount) > 0 && { advance: { mode: v.advanceMode, amountPaise: paiseOf(v.advanceAmount), reference: v.advanceReference || null } }),
    };
    setSaving(true);
    try {
      const order = await createOrder(payload).unwrap();
      let failed = 0;
      for (const file of photos) {
        try {
          await addImage({ id: order.id, file }).unwrap();
        } catch {
          failed += 1;
        }
      }
      const uploaded = photos.length - failed;
      toast.success((uploaded ? (uploaded === 1 ? t('Order {{orderNo}} booked with {{uploaded}} photo', { orderNo: order.orderNo, uploaded }) : t('Order {{orderNo}} booked with {{uploaded}} photos', { orderNo: order.orderNo, uploaded })) : t('Order {{orderNo}} booked', { orderNo: order.orderNo })));
      if (failed) toast.error((failed === 1 ? t('{{failed}} photo could not be uploaded', { failed }) : t('{{failed}} photos could not be uploaded', { failed })));
      navigate('/orders', { replace: true });
    } catch (err) {
      const details = err?.data?.error?.details?.map((d) => ({
        ...d,
        path: d.path === 'customerId' ? 'customer' : d.path === 'advance.mode' ? 'advanceMode' : d.path.replace(/\.fixedPricePaise$/, '.fixedPrice').replace(/\.approxWeightMg$/, '.weight').replace(/\.ratePaise$/, '.rate'),
      }));
      if (!applyServerErrors({ data: { error: { details } } }, setError)) toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  });

  if (editing && loadingOrder) return <LoadingState />;
  if (editing && loadError) return <ErrorState error={loadError} onRetry={refetch} />;
  if (editing && editOrder && !['booked', 'in_progress'].includes(editOrder.status)) {
    return <ErrorState error={{ data: { error: { message: t('Order {{orderNo}} is {{status}} and can no longer be edited.', { orderNo: editOrder.orderNo, status: editOrder.status.replace('_', ' ') }) } } }} title={t('This order can\'t be edited')} />;
  }

  return (
    <Box component="form" noValidate onSubmit={onSubmit}>
      {editing ? (
        <PageHeader title={t('Edit order {{value}}', { value: editOrder?.orderNo ?? '' })} subtitle={t('Change the items, charges or delivery until the order is ready.')} back={{ to: `/orders/${editId}`, label: editOrder?.orderNo ?? t('Order') }} />
      ) : (
        <PageHeader title={t('New order')} subtitle={t('Book exactly what the customer wants, at the agreed charges, and take an advance.')} back={{ to: '/orders', label: t('Orders') }} />
      )}
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, lg: 'grow' }}>
          <Stack spacing={3}>
            <Card>
              <CardContent>
                <Typography variant="h4" sx={{ mb: 2 }}>
                  {t('Customer & delivery')}
                </Typography>
                <Grid container spacing={2}>
                  <Grid size={12}>
                    {editing ? (
                      <TextField label={t('Customer')} value={editOrder ? `${editOrder.customer.name} · ${editOrder.customer.mobile ?? ''}` : ''} disabled helperText={t('The customer and branch of a booked order stay the same')} />
                    ) : (
                      <Controller control={control} name="customer" render={({ field, fieldState }) => <CustomerPicker value={field.value} onChange={field.onChange} error={t(fieldState.error?.message)} autoFocus />} />
                    )}
                  </Grid>
                  {session.branches.length > 1 && !editing && (
                    <Grid size={{ xs: 12, sm: 4 }}>
                      <RHFSelect control={control} name="branchId" label={t('Branch')} options={session.branches.map((b) => ({ value: b.id, label: b.name }))} />
                    </Grid>
                  )}
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <RHFTextField control={control} name="expectedDate" label={t('Delivery date')} type="date" slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: today() } }} helperText={t('When the customer will collect')} />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <Controller
                      control={control}
                      name="priority"
                      render={({ field }) => (
                        <ToggleButtonGroup exclusive fullWidth value={field.value} onChange={(e, v) => v && field.onChange(v)} sx={{ height: 41 }} aria-label={t('Priority')}>
                          <ToggleButton value="normal">{t('Normal')}</ToggleButton>
                          <ToggleButton value="urgent" sx={{ '&.Mui-selected': { color: 'error.main', bgcolor: 'rgba(155, 44, 44, 0.08)' } }}>
                            {t('Urgent')}
                          </ToggleButton>
                        </ToggleButtonGroup>
                      )}
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
                  <Typography variant="h4">{t('Items')}</Typography>
                  <Button startIcon={<AddRoundedIcon />} onClick={() => append(emptyItem(session.catalog))}>
                    {t('Add item')}
                  </Button>
                </Stack>
                <Stack spacing={2.5}>
                  {fields.map((f, index) => (
                    <ItemCard key={f.id} index={index} control={control} setValue={setValue} categories={categories} estimate={estimates[index]} onRemove={() => remove(index)} canRemove={fields.length > 1} />
                  ))}
                </Stack>
              </CardContent>
            </Card>

            {!editing && (
            <Card>
              <CardContent>
                <Typography variant="h4" sx={{ mb: 0.5 }}>
                  {t('Design photos')}
                </Typography>
                <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                  {t('The customer\'s reference design or sketch, for the karigar. Up to 6.')}
                </Typography>
                <PhotoPicker files={photos} onChange={setPhotos} />
              </CardContent>
            </Card>
            )}
          </Stack>
        </Grid>

        {/* 20px narrower than its grid share; the left column grows to take the space. */}
        <Grid size={{ xs: 12, lg: 5, xl: 4.5 }} sx={{ width: { lg: SIDE_WIDTH(5), xl: SIDE_WIDTH(4.5) } }}>
          <Card sx={{ position: { lg: 'sticky' }, top: { lg: 88 } }}>
            <CardContent>
              <Typography variant="h4" sx={{ mb: 2 }}>
                {editing ? t('Notes & estimate') : t('Advance')}
              </Typography>
              <Stack spacing={2}>
                {editing ? (
                  <Alert severity="info" variant="outlined">
                    {t('Advance received: {{formatINR}}. Add more with “Add advance” on the order; photos are on the order page too.', { formatINR: formatINR(editOrder?.advancePaise ?? 0) })}
                  </Alert>
                ) : (
                  <>
                    <RHFTextField control={control} name="advanceAmount" label={t('Advance received (₹)')} placeholder="0" slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
                    <RHFSelect control={control} name="advanceMode" label={t('Paid by')} options={ADVANCE_MODE_OPTIONS} />
                    <RHFTextField control={control} name="advanceReference" label={t('Reference')} placeholder={t('UPI / card ref. (optional)')} />
                  </>
                )}
                <RHFTextField control={control} name="notes" label={t('Order notes')} multiline minRows={2} />
              </Stack>
              <Divider sx={{ my: 2.5 }} />
              <Button fullWidth variant="outlined" startIcon={<CalculateOutlinedIcon />} onClick={calculate} loading={estimating} sx={{ mb: 2 }}>
                {t('Calculate estimate')}
              </Button>
              <Stack spacing={1}>
                <Row label={t('Estimated total')} value={estimate ? formatINR(estimate) : '—'} />
                <Row label={t('Advance')} value={formatINR(advance)} tone={advance ? 'paid' : undefined} />
                <Row label={t('Balance due at delivery')} value={estimate ? formatINR(Math.max(0, estimate - advance)) : '—'} strong tone={estimate > advance ? 'due' : undefined} />
              </Stack>
              <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 1 }}>
                {t('Rate-based items are billed at the metal rate on the delivery day; the advance is deducted then.')}
              </Typography>
              {items.some((i) => i.pricingMode === 'fixed') && <Chip size="small" label={t('Includes fixed-price items')} sx={{ mt: 1 }} />}
              {error && !error.data?.error?.details && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {getErrorMessage(error)}
                </Alert>
              )}
              <Stack direction="row" spacing={1} sx={{ mt: 2.5 }}>
                <Button color="secondary" onClick={() => navigate(editing ? `/orders/${editId}` : '/orders')} disabled={isLoading || saving || updating}>
                  {t('Cancel')}
                </Button>
                <Button type="submit" variant="contained" size="large" loading={isLoading || saving || updating} sx={{ flex: 1 }}>
                  {editing ? t('Save changes') : t('Book order')}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

function Row({ label, value, strong, tone }) {
  return (
    <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
      <Typography variant="body2" color={strong ? 'textPrimary' : 'textSecondary'} sx={{ fontWeight: strong ? 600 : 400 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: strong ? 700 : 500, color: tone ? MONEY_TONE[tone] : 'text.primary' }}>
        {value}
      </Typography>
    </Stack>
  );
}
