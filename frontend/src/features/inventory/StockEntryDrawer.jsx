import { Alert, Grid, MenuItem, TextField, Typography } from '@mui/material';
import { ADJUSTMENT_REASONS } from '@jerp/shared';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import FormDrawer from '../../components/FormDrawer.jsx';
import { usePermission, useSession } from '../../hooks/usePermission.js';
import { getErrorMessage } from '../../utils/errors.js';
import { useCreateAdjustmentMutation, useCreateOpeningMutation, useStockEntryQuery, useUpdateOpeningMutation } from './inventoryApi.js';
import MetalLinesEditor, { emptyMetalLine, metalLinesToPayload } from './MetalLinesEditor.jsx';
import ProductPicker, { SelectedProducts } from './ProductPicker.jsx';
import { t } from '../../i18n/index.js';

const COPY = {
  opening: {
    title: t('Opening stock'),
    subtitle: t('Bring draft products and existing metal into stock.'),
    status: 'draft',
    submit: t('Post opening stock'),
    pickerLabel: t('Add draft item by SKU or name'),
  },
  adjustment: {
    title: t('Stock adjustment'),
    subtitle: t('Write off items or correct metal balances. Usually needs approval.'),
    status: 'in_stock',
    submit: t('Submit adjustment'),
    pickerLabel: t('Add in-stock item to write off'),
  },
};

// Opening stock with only the metal part, opened from Raw materials: gold already in the shop, by weight.
const METAL_ONLY = {
  title: t('Add gold'),
  subtitle: t('Gold or silver already in the shop — old gold, bullion or scrap. Enter its weight.'),
  submit: t('Add to stock'),
};

// An opening entry's saved gold, back into the editor's lines (grams and rupees as typed).
const toEditorLines = (entry) =>
  entry.metalLines.map((l) => ({ metal: l.metal, purity: l.purity, kind: l.kind, direction: 'in', weight: String(l.grossWeightMg / 1000), value: l.valuePaise ? String(l.valuePaise / 100) : '' }));

/** `editId`: correct the gold on that opening entry (gold-only, until the gold is used) instead of adding new. */
export default function StockEntryDrawer({ mode, open, onClose, initialProducts = [], metalOnly = false, editId = null }) {
  const editing = Boolean(editId);
  const { data: entry, isFetching: loadingEntry } = useStockEntryQuery(editId, { skip: !open || !editing });
  const copy = editing
    ? { ...COPY[mode], title: t('Edit {{docNo}}', { docNo: entry?.docNo ?? '' }), subtitle: t('Correct the gold on this entry. Stock and accounts are fixed to match.'), submit: t('Save changes') }
    : metalOnly
      ? { ...COPY[mode], ...METAL_ONLY }
      : COPY[mode];
  const locked = editing && entry?.edit && !entry.edit.allowed;
  const { data: session } = useSession();
  const activeBranchId = useSelector((s) => s.auth.activeBranchId);
  const showCost = usePermission('product.viewCost');
  const [branchId, setBranchId] = useState('');
  const [reason, setReason] = useState('lost');
  const [products, setProducts] = useState([]);
  const [lines, setLines] = useState([]);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState({});
  const [createOpening, openingState] = useCreateOpeningMutation();
  const [createAdjustment, adjustmentState] = useCreateAdjustmentMutation();
  const [updateOpening, updateState] = useUpdateOpeningMutation();
  const saving = openingState.isLoading || adjustmentState.isLoading || updateState.isLoading;

  // Editing: fill the form from the saved entry once it has loaded.
  useEffect(() => {
    if (!open || !editing || !entry) return;
    setBranchId(entry.branch?.id ?? '');
    setProducts([]);
    setLines(toEditorLines(entry));
    setNote(entry.note ?? '');
    setErrors({});
  }, [open, editing, entry]);

  useEffect(() => {
    if (!open || editing) return;
    // The remembered working branch may be one this user no longer has: fall back to their first branch.
    const remembered = session.branches.find((b) => String(b.id) === String(activeBranchId))?.id;
    setBranchId(initialProducts[0]?.branch?.id ?? remembered ?? session.branches[0]?.id ?? '');
    setReason('lost');
    setProducts(initialProducts);
    setLines(metalOnly ? [emptyMetalLine()] : []);
    setNote('');
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    const { payload: metalLines, errors: lineErrors } = metalLinesToPayload(lines, { includeValue: showCost });
    const next = { lines: lineErrors };
    if (!products.length && !lines.length) next.products = metalOnly || editing ? t('Add the gold') : t('Add at least one item or metal line');
    if (mode === 'adjustment' && note.trim().length < 5) next.note = t('Explain the adjustment in a few words');
    setErrors(next);
    if (next.products || next.note || Object.keys(lineErrors).length) return;

    if (editing) {
      try {
        const saved = await updateOpening({ id: editId, metalLines, note: note.trim() || null }).unwrap();
        toast.success(t('{{docNo}} updated', { docNo: saved.docNo }));
        onClose();
      } catch (err) {
        setErrors({ server: getErrorMessage(err) });
      }
      return;
    }

    const body = { branchId, productIds: products.map((p) => p.id), metalLines, note: note.trim() || undefined };
    try {
      const entry = mode === 'opening' ? await createOpening(body).unwrap() : await createAdjustment({ ...body, reason, note: note.trim() }).unwrap();
      toast.success(entry.status === 'posted' ? t('{{docNo}} posted', { docNo: entry.docNo }) : t('{{docNo}} sent for approval', { docNo: entry.docNo }));
      onClose();
    } catch (err) {
      setErrors({ server: getErrorMessage(err) });
    }
  };

  return (
    <FormDrawer open={open} title={copy.title} subtitle={copy.subtitle} onClose={onClose} onSubmit={submit} submitting={saving} submitDisabled={editing && (!entry || loadingEntry || locked)} submitLabel={copy.submit} width={760}>
      <Grid container spacing={2}>
        {locked && (
          <Grid size={12}>
            <Alert severity="warning">{t(entry.edit.reason)}</Alert>
          </Grid>
        )}
        {errors.server && (
          <Grid size={12}>
            <Alert severity="error">{errors.server}</Alert>
          </Grid>
        )}
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            select
            label={t('Branch')}
            value={branchId}
            disabled={editing}
            onChange={(e) => {
              setBranchId(e.target.value);
              setProducts([]);
            }}
          >
            {session.branches.map((b) => (
              <MenuItem key={b.id} value={b.id}>
                {b.name}
              </MenuItem>
            ))}
          </TextField>
        </Grid>
        {mode === 'adjustment' && (
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField select label={t('Reason')} value={reason} onChange={(e) => setReason(e.target.value)}>
              {ADJUSTMENT_REASONS.map((r) => (
                <MenuItem key={r.value} value={r.value}>
                  {r.label}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
        )}
        {!metalOnly && !editing && (
          <>
            <Grid size={12}>
              <Typography variant="overline" color="textSecondary">
                {mode === 'opening' ? t('Tagged items') : t('Items to write off')}
              </Typography>
            </Grid>
            <Grid size={12}>
              <ProductPicker status={copy.status} branchId={branchId} selected={products} onAdd={(p) => setProducts((list) => [...list, p])} label={copy.pickerLabel} error={errors.products} />
            </Grid>
            <Grid size={12}>
              <SelectedProducts products={products} showCost={showCost} onRemove={(id) => setProducts((list) => list.filter((p) => p.id !== id))} />
            </Grid>
            <Grid size={12}>
              <Typography variant="overline" color="textSecondary">
                {t('Metal (bullion, old gold, scrap)')}
              </Typography>
            </Grid>
          </>
        )}
        {(metalOnly || editing) && errors.products && (
          <Grid size={12}>
            <Alert severity="error">{errors.products}</Alert>
          </Grid>
        )}
        <Grid size={12}>
          <MetalLinesEditor
            lines={lines}
            onChange={setLines}
            errors={errors.lines}
            allowDirection={mode === 'adjustment'}
            defaultDirection={mode === 'adjustment' ? 'out' : 'in'}
            showValue={showCost}
          />
        </Grid>
        <Grid size={12}>
          <TextField
            label={mode === 'adjustment' ? t('Explanation') : t('Note')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            multiline
            minRows={2}
            error={Boolean(errors.note)}
            helperText={errors.note ?? (mode === 'adjustment' ? t('Shown to the approver') : ' ')}
          />
        </Grid>
      </Grid>
    </FormDrawer>
  );
}
