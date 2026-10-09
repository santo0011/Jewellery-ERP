import { zodResolver } from '@hookform/resolvers/zod';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Grid, InputAdornment, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { formatWeight, PURITIES, toMg, toPaise } from '@jerp/shared';
import { useEffect, useMemo } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';
import RHFSelect from '../../components/form/RHFSelect.jsx';
import RHFTextField from '../../components/form/RHFTextField.jsx';
import { useSession } from '../../hooks/usePermission.js';
import { applyServerErrors, getErrorMessage } from '../../utils/errors.js';
import { useCategoriesQuery } from '../categories/categoryApi.js';
import { useFinishOrderItemMutation } from './orderApi.js';

const decimal = (label, places) => z.string().trim().regex(new RegExp(`^\\d+(\\.\\d{0,${places}})?$`), `Enter ${label}`);
const formSchema = z.object({
  weight: decimal('the final weight', 3).refine((v) => Number(v) > 0, 'Weight must be more than zero'),
  purity: z.string().min(1, 'Select the purity'),
  categoryId: z.string(),
  huid: z.string().trim().toUpperCase().refine((v) => v === '' || /^[A-Z0-9]{6}$/.test(v), 'HUID is 6 letters or digits'),
  wastage: z.string().trim().refine((v) => v === '' || /^\d+(\.\d{0,2})?$/.test(v), 'Enter a number'),
  makingType: z.enum(['per_gram', 'percent', 'fixed']),
  making: z.string().trim().refine((v) => v === '' || /^\d+(\.\d{0,2})?$/.test(v), 'Enter a number'),
});

const MAKING_LABEL = { per_gram: 'Making (₹ per gram)', percent: 'Making (% of metal)', fixed: 'Making (₹ for the piece)' };

/** The karigar has delivered the piece: record its real weight and charges; it is tagged and put in stock. */
export default function FinishItemDialog({ order, index, onClose, onFinished }) {
  const item = index == null ? null : order?.items[index];
  const { data: session } = useSession();
  const { data: categoryList = [] } = useCategoriesQuery();
  const categories = useMemo(() => categoryList.filter((c) => !c.parentId).map((c) => ({ value: String(c.id), label: c.name })), [categoryList]);
  const [finish, { isLoading, error, reset: resetMutation }] = useFinishOrderItemMutation();
  const { control, handleSubmit, reset, setError } = useForm({ resolver: zodResolver(formSchema) });
  const makingType = useWatch({ control, name: 'makingType' });

  useEffect(() => {
    if (item) {
      reset({
        weight: item.approxWeightMg ? String(item.approxWeightMg / 1000) : '',
        purity: item.purity ? String(item.purity) : '',
        categoryId: item.categoryId ? String(item.categoryId) : '',
        huid: item.huid ?? '',
        // Pre-filled with what was agreed on the order.
        wastage: item.wastage?.mode === 'percent' && item.wastage.value ? String(item.wastage.value / 100) : '',
        makingType: item.making?.type ?? (session?.catalog?.defaultMakingChargeType === 'percent' ? 'percent' : 'per_gram'),
        making: item.making?.value ? String(item.making.value / 100) : '', // bps and paise both scale by 100
      });
      resetMutation();
    }
    // Only when it opens: resetMutation changes identity once a request starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, index]);

  const huidRequired = item?.metal === 'gold' && Boolean(session?.catalog?.huidMandatory);
  const onSubmit = handleSubmit(async (v) => {
    if (huidRequired && !v.huid) return setError('huid', { message: 'HUID is required to bill hallmarked gold' });
    const makingValue = v.making ? (v.makingType === 'percent' ? Math.round(Number(v.making) * 100) : toPaise(v.making)) : 0;
    try {
      const updated = await finish({
        id: order.id,
        index,
        grossWeightMg: toMg(v.weight),
        purity: Number(v.purity),
        categoryId: v.categoryId || null,
        huid: v.huid || null,
        wastage: v.wastage ? { mode: 'percent', value: Math.round(Number(v.wastage) * 100) } : { mode: 'none', value: 0 },
        making: { type: v.makingType, value: makingValue },
      }).unwrap();
      const product = updated.items[index].product;
      toast.success(`Tagged as ${product.sku} and added to stock`);
      onFinished?.(product, updated);
      onClose();
    } catch (err) {
      applyServerErrors({ data: { error: { details: err?.data?.error?.details?.map((d) => ({ ...d, path: { grossWeightMg: 'weight', 'making.value': 'making', 'wastage.value': 'wastage' }[d.path] ?? d.path })) } } }, setError);
    }
    return undefined;
  });

  if (!item) return null;
  const purities = (PURITIES[item.metal] ?? []).map((p) => ({ value: String(p.fineness), label: p.label }));

  return (
    <Dialog open onClose={isLoading ? undefined : onClose} maxWidth="sm" fullWidth>
      <form noValidate onSubmit={onSubmit}>
        <DialogTitle sx={{ fontWeight: 600 }}>Finish item</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
            <strong>{item.description}</strong>
            {item.approxWeightMg ? ` · ordered ~${formatWeight(item.approxWeightMg)}` : ''}
            {item.size ? ` · size ${item.size}` : ''}. Enter the finished piece&apos;s real details: it gets a tag, goes into stock at {order.branch?.name ?? 'the branch'}, and can be billed.
          </Typography>
          {error && !error.data?.error?.details && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {getErrorMessage(error)}
            </Alert>
          )}
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <RHFTextField control={control} name="weight" label="Final gross weight" autoFocus slotProps={{ input: { endAdornment: <InputAdornment position="end">g</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <RHFSelect control={control} name="purity" label="Purity" options={purities} placeholder="Select purity" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <RHFSelect control={control} name="categoryId" label="Category" options={categories} placeholder="Custom Jewellery" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <RHFTextField control={control} name="huid" label="HUID" placeholder="6-character hallmark ID" required={huidRequired} helperText={huidRequired ? 'Required: hallmarked gold cannot be billed without it' : 'Optional'} />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <RHFTextField control={control} name="wastage" label="Wastage" placeholder="0" slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }} />
            </Grid>
            <Grid size={{ xs: 12, sm: 8 }}>
              <Stack direction="row" spacing={1}>
                <Controller
                  control={control}
                  name="makingType"
                  render={({ field }) => (
                    <ToggleButtonGroup exclusive size="small" value={field.value} onChange={(e, v) => v && field.onChange(v)} sx={{ height: 41, flexShrink: 0 }}>
                      <ToggleButton value="per_gram">₹/g</ToggleButton>
                      <ToggleButton value="percent">%</ToggleButton>
                      <ToggleButton value="fixed">₹</ToggleButton>
                    </ToggleButtonGroup>
                  )}
                />
                <RHFTextField control={control} name="making" label={MAKING_LABEL[makingType] ?? 'Making'} placeholder="0" slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
              </Stack>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" loading={isLoading}>
            Tag &amp; add to stock
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
