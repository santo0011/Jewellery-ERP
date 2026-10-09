import { Alert, Grid, MenuItem, TextField, Typography } from '@mui/material';
import { ADJUSTMENT_REASONS } from '@jerp/shared';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import FormDrawer from '../../components/FormDrawer.jsx';
import { usePermission, useSession } from '../../hooks/usePermission.js';
import { getErrorMessage } from '../../utils/errors.js';
import { useCreateAdjustmentMutation, useCreateOpeningMutation } from './inventoryApi.js';
import MetalLinesEditor, { metalLinesToPayload } from './MetalLinesEditor.jsx';
import ProductPicker, { SelectedProducts } from './ProductPicker.jsx';

const COPY = {
  opening: {
    title: 'Opening stock',
    subtitle: 'Bring draft products and existing metal into stock.',
    status: 'draft',
    submit: 'Post opening stock',
    pickerLabel: 'Add draft item by SKU or name',
  },
  adjustment: {
    title: 'Stock adjustment',
    subtitle: 'Write off items or correct metal balances. Usually needs approval.',
    status: 'in_stock',
    submit: 'Submit adjustment',
    pickerLabel: 'Add in-stock item to write off',
  },
};

export default function StockEntryDrawer({ mode, open, onClose, initialProducts = [] }) {
  const copy = COPY[mode];
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
  const saving = openingState.isLoading || adjustmentState.isLoading;

  useEffect(() => {
    if (!open) return;
    setBranchId(initialProducts[0]?.branch?.id ?? activeBranchId ?? session.branches[0]?.id ?? '');
    setReason('lost');
    setProducts(initialProducts);
    setLines([]);
    setNote('');
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    const { payload: metalLines, errors: lineErrors } = metalLinesToPayload(lines, { includeValue: showCost });
    const next = { lines: lineErrors };
    if (!products.length && !lines.length) next.products = 'Add at least one item or metal line';
    if (mode === 'adjustment' && note.trim().length < 5) next.note = 'Explain the adjustment in a few words';
    setErrors(next);
    if (next.products || next.note || Object.keys(lineErrors).length) return;

    const body = { branchId, productIds: products.map((p) => p.id), metalLines, note: note.trim() || undefined };
    try {
      const entry = mode === 'opening' ? await createOpening(body).unwrap() : await createAdjustment({ ...body, reason, note: note.trim() }).unwrap();
      toast.success(entry.status === 'posted' ? `${entry.docNo} posted` : `${entry.docNo} sent for approval`);
      onClose();
    } catch (err) {
      setErrors({ server: getErrorMessage(err) });
    }
  };

  return (
    <FormDrawer open={open} title={copy.title} subtitle={copy.subtitle} onClose={onClose} onSubmit={submit} submitting={saving} submitLabel={copy.submit} width={760}>
      <Grid container spacing={2}>
        {errors.server && (
          <Grid size={12}>
            <Alert severity="error">{errors.server}</Alert>
          </Grid>
        )}
        <Grid size={{ xs: 12, sm: 6 }}>
          <TextField
            select
            label="Branch"
            value={branchId}
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
            <TextField select label="Reason" value={reason} onChange={(e) => setReason(e.target.value)}>
              {ADJUSTMENT_REASONS.map((r) => (
                <MenuItem key={r.value} value={r.value}>
                  {r.label}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
        )}
        <Grid size={12}>
          <Typography variant="overline" color="textSecondary">
            {mode === 'opening' ? 'Tagged items' : 'Items to write off'}
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
            Metal (bullion, old gold, scrap)
          </Typography>
        </Grid>
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
            label={mode === 'adjustment' ? 'Explanation' : 'Note'}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            multiline
            minRows={2}
            error={Boolean(errors.note)}
            helperText={errors.note ?? (mode === 'adjustment' ? 'Shown to the approver' : ' ')}
          />
        </Grid>
      </Grid>
    </FormDrawer>
  );
}
