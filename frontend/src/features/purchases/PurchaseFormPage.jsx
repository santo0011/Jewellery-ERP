import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { Alert, Autocomplete, Box, Button, Card, CardContent, Divider, Grid, IconButton, InputAdornment, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { decimalToScaledInt, formatINR, formatWeight, toPaise } from '@jerp/shared';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router';
import PageHeader from '../../components/PageHeader.jsx';
import { useSession } from '../../hooks/usePermission.js';
import { getErrorMessage } from '../../utils/errors.js';
import MetalLinesEditor, { metalLinesToPayload } from '../inventory/MetalLinesEditor.jsx';
import ProductPicker from '../inventory/ProductPicker.jsx';
import { purityLabel } from '../products/productForm.js';
import { useSupplierListQuery } from '../suppliers/supplierApi.js';
import { useCreatePurchaseMutation, usePurchaseOrderQuery } from './purchaseApi.js';
import { PAY_MODES } from './purchaseUi.jsx';
import ItemPicker from '../items/ItemPicker.jsx';
import MoreDetails from '../../components/MoreDetails.jsx';

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
              <Typography variant="caption" color="textSecondary">
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
  const [errors, setErrors] = useState({});

  // Opened from a supplier's page: start with that supplier picked.
  const supplierParam = params.get('supplierId');
  useEffect(() => {
    if (!supplierParam || supplier || !suppliers?.items) return;
    const found = suppliers.items.find((x) => String(x.id) === supplierParam);
    if (found) setSupplier(found);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierParam, suppliers]);

  // Receiving an order: same supplier and branch.
  useEffect(() => {
    if (!order) return;
    setBranchId(String(order.branch?.id ?? branchId));
    setSupplier({ id: order.supplier.id, companyName: order.supplier.name });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

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

  const submit = async () => {
    const e = {};
    if (!supplier) e.supplier = 'Pick the supplier';
    if (!billNo.trim()) e.billNo = 'Enter the bill number';
    if (!pieceCount && !lines.length) e.items = 'Add at least one piece or metal line';
    fresh.forEach((p, i) => {
      if (!(freshMg(p) > 0)) e[`fw${i}`] = 'Enter weight';
      if (!(paise(p.cost) > 0)) e[`fc${i}`] = 'Enter cost';
      if (p.huid && !/^[A-Za-z0-9]{6}$/.test(p.huid)) e[`fh${i}`] = '6 letters/digits';
    });
    pieces.forEach((p, i) => {
      if (!(paise(p.cost) > 0)) e[`cost${i}`] = 'Enter cost';
    });
    if (lines.length && Object.keys(metal.errors).length) e.lines = metal.errors;
    metal.payload.forEach((l, i) => {
      if (!(l.valuePaise > 0)) e.lines = { ...(e.lines ?? {}), [`${i}.value`]: 'Enter value' };
    });
    if (paidMode === 'part' && !(paidNow > 0 && paidNow <= total)) e.paid = `Between ₹1 and ${formatINR(total, { decimals: 0 })}`;
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error('Please fill the highlighted fields');
      return;
    }
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
      toast.success(`Purchase ${p.purchaseNo} saved — stock added`);
      navigate(`/purchases/${p.id}`, { replace: true });
    } catch (err) {
      const d = err?.data?.error?.details?.[0];
      const m = d?.path?.match(/^newPieces\.(\d+)\.(\w+)/);
      if (m) setErrors({ [`${m[2] === 'huid' ? 'fh' : m[2] === 'grossWeightMg' ? 'fw' : 'fc'}${m[1]}`]: d.message });
      toast.error(getErrorMessage(err));
    }
  };
  const setFreshField = (i, k, v) => setFresh((list) => list.map((p, j) => (j === i ? { ...p, [k]: v } : p)));

  return (
    <>
      <PageHeader title="New purchase" subtitle="Enter the supplier’s bill. The items go into stock at this cost." back={{ to: '/purchases', label: 'Purchases' }} />
      {order && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Receiving order <strong>{order.orderNo}</strong> — {order.lines.map((l) => l.description).join(', ')}. Saving this bill marks the order as received.
        </Alert>
      )}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Stack spacing={2}>
            <Section title="1. Supplier & bill">
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <Autocomplete
                    options={suppliers?.items ?? []}
                    value={supplier}
                    onChange={(e, v) => setSupplier(v)}
                    disabled={Boolean(order)}
                    getOptionLabel={(s) => s.companyName ?? ''}
                    isOptionEqualToValue={(a, b) => String(a.id) === String(b.id)}
                    renderInput={(p) => <TextField {...p} label="Supplier" error={Boolean(errors.supplier)} helperText={errors.supplier ?? (suppliers?.items?.length === 0 ? 'Add a supplier first under Suppliers' : ' ')} />}
                  />
                </Grid>
                {session.branches.length > 1 && (
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      select
                      label="Branch (stock goes to)"
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
                <Grid size={{ xs: 6, sm: 3 }}>
                  <TextField label="Bill no." value={billNo} onChange={(e) => setBillNo(e.target.value)} error={Boolean(errors.billNo)} helperText={errors.billNo ?? ' '} slotProps={{ htmlInput: { maxLength: 40 } }} />
                </Grid>
                <Grid size={{ xs: 6, sm: 3 }}>
                  <TextField label="Bill date" type="date" value={billDate} onChange={(e) => setBillDate(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: todayIso() } }} helperText=" " />
                </Grid>
              </Grid>
            </Section>

            <Section title="2. Pieces" hint="Search a saved item, then enter each piece’s weight, HUID and cost. Not saved yet? Type its name and add it.">
              <ItemPicker onPick={(item) => setFresh((list) => [...list, { key: `${item.id}-${Date.now()}`, item, weight: '', huid: '', cost: '' }])} label="Add a piece — search items" />
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
                        <TextField size="small" label="Weight" value={x.weight} onChange={(e) => setFreshField(i, 'weight', e.target.value.replace(/[^\d.]/g, ''))} error={Boolean(errors[`fw${i}`])} slotProps={{ input: { endAdornment: <InputAdornment position="end">g</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }} sx={{ width: 110 }} autoFocus={i === fresh.length - 1 && !x.weight} />
                        <TextField size="small" label="HUID" value={x.huid} onChange={(e) => setFreshField(i, 'huid', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} error={Boolean(errors[`fh${i}`])} placeholder="Optional" sx={{ width: 104 }} />
                        <TextField size="small" label="Cost" value={x.cost} onChange={(e) => setFreshField(i, 'cost', e.target.value.replace(/[^\d.]/g, ''))} error={Boolean(errors[`fc${i}`])} slotProps={rupee} sx={{ width: 130 }} />
                        <IconButton size="small" onClick={() => setFresh((list) => list.filter((_, j) => j !== i))} aria-label={`Remove ${x.item.name}`} sx={{ mt: 0.5 }}>
                          <CloseRoundedIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    </Stack>
                  ))}
                </Box>
              )}

              <Box sx={{ mt: 2 }}>
                <MoreDetails title="Already created in Products?" hint="Pick draft pieces instead" defaultOpen={pieces.length > 0}>
                  <ProductPicker status="draft" branchId={branchId} selected={pieces.map((p) => p.product)} onAdd={(product) => setPieces((list) => [...list, { product, cost: product.costPricePaise ? String(product.costPricePaise / 100) : '' }])} label="Pick a draft piece by SKU or name" />
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
                            label="Cost"
                            value={x.cost}
                            onChange={(e) => setPieces((list) => list.map((p, j) => (j === i ? { ...p, cost: e.target.value.replace(/[^\d.]/g, '') } : p)))}
                            error={Boolean(errors[`cost${i}`])}
                            slotProps={rupee}
                            sx={{ width: 130 }}
                          />
                          <IconButton size="small" onClick={() => setPieces((list) => list.filter((_, j) => j !== i))} aria-label={`Remove ${x.product.sku}`}>
                            <CloseRoundedIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                      ))}
                    </Box>
                  )}
                </MoreDetails>
              </Box>
            </Section>

            <Section title="3. Loose metal" hint="Bullion, old gold or scrap bought by weight (optional).">
              <MetalLinesEditor lines={lines} onChange={setLines} errors={errors.lines} showValue />
            </Section>

            <Section title="4. Charges & GST">
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <TextField label="Other charges" value={other} onChange={(e) => setOther(e.target.value.replace(/[^\d.]/g, ''))} slotProps={rupee} helperText="Hallmarking, courier…" />
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <TextField
                    select
                    label="GST rate"
                    value={gstRate}
                    onChange={(e) => {
                      setGstRate(e.target.value);
                      setGstOverride('');
                    }}
                    helperText=" "
                  >
                    {['3', '5', '0'].map((r) => (
                      <MenuItem key={r} value={r}>
                        {r === '0' ? 'No GST' : `${r}%`}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <TextField label="GST amount" value={gstOverride !== '' ? gstOverride : gstAuto ? String(gstAuto / 100) : ''} onChange={(e) => setGstOverride(e.target.value.replace(/[^\d.]/g, ''))} slotProps={rupee} helperText="As on the bill" />
                </Grid>
                <Grid size={12}>
                  <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} slotProps={{ htmlInput: { maxLength: 300 } }} />
                </Grid>
              </Grid>
            </Section>
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Card sx={{ position: { lg: 'sticky' }, top: { lg: 88 } }}>
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                Bill summary
              </Typography>
              <Line label={`Pieces (${pieceCount})`} value={formatINR(piecesPaise, { decimals: 0 })} />
              <Line label={`Metal (${lines.length})`} value={formatINR(metalPaise, { decimals: 0 })} />
              {otherPaise > 0 && <Line label="Other charges" value={formatINR(otherPaise, { decimals: 0 })} />}
              <Line label="GST" value={formatINR(gst, { decimals: 0 })} />
              <Divider sx={{ my: 1 }} />
              <Line label="Bill total" value={formatINR(total, { decimals: 0 })} strong />
              <Typography variant="caption" color="textSecondary">
                Weight {formatWeight(weight)}
              </Typography>

              <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 2, mb: 0.5 }}>
                Paid to supplier now
              </Typography>
              <ToggleButtonGroup exclusive fullWidth size="small" value={paidMode} onChange={(e, v) => v && setPaidMode(v)}>
                <ToggleButton value="none">Nothing</ToggleButton>
                <ToggleButton value="part">Part</ToggleButton>
                <ToggleButton value="full">Full</ToggleButton>
              </ToggleButtonGroup>
              {paidMode === 'part' && <TextField size="small" label="Amount paid" value={paidAmount} onChange={(e) => setPaidAmount(e.target.value.replace(/[^\d.]/g, ''))} slotProps={rupee} error={Boolean(errors.paid)} helperText={errors.paid} sx={{ mt: 1.5 }} />}
              {paidMode !== 'none' && (
                <ToggleButtonGroup exclusive fullWidth size="small" value={payMode} onChange={(e, v) => v && setPayMode(v)} sx={{ mt: 1.5 }}>
                  {PAY_MODES.map((m) => (
                    <ToggleButton key={m.value} value={m.value}>
                      {m.label}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              )}
              <Line label="Still to pay" value={formatINR(Math.max(0, total - paidNow), { decimals: 0 })} tone={total - paidNow > 0 ? 'error.main' : 'success.main'} />

              <Button fullWidth variant="contained" size="large" sx={{ mt: 2 }} onClick={submit} disabled={state.isLoading || !total}>
                Save purchase
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </>
  );
}
