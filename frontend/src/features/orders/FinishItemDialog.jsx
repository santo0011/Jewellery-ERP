import { zodResolver } from '@hookform/resolvers/zod';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Grid, IconButton, InputAdornment, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { fineWeightMg, formatWeight, METAL_POOL_KINDS, PURITIES, toMg, toPaise } from '@jerp/shared';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import toast from 'react-hot-toast';
import { z } from 'zod';
import RHFSelect from '../../components/form/RHFSelect.jsx';
import RHFTextField from '../../components/form/RHFTextField.jsx';
import { useSession } from '../../hooks/usePermission.js';
import { applyServerErrors, getErrorMessage } from '../../utils/errors.js';
import { useCategoriesQuery } from '../categories/categoryApi.js';
import { useStockSummaryQuery } from '../inventory/inventoryApi.js';
import { purityLabel } from '../products/productForm.js';
import { useFinishOrderItemMutation } from './orderApi.js';
import KeepOnPhone from '../../components/KeepOnPhone.jsx';
import { t } from '../../i18n/index.js';

const decimal = (label, places) => z.string().trim().regex(new RegExp(`^\\d+(\\.\\d{0,${places}})?$`), t('Enter {{label}}', { label }));
const formSchema = z.object({
  weight: decimal(t('the final weight'), 3).refine((v) => Number(v) > 0, t('Weight must be more than zero')),
  purity: z.string().min(1, t('Select the purity')),
  categoryId: z.string(),
  huid: z.string().trim().toUpperCase().refine((v) => v === '' || /^[A-Z0-9]{6}$/.test(v), t('HUID is 6 letters or digits')),
  wastage: z.string().trim().refine((v) => v === '' || /^\d+(\.\d{0,2})?$/.test(v), t('Enter a number')),
  makingType: z.enum(['per_gram', 'percent', 'fixed']),
  making: z.string().trim().refine((v) => v === '' || /^\d+(\.\d{0,2})?$/.test(v), t('Enter a number')),
});

const MAKING_LABEL = { per_gram: t('Making (₹ per gram)'), percent: t('Making (% of metal)'), fixed: t('Making (₹ for the piece)') };

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

  // Gold given to the karigar: the customer's own (left on this order) and/or the shop's raw stock at this branch.
  const { data: stockData } = useStockSummaryQuery({}, { skip: !item });
  const shopPools = (stockData?.metalPools ?? []).filter((p) => String(p.branch?.id) === String(order?.branch?.id) && p.metal === item?.metal && p.kind !== 'customer_gold' && p.grossMg > 0);
  const customerLeft = (order?.customerMetalBalance ?? []).filter((r) => r.metal === item?.metal && r.leftMg > 0);
  const [fromCustomer, setFromCustomer] = useState({}); // purity → grams typed
  const [fromShop, setFromShop] = useState([]); // [{ key, weight }]
  const [karigar, setKarigar] = useState('');
  const [karigarMode, setKarigarMode] = useState('cash');
  const finalWeight = useWatch({ control, name: 'weight' });
  const finalPurity = useWatch({ control, name: 'purity' });
  useEffect(() => {
    if (!item) return;
    // Start with all the customer's gold that is left; shop gold is added only if needed.
    setFromCustomer(Object.fromEntries(customerLeft.map((r) => [r.purity, String(r.leftMg / 1000)])));
    setFromShop([]);
    setKarigar('');
    setKarigarMode('cash');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, index]);
  const mgOf = (v) => (v && Number(v) > 0 ? toMg(v) : 0);
  const poolKey = (p) => `${p.purity}|${p.kind}`;
  const materials = [
    ...customerLeft.filter((r) => mgOf(fromCustomer[r.purity]) > 0).map((r) => ({ source: 'customer', metal: r.metal, purity: r.purity, grossWeightMg: mgOf(fromCustomer[r.purity]) })),
    ...fromShop.filter((s) => mgOf(s.weight) > 0).map((s) => {
      const [purity, kind] = s.key.split('|');
      return { source: 'shop', metal: item.metal, purity: Number(purity), kind, grossWeightMg: mgOf(s.weight) };
    }),
  ];
  const givenFine = materials.reduce((n, m) => n + fineWeightMg(m.grossWeightMg, m.purity), 0);
  const finishedFine = finalWeight && finalPurity && Number(finalWeight) > 0 ? fineWeightMg(toMg(finalWeight), Number(finalPurity)) : 0;

  const huidRequired = item?.metal === 'gold' && Boolean(session?.catalog?.huidMandatory);
  const onSubmit = handleSubmit(async (v) => {
    if (huidRequired && !v.huid) return setError('huid', { message: t('HUID is required to bill hallmarked gold') });
    const makingValue = v.making ? (v.makingType === 'percent' ? Math.round(Number(v.making) * 100) : toPaise(v.making)) : 0;
    const karigarPaise = karigar && Number(karigar) > 0 ? toPaise(karigar) : 0;
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
        materials,
        karigarPaise,
        ...(karigarPaise > 0 && { karigarMode }),
      }).unwrap();
      const product = updated.items[index].product;
      toast.success(t('{{sku}} is ready for delivery', { sku: product.sku }));
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
        <DialogTitle sx={{ fontWeight: 600 }}>{t('Finish item')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
            <strong>{item.description}</strong>
            {item.approxWeightMg ? t(' · ordered ~{{approxWeight}}', { approxWeight: formatWeight(item.approxWeightMg) }) : ''}
            {item.size ? t(' · size {{size}}', { size: item.size }) : ''}
            {'. '}
            {t('Enter the gold given to the karigar and the finished piece. It gets a tag and stays with this order (not in Products) until it is delivered.')}
          </Typography>
          {error && !error.data?.error?.details && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {getErrorMessage(error)}
            </Alert>
          )}
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <RHFTextField control={control} name="weight" label={t('Final gross weight')} autoFocus slotProps={{ input: { endAdornment: <InputAdornment position="end">{t('g')}</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <RHFSelect control={control} name="purity" label={t('Purity')} options={purities} placeholder={t('Select purity')} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <RHFSelect control={control} name="categoryId" label={t('Category')} options={categories} placeholder={t('Custom Jewellery')} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <RHFTextField control={control} name="huid" label={t('HUID')} placeholder={t('6-character hallmark ID')} required={huidRequired} helperText={<KeepOnPhone>{huidRequired ? t('Required: hallmarked gold cannot be billed without it') : t('Optional')}</KeepOnPhone>} />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <RHFTextField control={control} name="wastage" label={t('Wastage')} placeholder="0" slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }} />
            </Grid>
            <Grid size={{ xs: 12, sm: 8 }}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                <Controller
                  control={control}
                  name="makingType"
                  render={({ field }) => (
                    <ToggleButtonGroup exclusive size="small" value={field.value} onChange={(e, v) => v && field.onChange(v)} aria-label={t('Making charge type')} sx={{ height: 41, flexShrink: 0, width: { xs: '100%', sm: 'auto' }, '& .MuiToggleButton-root': { flex: { xs: 1, sm: 'none' }, minWidth: 44, fontWeight: 700 } }}>
                      <ToggleButton value="per_gram">{t('₹/g')}</ToggleButton>
                      <ToggleButton value="percent">%</ToggleButton>
                      <ToggleButton value="fixed">₹</ToggleButton>
                    </ToggleButtonGroup>
                  )}
                />
                <RHFTextField control={control} name="making" label={MAKING_LABEL[makingType] ?? t('Making')} placeholder="0" slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
              </Stack>
            </Grid>
          </Grid>

          <Divider sx={{ my: 2.5 }} />
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            {t('Gold given to the karigar')}
          </Typography>
          <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mb: 1.5 }}>
            {t('The customer’s own gold first; add shop stock if more was needed. Leave empty for a piece bought ready.')}
          </Typography>
          <Stack spacing={1.25}>
            {customerLeft.map((r) => (
              <TextField
                key={r.purity}
                size="small"
                label={t('From customer · {{purity}} ({{left}} left)', { purity: purityLabel(r.metal, r.purity), left: formatWeight(r.leftMg) })}
                value={fromCustomer[r.purity] ?? ''}
                onChange={(e) => setFromCustomer((x) => ({ ...x, [r.purity]: e.target.value.replace(/[^\d.]/g, '') }))}
                slotProps={{ input: { endAdornment: <InputAdornment position="end">{t('g')}</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }}
              />
            ))}
            {fromShop.map((s, i) => (
              <Stack key={i} direction="row" spacing={1}>
                <TextField size="small" select label={t('From shop stock')} value={s.key} onChange={(e) => setFromShop((list) => list.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))} sx={{ flex: 1, minWidth: 0 }}>
                  {shopPools.map((p) => (
                    <MenuItem key={poolKey(p)} value={poolKey(p)}>
                      {purityLabel(p.metal, p.purity)} · {METAL_POOL_KINDS.find((k) => k.value === p.kind)?.label ?? p.kind} · {formatWeight(p.grossMg)}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField size="small" label={t('Weight')} value={s.weight} onChange={(e) => setFromShop((list) => list.map((x, j) => (j === i ? { ...x, weight: e.target.value.replace(/[^\d.]/g, '') } : x)))} sx={{ width: 120, flexShrink: 0 }} slotProps={{ input: { endAdornment: <InputAdornment position="end">{t('g')}</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }} />
                <IconButton size="small" onClick={() => setFromShop((list) => list.filter((_, j) => j !== i))} aria-label={t('Remove')}>
                  <CloseRoundedIcon fontSize="small" />
                </IconButton>
              </Stack>
            ))}
            {shopPools.length > 0 ? (
              <Button size="small" startIcon={<AddRoundedIcon />} onClick={() => setFromShop((list) => [...list, { key: poolKey(shopPools[0]), weight: '' }])} sx={{ alignSelf: 'flex-start' }}>
                {t('Gold from shop stock')}
              </Button>
            ) : (
              !customerLeft.length && (
                <Typography variant="caption" color="textSecondary">
                  {t('No customer gold on this order and no raw gold in stock at this branch.')}
                </Typography>
              )
            )}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <TextField size="small" label={t('Karigar charge (optional)')} value={karigar} onChange={(e) => setKarigar(e.target.value.replace(/[^\d.]/g, ''))} slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }} />
              {Number(karigar) > 0 && (
                <ToggleButtonGroup exclusive size="small" value={karigarMode} onChange={(e, v) => v && setKarigarMode(v)} sx={{ flexShrink: 0, height: 40 }}>
                  <ToggleButton value="cash">{t('Cash')}</ToggleButton>
                  <ToggleButton value="upi">{t('UPI')}</ToggleButton>
                  <ToggleButton value="bank">{t('Bank')}</ToggleButton>
                </ToggleButtonGroup>
              )}
            </Stack>
            {materials.length > 0 && (
              <Typography variant="caption" color="textSecondary">
                {t('Given {{given}} fine · in the piece {{finished}} fine · wastage {{wastage}}', { given: formatWeight(givenFine), finished: finishedFine ? formatWeight(finishedFine) : '—', wastage: finishedFine ? formatWeight(givenFine - finishedFine) : '—' })}
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="secondary" onClick={onClose} disabled={isLoading}>
            {t('Cancel')}
          </Button>
          <Button type="submit" variant="contained" loading={isLoading}>
            {t('Save piece')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
