import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { Alert, Autocomplete, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Grid, IconButton, InputAdornment, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { decimalToScaledInt, formatINR, formatWeight, toPaise } from '@jerp/shared';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router';
import PageHeader from '../../components/PageHeader.jsx';
import { useSession } from '../../hooks/usePermission.js';
import { getErrorMessage } from '../../utils/errors.js';
import { formatDate } from '../../utils/format.js';
import MetalLinesEditor, { metalLinesToPayload } from '../inventory/MetalLinesEditor.jsx';
import ProductPicker from '../inventory/ProductPicker.jsx';
import { purityLabel } from '../products/productForm.js';
import { useSupplierListQuery } from '../suppliers/supplierApi.js';
import { BillPhotoPicker } from './BillPhotos.jsx';
import { useAddBillImageMutation, useCreatePurchaseMutation, usePurchaseOrderQuery } from './purchaseApi.js';
import { PAY_MODES } from './purchaseUi.jsx';
import ItemPicker from '../items/ItemPicker.jsx';
import MoreDetails from '../../components/MoreDetails.jsx';
import KeepOnPhone from '../../components/KeepOnPhone.jsx';
import { t } from '../../i18n/index.js';

const rupee = { input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> }, htmlInput: { inputMode: 'decimal' } };
const paise = (v) => {
  try {
    return v === '' || v == null ? 0 : (toPaise(v) ?? 0);
  } catch {
    return null;
  }
};
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function Section({ title, hint, children, action }) {
  return (
    <Card>
      <CardContent>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5, gap: 1 }}>
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
              {title}
            </Typography>
            {hint && (
              <Typography variant="caption" color="textSecondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
                {hint}
              </Typography>
            )}
          </Box>
          {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
        </Stack>
        {children}
      </CardContent>
    </Card>
  );
}

function Line({ label, value, strong, tone }) {
  return (
    <Stack direction="row" sx={{ justifyContent: 'space-between', py: 0.5 }}>
      <Typography variant="body2" sx={{ fontWeight: strong ? 700 : 400 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: strong ? 700 : 600, color: tone, fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </Typography>
    </Stack>
  );
}

export default function PurchaseFormPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const orderId = params.get('orderId');
  const { data: session } = useSession();
  const activeBranchId = useSelector((s) => s.auth.activeBranchId);
  const { data: suppliers } = useSupplierListQuery({ status: 'active', limit: 100 });
  const { data: order } = usePurchaseOrderQuery(orderId, { skip: !orderId });
  const [create, state] = useCreatePurchaseMutation();
  const [addBillImage, { isLoading: uploadingBill }] = useAddBillImageMutation();

  const [supplier, setSupplier] = useState(null);
  const [branchId, setBranchId] = useState(activeBranchId ?? session.branches[0]?.id ?? '');
  const [billNo, setBillNo] = useState('');
  const [billDate, setBillDate] = useState(todayIso());
  const [pieces, setPieces] = useState([]); // drafts already in Products: [{ product, cost }]
  const [fresh, setFresh] = useState([]); // new pieces from saved items: [{ key, item, weight, huid, cost }]
  const [lines, setLines] = useState([]);
  const [gstRate, setGstRate] = useState('3');
  const [gstOverride, setGstOverride] = useState('');
  const [other, setOther] = useState('');
  const [paidMode, setPaidMode] = useState('none'); // none | full | part
  const [paidAmount, setPaidAmount] = useState('');
  const [payMode, setPayMode] = useState('bank');
  const [note, setNote] = useState('');
  const [billFiles, setBillFiles] = useState([]);
  const [errors, setErrors] = useState({});

  // Opened from a supplier's page: start with that supplier picked.
  const supplierParam = params.get('supplierId');
  useEffect(() => {
    if (!supplierParam || supplier || !suppliers?.items) return;
    const found = suppliers.items.find((x) => String(x.id) === supplierParam);
    if (found) setSupplier(found);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierParam, suppliers]);

  // Receiving an order: same supplier and branch, and one piece row per ordered piece, with the order's
  // weight and amount shared across the line's quantity (any odd milligram / paisa goes on the first piece).
  useEffect(() => {
    if (!order) return;
    setBranchId(String(order.branch?.id ?? branchId));
    setSupplier({ id: order.supplier.id, companyName: order.supplier.name });
    setFresh(
      order.lines.flatMap((l, li) => {
        if (!l.item) return [];
        const qty = Math.max(1, l.quantity ?? 1);
        const share = (total, first) => (total ? Math.floor(total / qty) + (first ? total % qty : 0) : 0);
        return Array.from({ length: qty }, (_, k) => {
          const mg = share(l.weightMg ?? 0, k === 0);
          const cost = share(l.amountPaise ?? 0, k === 0);
          return { key: `order-${li}-${k}`, item: l.item, weight: mg ? String(mg / 1000) : '', huid: '', cost: cost ? String(cost / 100) : '' };
        });
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);
  const unmatchedLines = order?.lines.filter((l) => !l.item) ?? [];

  const metal = useMemo(() => metalLinesToPayload(lines, { includeValue: true }), [lines]);
  const freshMg = (x) => {
    try {
      return x.weight ? (decimalToScaledInt(x.weight, 3) ?? 0) : 0;
    } catch {
      return 0;
    }
  };
  const piecesPaise = pieces.reduce((s, p) => s + (paise(p.cost) ?? 0), 0) + fresh.reduce((s, p) => s + (paise(p.cost) ?? 0), 0);
  const pieceCount = pieces.length + fresh.length;
  const metalPaise = metal.payload.reduce((s, l) => s + (l.valuePaise ?? 0), 0);
  const otherPaise = paise(other) ?? 0;
  const goods = piecesPaise + metalPaise;
  const gstAuto = Math.round(((goods + otherPaise) * Number(gstRate || 0)) / 100);
  const gst = gstOverride !== '' ? (paise(gstOverride) ?? 0) : gstAuto;
  const total = goods + otherPaise + gst;
  const paidNow = paidMode === 'full' ? total : paidMode === 'part' ? (paise(paidAmount) ?? 0) : 0;
  const weight = pieces.reduce((s, p) => s + p.product.grossWeightMg, 0) + fresh.reduce((s, p) => s + freshMg(p), 0) + metal.payload.reduce((s, l) => s + (l.grossWeightMg ?? 0), 0);

  // Save purchase: check the form, then ask before saving — saving adds stock and books the bill.
  const [confirming, setConfirming] = useState(false);
  const review = () => {
    const e = {};
    if (!supplier) e.supplier = t('Pick the supplier');
    if (!billNo.trim()) e.billNo = t('Enter the bill number');
    if (!pieceCount && !lines.length) e.items = t('Add at least one piece or metal line');
    fresh.forEach((p, i) => {
      if (!(freshMg(p) > 0)) e[`fw${i}`] = t('Enter weight');
      if (!(paise(p.cost) > 0)) e[`fc${i}`] = t('Enter cost');
      if (p.huid && !/^[A-Za-z0-9]{6}$/.test(p.huid)) e[`fh${i}`] = '6 letters/digits';
    });
    pieces.forEach((p, i) => {
      if (!(paise(p.cost) > 0)) e[`cost${i}`] = t('Enter cost');
    });
    if (lines.length && Object.keys(metal.errors).length) e.lines = metal.errors;
    metal.payload.forEach((l, i) => {
      if (!(l.valuePaise > 0)) e.lines = { ...(e.lines ?? {}), [`${i}.value`]: t('Enter value') };
    });
    if (paidMode === 'part' && !(paidNow > 0 && paidNow <= total)) e.paid = t('Between ₹1 and {{total}}', { total: formatINR(total, { decimals: 0 }) });
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error(t('Please fill the highlighted fields'));
      return;
    }
    setConfirming(true);
  };

  const submit = async () => {
    setConfirming(false);
    try {
      const p = await create({
        supplierId: supplier.id,
        branchId,
        billNo: billNo.trim(),
        billDate,
        ...(orderId && { orderId }),
        items: pieces.map((x) => ({ productId: x.product.id, costPaise: paise(x.cost) })),
        newPieces: fresh.map((x) => ({ itemId: x.item.id, grossWeightMg: freshMg(x), ...(x.huid && { huid: x.huid.toUpperCase() }), costPaise: paise(x.cost) })),
        metalLines: metal.payload.map(({ metal: m, purity, kind, grossWeightMg, valuePaise }) => ({ metal: m, purity, kind, grossWeightMg, valuePaise })),
        gstPaise: gst,
        otherChargesPaise: otherPaise,
        ...(paidNow > 0 && { paidNow: { amountPaise: paidNow, mode: payMode } }),
        note: note.trim() || null,
      }).unwrap();
      toast.success(t('Purchase {{purchaseNo}} saved — stock added', { purchaseNo: p.purchaseNo }));
      // The bill is saved; a photo that fails to upload can be added again from the purchase page.
      for (const file of billFiles) {
        try {
          await addBillImage({ id: p.id, file }).unwrap();
        } catch (err) {
          toast.error(t('Bill photo not uploaded: {{getErrorMessage}}. Add it again on the purchase page.', { getErrorMessage: getErrorMessage(err) }));
          break;
        }
      }
      navigate('/purchases', { replace: true });
    } catch (err) {
      const d = err?.data?.error?.details?.[0];
      const m = d?.path?.match(/^newPieces\.(\d+)\.(\w+)/);
      if (m) setErrors({ [`${m[2] === 'huid' ? 'fh' : m[2] === 'grossWeightMg' ? 'fw' : 'fc'}${m[1]}`]: t(d.message) });
      toast.error(getErrorMessage(err));
    }
  };
  const setFreshField = (i, k, v) => setFresh((list) => list.map((p, j) => (j === i ? { ...p, [k]: v } : p)));

  return (
    <>
      <PageHeader title={t('New purchase')} subtitle={t('Enter the supplier’s bill. The items go into stock at this cost.')} back={{ to: '/purchases', label: t('Purchases') }} />
      {order && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('Receiving order {{orderNo}} — {{lines}}. The ordered pieces are filled in below with the order’s weight and amount — check them against the supplier’s bill. Saving this bill marks the order as received.', { orderNo: <strong>{order.orderNo}</strong>, lines: order.lines.map((l) => l.description).join(', ') })}
        </Alert>
      )}
      {unmatchedLines.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {t('Not in saved items, so not filled in: {{items}}. Add them under Pieces — type the name and pick “Add as a new item” if it is not saved yet.', { items: <strong>{unmatchedLines.map((l) => `${l.description} (${l.quantity ?? 1})`).join(', ')}</strong> })}
        </Alert>
      )}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Stack spacing={2}>
            <Section title={t('1. Supplier & bill')}>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Autocomplete
                    options={suppliers?.items ?? []}
                    value={supplier}
                    onChange={(e, v) => setSupplier(v)}
                    disabled={Boolean(order)}
                    getOptionLabel={(s) => s.companyName ?? ''}
                    isOptionEqualToValue={(a, b) => String(a.id) === String(b.id)}
                    renderInput={(p) => <TextField {...p} label={t('Supplier')} error={Boolean(errors.supplier)} helperText={<KeepOnPhone>{errors.supplier ?? (suppliers?.items?.length === 0 ? t('Add a supplier first under Suppliers') : ' ')}</KeepOnPhone>} />}
                  />
                </Grid>
                {session.branches.length > 1 && (
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      select
                      label={t('Branch (stock goes to)')}
                      value={branchId}
                      disabled={Boolean(order)}
                      onChange={(e) => {
                        setBranchId(e.target.value);
                        setPieces([]);
                      }}
                    >
                      {session.branches.map((b) => (
                        <MenuItem key={b.id} value={b.id}>
                          {b.name}
                        </MenuItem>
                      ))}
                    </TextField>
                  </Grid>
                )}
                <Grid size={{ xs: 5, sm: 3 }}>
                  <TextField label={t('Bill no.')} value={billNo} onChange={(e) => setBillNo(e.target.value)} error={Boolean(errors.billNo)} helperText={errors.billNo ?? ' '} slotProps={{ htmlInput: { maxLength: 40 } }} />
                </Grid>
                <Grid size={{ xs: 7, sm: 3 }}>
                  <TextField label={t('Bill date')} type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: todayIso() } }} helperText=" " />
                </Grid>
                <Grid size={12}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {t('Bill photo')} <Typography component="span" variant="caption" color="textSecondary">{t('(optional)')}</Typography>
                  </Typography>
                  <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mb: 1 }}>
                    {t('Photo or scan of the supplier’s bill — PNG, JPEG or WebP, up to 5 MB each, 5 photos max.')}
                  </Typography>
                  <BillPhotoPicker files={billFiles} onChange={setBillFiles} />
                </Grid>
              </Grid>
            </Section>

            <Section title={t('2. Ready-to-sell jewellery')} hint={t('Rings, chains, earrings… each piece goes into Products, ready to bill. Search a saved item, then enter its weight, HUID and cost.')}>
              <ItemPicker onPick={(item) => setFresh((list) => [...list, { key: `${item.id}-${Date.now()}`, item, weight: '', huid: '', cost: '' }])} label={t('Add a piece — search items')} />
              {errors.items && (
                <Typography variant="caption" color="error">
                  {errors.items}
                </Typography>
              )}
              {fresh.length > 0 && (
                <Box sx={{ mt: 1, border: 1, borderColor: 'divider', borderRadius: 2 }}>
                  {fresh.map((x, i) => (
                    <Stack key={x.key} direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ px: 1.5, py: 1.25, alignItems: { sm: 'center' }, borderBottom: i < fresh.length - 1 ? 1 : 0, borderColor: 'divider' }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                          {i + 1}. {x.item.name}
                        </Typography>
                        <Typography variant="caption" color="textSecondary">
                          {x.item.purityLabel} · {x.item.category?.name ?? x.item.code}
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
                        <TextField size="small" label={t('Weight')} value={x.weight} onChange={(e) => setFreshField(i, 'weight', e.target.value.replace(/[^\d.]/g, ''))} error={Boolean(errors[`fw${i}`])} slotProps={{ input: { endAdornment: <InputAdornment position="end">{t('g')}</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }} sx={{ width: 110 }} autoFocus={i === fresh.length - 1 && !x.weight} />
                        <TextField size="small" label={t('HUID')} value={x.huid} onChange={(e) => setFreshField(i, 'huid', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} error={Boolean(errors[`fh${i}`])} placeholder={t('Optional')} sx={{ width: 104 }} />
                        <TextField size="small" label={t('Cost')} value={x.cost} onChange={(e) => setFreshField(i, 'cost', e.target.value.replace(/[^\d.]/g, ''))} error={Boolean(errors[`fc${i}`])} slotProps={rupee} sx={{ width: 130 }} />
                        <IconButton size="small" onClick={() => setFresh((list) => list.filter((_, j) => j !== i))} aria-label={t('Remove {{name}}', { name: x.item.name })} sx={{ mt: 0.5 }}>
                          <CloseRoundedIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    </Stack>
                  ))}
                </Box>
              )}

              <Box sx={{ mt: 2 }}>
                <MoreDetails title={t('Already created in Products?')} hint={t('Pick draft pieces instead')} defaultOpen={pieces.length > 0}>
                  <ProductPicker status="draft" branchId={branchId} selected={pieces.map((p) => p.product)} onAdd={(product) => setPieces((list) => [...list, { product, cost: product.costPricePaise ? String(product.costPricePaise / 100) : '' }])} label={t('Pick a draft piece by SKU or name')} />
                  {pieces.length > 0 && (
                    <Box sx={{ mt: 1.5, border: 1, borderColor: 'divider', borderRadius: 2 }}>
                      {pieces.map((x, i) => (
                        <Stack key={x.product.id} direction="row" spacing={1.5} sx={{ px: 1.5, py: 1, alignItems: 'center', borderBottom: i < pieces.length - 1 ? 1 : 0, borderColor: 'divider' }}>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                              {x.product.sku} · {x.product.name}
                            </Typography>
                            <Typography variant="caption" color="textSecondary">
                              {purityLabel(x.product.metal, x.product.purity)} · {formatWeight(x.product.grossWeightMg)}
                            </Typography>
                          </Box>
                          <TextField
                            size="small"
                            label={t('Cost')}
                            value={x.cost}
                            onChange={(e) => setPieces((list) => list.map((p, j) => (j === i ? { ...p, cost: e.target.value.replace(/[^\d.]/g, '') } : p)))}
                            error={Boolean(errors[`cost${i}`])}
                            slotProps={rupee}
                            sx={{ width: 130 }}
                          />
                          <IconButton size="small" onClick={() => setPieces((list) => list.filter((_, j) => j !== i))} aria-label={t('Remove {{sku}}', { sku: x.product.sku })}>
                            <CloseRoundedIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                      ))}
                    </Box>
                  )}
                </MoreDetails>
              </Box>
            </Section>

            <Section title={t('3. Raw material (by weight)')} hint={t('Bullion, old gold or scrap — goes to Raw materials, not Products, until it is made into jewellery (optional).')}>
              <MetalLinesEditor lines={lines} onChange={setLines} errors={errors.lines} showValue />
            </Section>

            <Section title={t('4. Charges & GST')}>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField label={t('Other charges')} value={other} onChange={(e) => setOther(e.target.value.replace(/[^\d.]/g, ''))} slotProps={rupee} helperText={t('Hallmarking, courier…')} />
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <TextField
                    select
                    label={t('GST rate')}
                    value={gstRate}
                    onChange={(e) => {
                      setGstRate(e.target.value);
                      setGstOverride('');
                    }}
                    helperText=" "
                  >
                    {['3', '5', '0'].map((r) => (
                      <MenuItem key={r} value={r}>
                        {r === '0' ? t('No GST') : `${r}%`}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <TextField label={t('GST amount')} value={gstOverride !== '' ? gstOverride : gstAuto ? String(gstAuto / 100) : ''} onChange={(e) => setGstOverride(e.target.value.replace(/[^\d.]/g, ''))} slotProps={rupee} helperText={t('As on the bill')} />
                </Grid>
                <Grid size={12}>
                  <TextField label={t('Note (optional)')} value={note} onChange={(e) => setNote(e.target.value)} slotProps={{ htmlInput: { maxLength: 300 } }} />
                </Grid>
              </Grid>
            </Section>
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Card sx={{ position: { lg: 'sticky' }, top: { lg: 88 } }}>
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                {t('Bill summary')}
              </Typography>
              <Line label={t('Pieces ({{pieceCount}})', { pieceCount })} value={formatINR(piecesPaise, { decimals: 0 })} />
              <Line label={t('Metal ({{count}})', { count: lines.length })} value={formatINR(metalPaise, { decimals: 0 })} />
              {otherPaise > 0 && <Line label={t('Other charges')} value={formatINR(otherPaise, { decimals: 0 })} />}
              <Line label={t('GST')} value={formatINR(gst, { decimals: 0 })} />
              <Divider sx={{ my: 1 }} />
              <Line label={t('Bill total')} value={formatINR(total, { decimals: 0 })} strong />
              <Typography variant="caption" color="textSecondary">
                {t('Weight {{weight}}', { weight: formatWeight(weight) })}
              </Typography>

              <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 2, mb: 0.5 }}>
                {t('Paid to supplier now')}
              </Typography>
              <ToggleButtonGroup exclusive fullWidth size="small" value={paidMode} onChange={(e, v) => v && setPaidMode(v)}>
                <ToggleButton value="none">{t('Nothing')}</ToggleButton>
                <ToggleButton value="part">{t('Part')}</ToggleButton>
                <ToggleButton value="full">{t('Full')}</ToggleButton>
              </ToggleButtonGroup>
              {paidMode === 'part' && <TextField size="small" label={t('Amount paid')} value={paidAmount} onChange={(e) => setPaidAmount(e.target.value.replace(/[^\d.]/g, ''))} slotProps={rupee} error={Boolean(errors.paid)} helperText={errors.paid} sx={{ mt: 1.5 }} />}
              {paidMode !== 'none' && (
                <ToggleButtonGroup exclusive fullWidth size="small" value={payMode} onChange={(e, v) => v && setPayMode(v)} sx={{ mt: 1.5 }}>
                  {PAY_MODES.map((m) => (
                    <ToggleButton key={m.value} value={m.value}>
                      {m.label}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              )}
              <Line label={t('Still to pay')} value={formatINR(Math.max(0, total - paidNow), { decimals: 0 })} tone={total - paidNow > 0 ? 'error.main' : 'success.main'} />

              <Button fullWidth variant="contained" size="large" sx={{ mt: 2 }} onClick={review} disabled={state.isLoading || uploadingBill || !total} loading={state.isLoading || uploadingBill}>
                {t('Save purchase')}
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
      <Dialog open={confirming} onClose={() => setConfirming(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 600 }}>{t('Save this purchase?')}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 1.5 }}>
            {t('The pieces and metal go into stock and the bill is booked to {{companyName}}. Check the amounts — a saved purchase cannot be edited.', { companyName: supplier?.companyName })}
          </Typography>
          <Line label={t('Supplier')} value={supplier?.companyName ?? '—'} />
          <Line label={t('Bill')} value={`${billNo.trim()} · ${formatDate(billDate)}`} />
          <Line label={t('Items')} value={[pieceCount && (pieceCount === 1 ? t('{{pieceCount}} piece', { pieceCount }) : t('{{pieceCount}} pieces', { pieceCount })), lines.length && (lines.length === 1 ? t('{{count}} metal line', { count: lines.length }) : t('{{count}} metal lines', { count: lines.length }))].filter(Boolean).join(' + ') || '—'} />
          <Divider sx={{ my: 1 }} />
          <Line label={t('Bill total')} value={formatINR(total, { decimals: 0 })} strong />
          <Line label={t('Paid now')} value={paidNow ? `${formatINR(paidNow, { decimals: 0 })} · ${PAY_MODES.find((m) => m.value === payMode)?.label ?? payMode}` : t('Nothing')} />
          <Line label={t('Still to pay')} value={formatINR(Math.max(0, total - paidNow), { decimals: 0 })} tone={total - paidNow > 0 ? 'error.main' : 'success.main'} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="secondary" onClick={() => setConfirming(false)}>
            {t('Go back')}
          </Button>
          <Button variant="contained" onClick={submit}>
            {t('Yes, save purchase')}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
