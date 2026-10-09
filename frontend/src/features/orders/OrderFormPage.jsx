import { zodResolver } from '@hookform/resolvers/zod';
import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CalculateOutlinedIcon from '@mui/icons-material/CalculateOutlined';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { Alert, Box, Button, Card, CardContent, Chip, Divider, Grid, IconButton, InputAdornment, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import { decimalToScaledInt, formatINR, METAL_OPTIONS, PURITIES, STONE_TYPES, toBps, toMg, toPaise } from '@jerp/shared';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useFieldArray, useForm, useWatch } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router';
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
import { useAddOrderImageMutation, useCreateOrderMutation, useEstimateOrderMutation } from './orderApi.js';
import { ADVANCE_MODE_OPTIONS } from './orderUi.jsx';

const number = (label, places) =>
  z
    .string()
    .trim()
    .refine((v) => v === '' || new RegExp(`^\\d+(\\.\\d{0,${places}})?$`).test(v), `Enter a valid ${label}`);

const stoneSchema = z.object({
  type: z.string().min(1),
  name: z.string().trim().max(60),
  count: z.string().regex(/^[1-9]\d{0,5}$/, 'Pieces'),
  weight: number('weight', 3).refine((v) => Number(v) > 0, 'Weight'),
  weightUnit: z.enum(['ct', 'g']),
  rate: number('rate', 2),
});

const itemSchema = z
  .object({
    description: z.string().trim().min(2, 'Describe the item'),
    categoryId: z.string(),
    jewelleryType: z.string(),
    metal: z.string().min(1, 'Select a metal'),
    purity: z.string(),
    weight: number('weight', 3),
    size: z.string().trim().max(40),
    quantity: z.string().regex(/^[1-9]\d{0,3}$/, 'At least 1'),
    stones: z.array(stoneSchema),
    pricingMode: z.enum(['rate_based', 'fixed']),
    fixedPrice: number('price', 2),
    wastage: number('percentage', 2).refine((v) => v === '' || Number(v) <= 50, 'Up to 50%'),
    makingType: z.enum(['per_gram', 'percent', 'fixed']),
    making: number('amount', 2),
    otherCharges: number('amount', 2),
    estimate: number('amount', 2),
    huid: z.string().trim().toUpperCase().refine((v) => v === '' || /^[A-Z0-9]{6}$/.test(v), 'HUID is 6 letters or digits'),
    notes: z.string().trim().max(500),
  })
  .refine((i) => i.pricingMode !== 'fixed' || Number(i.fixedPrice) > 0, { path: ['fixedPrice'], message: 'Enter the agreed price' });

const formSchema = z
  .object({
    customer: z.object({ id: z.string() }, { error: 'Select the customer' }).passthrough().nullable().refine(Boolean, 'Select the customer'),
    branchId: z.string().min(1, 'Select a branch'),
    expectedDate: z.string(),
    priority: z.enum(['normal', 'urgent']),
    items: z.array(itemSchema).min(1, 'Add at least one item'),
    advanceAmount: number('amount', 2),
    advanceMode: z.string(),
    advanceReference: z.string().trim().max(60),
    notes: z.string().trim().max(1000),
  })
  .refine((v) => !v.advanceAmount || Number(v.advanceAmount) === 0 || v.advanceMode, { path: ['advanceMode'], message: 'How was the advance paid?' });

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
const EMPTY_STONE = { type: 'diamond', name: '', count: '1', weight: '', weightUnit: 'ct', rate: '' };
const MAKING_LABEL = { per_gram: 'Making (₹ per gram)', percent: 'Making (% of metal)', fixed: 'Making (₹ for the piece)' };
const today = () => new Date().toISOString().slice(0, 10);
const paiseOf = (v) => (v ? toPaise(v) : 0);
const safe = (fn, fallback = null) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

/** Jewellery type follows from the metal and stones, so the form does not ask for it. */
function typeFor(i) {
  const stones = (i.stones ?? []).filter((st) => st.type);
  if (stones.some((st) => st.type === 'diamond') && i.metal !== 'silver') return 'diamond';
  if (stones.length && i.metal === 'gold') return 'studded_gold';
  return DEFAULT_TYPE[i.metal] ?? 'plain_gold';
}

/** Form item -> API item (shared by booking and estimating). */
const toApiItem = (i) => ({
  description: i.description || 'Item',
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
      title={`Stones${fields.length ? ` (${fields.length})` : ''}`}
      action={
        <Button size="small" startIcon={<AddRoundedIcon />} onClick={() => append(EMPTY_STONE)}>
          Add stone
        </Button>
      }
    >
      {fields.length === 0 ? (
        <Typography variant="caption" color="textSecondary">
          No stones. Add diamonds or gemstones the customer chose.
        </Typography>
      ) : (
        <Stack spacing={1.25}>
          {fields.map((f, i) => (
            <Grid container spacing={1.25} key={f.id} sx={{ alignItems: 'flex-start' }}>
              <Grid size={{ xs: 6, sm: 2.5 }}>
                <RHFSelect control={control} name={`${name}.${i}.type`} label="Stone" options={STONE_TYPES} />
              </Grid>
              <Grid size={{ xs: 6, sm: 3 }}>
                <RHFTextField control={control} name={`${name}.${i}.name`} label="Details" placeholder="e.g. VVS1 round" />
              </Grid>
              <Grid size={{ xs: 4, sm: 1.5 }}>
                <RHFTextField control={control} name={`${name}.${i}.count`} label="Pcs" slotProps={{ htmlInput: { inputMode: 'numeric' } }} />
              </Grid>
              <Grid size={{ xs: 8, sm: 2.5 }}>
                <Stack direction="row" spacing={0.5}>
                  <RHFTextField control={control} name={`${name}.${i}.weight`} label="Weight" slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
                  <Controller
                    control={control}
                    name={`${name}.${i}.weightUnit`}
                    render={({ field }) => (
                      <TextField select {...field} sx={{ width: 74, flexShrink: 0 }}>
                        <MenuItem value="ct">ct</MenuItem>
                        <MenuItem value="g">g</MenuItem>
                      </TextField>
                    )}
                  />
                </Stack>
              </Grid>
              <Grid size={{ xs: 10, sm: 2 }}>
                <RHFTextField control={control} name={`${name}.${i}.rate`} label={`₹ per ${stones?.[i]?.weightUnit === 'g' ? 'g' : 'ct'}`} slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
              </Grid>
              <Grid size={{ xs: 2, sm: 0.5 }} sx={{ display: 'flex', justifyContent: 'flex-end' }}>
                <IconButton size="small" onClick={() => remove(i)} aria-label="Remove stone" sx={{ mt: 0.5 }}>
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
          <Box sx={{ width: 26, height: 26, borderRadius: '50%', display: 'grid', placeItems: 'center', background: tokens.sidebar.goldGradient, color: '#171717', fontSize: 12, fontWeight: 800 }}>{index + 1}</Box>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Item {index + 1}
          </Typography>
        </Stack>
        {canRemove && (
          <Tooltip title="Remove item">
            <IconButton size="small" onClick={onRemove} aria-label={`Remove item ${index + 1}`}>
              <DeleteOutlineRoundedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </Stack>

      <Typography variant="overline" color="textSecondary">
        What to make
      </Typography>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 8 }}>
          <RHFTextField control={control} name={`${p}.description`} label="What does the customer want?" placeholder="e.g. 22K bridal necklace with matching earrings" />
        </Grid>
        <Grid size={{ xs: 12, md: 4 }}>
          <RHFSelect control={control} name={`${p}.categoryId`} label="Category" options={categories} placeholder="None" />
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Controller
            control={control}
            name={`${p}.metal`}
            render={({ field, fieldState }) => (
              <TextField
                select
                label="Metal"
                {...field}
                onChange={(e) => {
                  field.onChange(e);
                  setValue(`${p}.purity`, String(PURITIES[e.target.value]?.[0]?.fineness ?? ''));
                  setValue(`${p}.jewelleryType`, DEFAULT_TYPE[e.target.value] ?? 'plain_gold');
                }}
                error={Boolean(fieldState.error)}
                helperText={fieldState.error?.message}
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
          <RHFSelect control={control} name={`${p}.purity`} label="Purity" options={purities.map((x) => ({ value: String(x.fineness), label: x.label }))} placeholder="Not decided" />
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          <RHFTextField control={control} name={`${p}.weight`} label="Weight" slotProps={{ input: { endAdornment: <InputAdornment position="end">g</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }} />
        </Grid>
        <Grid size={{ xs: 6, md: 2 }}>
          <RHFTextField control={control} name={`${p}.size`} label="Size" placeholder="e.g. 14, 2.6" />
        </Grid>
        <Grid size={{ xs: 12, md: 2 }}>
          <RHFTextField control={control} name={`${p}.quantity`} label="Qty" slotProps={{ htmlInput: { inputMode: 'numeric' } }} />
        </Grid>
        <Grid size={12}>
          <RHFTextField control={control} name={`${p}.notes`} label="Design notes" placeholder="Finish, engraving, design reference, chain length…" multiline minRows={1} />
        </Grid>
      </Grid>

      <StonesEditor control={control} index={index} />

      <Section title="Pricing">
        <Controller
          control={control}
          name={`${p}.pricingMode`}
          render={({ field }) => (
            <ToggleButtonGroup exclusive size="small" value={field.value} onChange={(e, v) => v && field.onChange(v)} sx={{ mb: 2 }}>
              <ToggleButton value="rate_based">At day&apos;s metal rate</ToggleButton>
              <ToggleButton value="fixed">Fixed agreed price</ToggleButton>
            </ToggleButtonGroup>
          )}
        />
        {pricingMode === 'fixed' ? (
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <RHFTextField control={control} name={`${p}.fixedPrice`} label="Agreed price (₹ each, before GST)" slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
            </Grid>
          </Grid>
        ) : (
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 3 }}>
              <RHFTextField control={control} name={`${p}.wastage`} label="Wastage" placeholder="0" slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Stack direction="row" spacing={1}>
                <Controller
                  control={control}
                  name={`${p}.makingType`}
                  render={({ field }) => (
                    <ToggleButtonGroup exclusive size="small" value={field.value} onChange={(e, v) => v && field.onChange(v)} sx={{ height: 41, flexShrink: 0 }}>
                      <ToggleButton value="per_gram">₹/g</ToggleButton>
                      <ToggleButton value="percent">%</ToggleButton>
                      <ToggleButton value="fixed">₹</ToggleButton>
                    </ToggleButtonGroup>
                  )}
                />
                <RHFTextField control={control} name={`${p}.making`} label={MAKING_LABEL[makingType]} placeholder="0" slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
              </Stack>
            </Grid>
            <Grid size={{ xs: 12, sm: 3 }}>
              <RHFTextField control={control} name={`${p}.otherCharges`} label="Other charges (₹)" placeholder="0" slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
            </Grid>
          </Grid>
        )}
      </Section>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 2.5, p: 1.75, borderRadius: 2, bgcolor: 'rgba(201, 162, 39, 0.07)', border: '1px solid rgba(201, 162, 39, 0.25)', alignItems: { sm: 'center' } }}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Estimated price (each, incl. GST)
          </Typography>
          {estimate?.estimatedPaise != null ? (
            <Typography variant="caption" color="textSecondary">
              {estimate.ratePerGramPaise != null ? `At ${formatINR(estimate.ratePerGramPaise, { decimals: 0 })}/g${estimate.rateIsToday ? ' (today)' : ` (rate of ${estimate.rateDate})`} · ` : ''}
              metal {formatINR(estimate.breakdown.metalPaise + estimate.breakdown.wastagePaise, { decimals: 0 })} · making {formatINR(estimate.breakdown.makingPaise, { decimals: 0 })}
              {estimate.breakdown.stonePaise ? ` · stones ${formatINR(estimate.breakdown.stonePaise, { decimals: 0 })}` : ''} · GST {formatINR(estimate.breakdown.gstPaise, { decimals: 0 })}
            </Typography>
          ) : (
            <Typography variant="caption" color={estimate?.reason ? 'warning.main' : 'textSecondary'}>
              {estimate?.reason ?? 'Use Calculate estimate, or type an amount you agreed.'}
            </Typography>
          )}
        </Box>
        <Box sx={{ width: { sm: 200 } }}>
          <RHFTextField control={control} name={`${p}.estimate`} label="Estimate (₹ each)" slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
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
          <IconButton size="small" onClick={() => onChange(files.filter((_, n) => n !== i))} aria-label="Remove photo" sx={{ position: 'absolute', top: 2, right: 2, bgcolor: 'rgba(0,0,0,0.55)', color: '#fff', '&:hover': { bgcolor: 'rgba(0,0,0,0.75)' } }}>
            <CloseRoundedIcon sx={{ fontSize: 14 }} />
          </IconButton>
        </Box>
      ))}
      {files.length < 6 && (
        <Button component="label" variant="outlined" color="secondary" sx={{ width: 84, height: 84, flexDirection: 'column', gap: 0.5, borderStyle: 'dashed' }}>
          <AddPhotoAlternateOutlinedIcon />
          <Typography variant="caption">Add</Typography>
          <input hidden type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(e) => onChange([...files, ...Array.from(e.target.files ?? [])].slice(0, 6))} />
        </Button>
      )}
    </Stack>
  );
}

export default function OrderFormPage() {
  const navigate = useNavigate();
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

  const { control, handleSubmit, setError, setValue, getValues } = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: { customer: null, branchId: activeBranchId ?? session.branches[0]?.id ?? '', expectedDate: '', priority: 'normal', items: [emptyItem(session.catalog)], advanceAmount: '', advanceMode: 'cash', advanceReference: '', notes: '' },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const items = useWatch({ control, name: 'items' });
  const advanceAmount = useWatch({ control, name: 'advanceAmount' });

  const estimate = items.reduce((s, i) => s + safe(() => paiseOf(i.estimate), 0) * (Number(i.quantity) || 0), 0);
  const advance = safe(() => paiseOf(advanceAmount), 0);

  const calculate = async () => {
    const v = getValues();
    const apiItems = safe(() => v.items.map(toApiItem));
    if (!apiItems) return toast.error('Fix the highlighted numbers first');
    try {
      const res = await estimateOrder({ branchId: v.branchId, items: apiItems }).unwrap();
      setEstimates(res.items);
      res.items.forEach((line, n) => line.estimatedPaise != null && setValue(`items.${n}.estimate`, String(line.estimatedPaise / 100)));
      toast.success(`Estimate ${formatINR(res.totalPaise, { decimals: 0 })} at today's rates`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
    return undefined;
  };

  const onSubmit = handleSubmit(async (v) => {
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
      toast.success(`Order ${order.orderNo} booked${uploaded ? ` with ${uploaded} photo${uploaded === 1 ? '' : 's'}` : ''}`);
      if (failed) toast.error(`${failed} photo${failed === 1 ? '' : 's'} could not be uploaded`);
      navigate(`/orders/${order.id}`, { replace: true });
    } catch (err) {
      const details = err?.data?.error?.details?.map((d) => ({
        ...d,
        path: d.path === 'customerId' ? 'customer' : d.path === 'advance.mode' ? 'advanceMode' : d.path.replace(/\.fixedPricePaise$/, '.fixedPrice').replace(/\.approxWeightMg$/, '.weight'),
      }));
      if (!applyServerErrors({ data: { error: { details } } }, setError)) toast.error(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  });

  return (
    <Box component="form" noValidate onSubmit={onSubmit}>
      <PageHeader title="New order" subtitle="Book exactly what the customer wants, at the agreed charges, and take an advance." back={{ to: '/orders', label: 'Orders' }} />
      <Grid container spacing={3}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Stack spacing={3}>
            <Card>
              <CardContent>
                <Typography variant="h4" sx={{ mb: 2 }}>
                  Customer &amp; delivery
                </Typography>
                <Grid container spacing={2}>
                  <Grid size={12}>
                    <Controller control={control} name="customer" render={({ field, fieldState }) => <CustomerPicker value={field.value} onChange={field.onChange} error={fieldState.error?.message} autoFocus />} />
                  </Grid>
                  {session.branches.length > 1 && (
                    <Grid size={{ xs: 12, sm: 4 }}>
                      <RHFSelect control={control} name="branchId" label="Branch" options={session.branches.map((b) => ({ value: b.id, label: b.name }))} />
                    </Grid>
                  )}
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <RHFTextField control={control} name="expectedDate" label="Delivery date" type="date" slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: today() } }} helperText="When the customer will collect" />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 4 }}>
                    <Controller
                      control={control}
                      name="priority"
                      render={({ field }) => (
                        <ToggleButtonGroup exclusive fullWidth value={field.value} onChange={(e, v) => v && field.onChange(v)} sx={{ height: 41 }} aria-label="Priority">
                          <ToggleButton value="normal">Normal</ToggleButton>
                          <ToggleButton value="urgent" sx={{ '&.Mui-selected': { color: 'error.main', bgcolor: 'rgba(155, 44, 44, 0.08)' } }}>
                            Urgent
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
                  <Typography variant="h4">Items</Typography>
                  <Button startIcon={<AddRoundedIcon />} onClick={() => append(emptyItem(session.catalog))}>
                    Add item
                  </Button>
                </Stack>
                <Stack spacing={2.5}>
                  {fields.map((f, index) => (
                    <ItemCard key={f.id} index={index} control={control} setValue={setValue} categories={categories} estimate={estimates[index]} onRemove={() => remove(index)} canRemove={fields.length > 1} />
                  ))}
                </Stack>
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <Typography variant="h4" sx={{ mb: 0.5 }}>
                  Design photos
                </Typography>
                <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
                  The customer&apos;s reference design or sketch, for the karigar. Up to 6.
                </Typography>
                <PhotoPicker files={photos} onChange={setPhotos} />
              </CardContent>
            </Card>
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Card sx={{ position: { lg: 'sticky' }, top: { lg: 88 } }}>
            <CardContent>
              <Typography variant="h4" sx={{ mb: 2 }}>
                Advance
              </Typography>
              <Stack spacing={2}>
                <RHFTextField control={control} name="advanceAmount" label="Advance received (₹)" placeholder="0" slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
                <RHFSelect control={control} name="advanceMode" label="Paid by" options={ADVANCE_MODE_OPTIONS} />
                <RHFTextField control={control} name="advanceReference" label="Reference" placeholder="UPI / card ref. (optional)" />
                <RHFTextField control={control} name="notes" label="Order notes" multiline minRows={2} />
              </Stack>
              <Divider sx={{ my: 2.5 }} />
              <Button fullWidth variant="outlined" startIcon={<CalculateOutlinedIcon />} onClick={calculate} loading={estimating} sx={{ mb: 2 }}>
                Calculate estimate
              </Button>
              <Stack spacing={1}>
                <Row label="Estimated total" value={estimate ? formatINR(estimate) : '—'} />
                <Row label="Advance" value={formatINR(advance)} tone={advance ? 'paid' : undefined} />
                <Row label="Balance due at delivery" value={estimate ? formatINR(Math.max(0, estimate - advance)) : '—'} strong tone={estimate > advance ? 'due' : undefined} />
              </Stack>
              <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 1 }}>
                Rate-based items are billed at the metal rate on the delivery day; the advance is deducted then.
              </Typography>
              {items.some((i) => i.pricingMode === 'fixed') && <Chip size="small" label="Includes fixed-price items" sx={{ mt: 1 }} />}
              {error && !error.data?.error?.details && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {getErrorMessage(error)}
                </Alert>
              )}
              <Stack direction="row" spacing={1} sx={{ mt: 2.5 }}>
                <Button color="secondary" onClick={() => navigate('/orders')} disabled={isLoading || saving}>
                  Cancel
                </Button>
                <Button type="submit" variant="contained" size="large" loading={isLoading || saving} sx={{ flex: 1 }}>
                  Book order
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
