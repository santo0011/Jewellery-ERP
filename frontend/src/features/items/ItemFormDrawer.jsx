import { Alert, Grid, InputAdornment, MenuItem, TextField, Typography } from '@mui/material';
import { decimalToScaledInt, JEWELLERY_TYPES, METAL_OPTIONS, PURITIES, toPaise } from '@jerp/shared';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import FormDrawer from '../../components/FormDrawer.jsx';
import { useSession } from '../../hooks/usePermission.js';
import { getErrorMessage } from '../../utils/errors.js';
import { useCategoriesQuery } from '../categories/categoryApi.js';
import { useCreateItemMutation, useUpdateItemMutation } from './itemApi.js';

const num = (v) => v.replace(/[^\d.]/g, '');
const scaled = (v, places) => {
  try {
    return v === '' ? 0 : (decimalToScaledInt(v, places) ?? null);
  } catch {
    return null;
  }
};
const paise = (v) => {
  try {
    return v === '' ? 0 : (toPaise(v) ?? null);
  } catch {
    return null;
  }
};
// Stored units: wastage % and making % in basis points, wastage weight in mg, money in paise.
const show = (value, places) => (value ? String(value / 10 ** places) : '');

const blank = (name = '', catalog) => ({
  name,
  categoryId: '',
  jewelleryType: 'plain_gold',
  metal: 'gold',
  purity: catalog?.enabledPurities?.gold?.[0] ?? 916,
  wastageMode: 'percent',
  wastage: '',
  makingType: 'per_gram',
  making: '',
  hsnCode: '',
  description: '',
});
const fromItem = (i) => ({
  name: i.name,
  categoryId: String(i.category?.id ?? ''),
  jewelleryType: i.jewelleryType,
  metal: i.metal,
  purity: i.purity,
  wastageMode: i.wastage?.mode ?? 'none',
  wastage: i.wastage?.mode === 'weight' ? show(i.wastage.value, 3) : show(i.wastage?.value, 2),
  makingType: i.making?.type ?? 'per_gram',
  making: i.making?.type === 'percent' ? show(i.making.value, 2) : show(i.making?.value, 2),
  hsnCode: i.hsnCode ?? '',
  description: i.description ?? '',
});

/** Add or edit a catalogue item. `defaultName` pre-fills a new item (from a search); `onSaved` gets the saved item. */
export default function ItemFormDrawer({ open, item, defaultName = '', onClose, onSaved }) {
  const { data: session } = useSession();
  const catalog = session.catalog;
  const { data: categories } = useCategoriesQuery(undefined, { skip: !open });
  const [create, createState] = useCreateItemMutation();
  const [update, updateState] = useUpdateItemMutation();
  const [f, setF] = useState(blank('', catalog));
  const [errors, setErrors] = useState({});
  const editing = Boolean(item);

  useEffect(() => {
    if (!open) return;
    setF(item ? fromItem(item) : blank(defaultName, catalog));
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item, defaultName]);

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const purities = (PURITIES[f.metal] ?? []).filter((p) => catalog.enabledPurities[f.metal]?.includes(p.fineness) || (editing && item.metal === f.metal && item.purity === p.fineness));
  const topCategories = (categories ?? []).filter((c) => !c.parentId);

  const submit = async (e) => {
    e?.preventDefault?.();
    const wastageValue = f.wastageMode === 'none' ? 0 : f.wastageMode === 'weight' ? scaled(f.wastage, 3) : scaled(f.wastage, 2);
    const makingValue = f.makingType === 'percent' ? scaled(f.making, 2) : paise(f.making);
    const errs = {};
    if (f.name.trim().length < 2) errs.name = 'Enter the item name';
    if (!f.categoryId) errs.categoryId = 'Pick a category';
    if (wastageValue === null) errs.wastage = 'Enter a valid number';
    if (makingValue === null) errs.making = 'Enter a valid number';
    if (f.hsnCode && !/^\d{4,8}$/.test(f.hsnCode)) errs.hsnCode = '4 to 8 digits';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const body = {
      name: f.name.trim(),
      categoryId: f.categoryId,
      jewelleryType: f.jewelleryType,
      metal: f.metal,
      purity: Number(f.purity),
      wastage: { mode: f.wastageMode, value: wastageValue },
      making: { type: f.makingType, value: makingValue },
      hsnCode: f.hsnCode,
      description: f.description.trim() || null,
    };
    try {
      const saved = editing ? await update({ id: item.id, ...body }).unwrap() : await create(body).unwrap();
      toast.success(editing ? `${saved.name} updated` : `${saved.name} saved as ${saved.code}`);
      onSaved?.(saved);
      onClose();
    } catch (err) {
      const details = err?.data?.error?.details;
      if (details?.length) setErrors(Object.fromEntries(details.map((d) => [d.path, d.message])));
      else toast.error(getErrorMessage(err));
    }
  };

  return (
    <FormDrawer
      open={open}
      title={editing ? `Edit ${item.code}` : 'New item'}
      subtitle="Save the details once — then just pick it on purchases."
      onClose={onClose}
      onSubmit={submit}
      submitting={createState.isLoading || updateState.isLoading}
      submitLabel={editing ? 'Save changes' : 'Save item'}
      width={520}
    >
      <Grid container spacing={2}>
        <Grid size={12}>
          <TextField label="Item name" placeholder="e.g. Plain gold ring, Kolkata bala" value={f.name} onChange={set('name')} error={Boolean(errors.name)} helperText={errors.name} autoFocus={!f.name} slotProps={{ htmlInput: { maxLength: 120 } }} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField select label="Category" value={f.categoryId} onChange={set('categoryId')} error={Boolean(errors.categoryId)} helperText={errors.categoryId}>
            {topCategories.map((c) => (
              <MenuItem key={c.id} value={String(c.id)}>
                {c.name}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField select label="Type" value={f.jewelleryType} onChange={set('jewelleryType')}>
            {JEWELLERY_TYPES.map((t) => (
              <MenuItem key={t.value} value={t.value}>
                {t.label}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={6}>
          <TextField select label="Metal" value={f.metal} onChange={(e) => setF((x) => ({ ...x, metal: e.target.value, purity: catalog.enabledPurities[e.target.value]?.[0] ?? '' }))}>
            {METAL_OPTIONS.map((m) => (
              <MenuItem key={m.value} value={m.value}>
                {m.label}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        <Grid size={6}>
          <TextField select label="Purity" value={f.purity} onChange={set('purity')} error={Boolean(errors.purity)} helperText={errors.purity}>
            {purities.map((p) => (
              <MenuItem key={p.fineness} value={p.fineness}>
                {p.label}
              </MenuItem>
            ))}
          </TextField>
        </Grid>

        <Grid size={12}>
          <Typography variant="overline" color="textSecondary">
            Charges used when selling
          </Typography>
        </Grid>
        <Grid size={6}>
          <TextField select label="Wastage" value={f.wastageMode} onChange={set('wastageMode')}>
            <MenuItem value="percent">Percent</MenuItem>
            <MenuItem value="weight">Weight (g)</MenuItem>
            <MenuItem value="none">None</MenuItem>
          </TextField>
        </Grid>
        <Grid size={6}>
          <TextField
            label="Wastage value"
            value={f.wastageMode === 'none' ? '' : f.wastage}
            disabled={f.wastageMode === 'none'}
            onChange={(e) => setF((x) => ({ ...x, wastage: num(e.target.value) }))}
            error={Boolean(errors.wastage)}
            helperText={errors.wastage}
            slotProps={{ input: { endAdornment: <InputAdornment position="end">{f.wastageMode === 'weight' ? 'g' : '%'}</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }}
          />
        </Grid>
        <Grid size={6}>
          <TextField select label="Making charge" value={f.makingType} onChange={set('makingType')}>
            <MenuItem value="per_gram">Per gram</MenuItem>
            <MenuItem value="percent">Percent of metal</MenuItem>
            <MenuItem value="fixed">Fixed per piece</MenuItem>
          </TextField>
        </Grid>
        <Grid size={6}>
          <TextField
            label="Making value"
            value={f.making}
            onChange={(e) => setF((x) => ({ ...x, making: num(e.target.value) }))}
            error={Boolean(errors.making)}
            helperText={errors.making}
            slotProps={{
              input: f.makingType === 'percent' ? { endAdornment: <InputAdornment position="end">%</InputAdornment> } : { startAdornment: <InputAdornment position="start">₹</InputAdornment>, ...(f.makingType === 'per_gram' && { endAdornment: <InputAdornment position="end">/g</InputAdornment> }) },
              htmlInput: { inputMode: 'decimal' },
            }}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 5 }}>
          <TextField label="HSN (optional)" value={f.hsnCode} onChange={(e) => setF((x) => ({ ...x, hsnCode: e.target.value.replace(/\D/g, '') }))} error={Boolean(errors.hsnCode)} helperText={errors.hsnCode ?? 'Blank = category’s HSN'} slotProps={{ htmlInput: { maxLength: 8 } }} />
        </Grid>
        <Grid size={{ xs: 12, sm: 7 }}>
          <TextField label="Description (optional)" value={f.description} onChange={set('description')} slotProps={{ htmlInput: { maxLength: 300 } }} />
        </Grid>
        {errors.name?.startsWith('Already') && (
          <Grid size={12}>
            <Alert severity="info">This item is already saved — pick it from the list instead.</Alert>
          </Grid>
        )}
      </Grid>
    </FormDrawer>
  );
}
