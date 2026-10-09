import AddRoundedIcon from '@mui/icons-material/AddRounded';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import QrCodeScannerRoundedIcon from '@mui/icons-material/QrCodeScannerRounded';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import RestartAltRoundedIcon from '@mui/icons-material/RestartAltRounded';
import ShowChartRoundedIcon from '@mui/icons-material/ShowChartRounded';
import { Alert, Autocomplete, Box, Button, Card, CardContent, Chip, Divider, Grid, IconButton, InputAdornment, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@mui/material';
import { formatINR, formatWeight, PAYMENT_MODES, toPaise } from '@jerp/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router';
import Amount from '../../components/Amount.jsx';
import AuthImage from '../../components/AuthImage.jsx';
import CustomerPicker from '../../components/CustomerPicker.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { useDebounce } from '../../hooks/useDebounce.js';
import { usePermission, useSession } from '../../hooks/usePermission.js';
import { getErrorMessage } from '../../utils/errors.js';
import { fonts, tokens } from '../../theme/tokens.js';
import FinishItemDialog from '../orders/FinishItemDialog.jsx';
import { useOrderQuery, useOrdersQuery } from '../orders/orderApi.js';
import { useProductListQuery } from '../products/productApi.js';
import { purityLabel } from '../products/productForm.js';
import { useCurrentRatesQuery } from '../rates/rateApi.js';
import { billLabels } from './billLabels.js';
import { useCreateSaleMutation, useLazyLookupProductQuery, useQuoteSaleMutation, useSetProductHuidMutation } from './saleApi.js';

const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const safePaise = (v) => {
  try {
    return v ? toPaise(v) : 0;
  } catch {
    return 0;
  }
};
const rupees = (paise) => (paise ? (paise / 100).toFixed(2).replace(/\.00$/, '') : '');

/** Why an item that exists cannot go on this bill. */
function notSellableReason(p, branchName) {
  const item = `${p.sku} (${p.name})`;
  switch (p.status) {
    case 'in_stock':
      return `${item} is in stock at ${p.branch?.name ?? 'another branch'}, not ${branchName}. Transfer it here, or bill it from that branch.`;
    case 'in_transit':
      return `${item} is in transit between branches. It can be billed once the receiving branch accepts it under Stock → Transfers.`;
    case 'sold':
      return `${item} is already sold.`;
    case 'draft':
      return `${item} has not been added to stock yet. Add it through Opening stock first.`;
    case 'reserved':
      return `${item} is reserved.`;
    case 'with_karigar':
    case 'in_repair':
      return `${item} is with the karigar / in repair.`;
    case 'melted':
    case 'written_off':
      return `${item} was ${p.status.replace('_', ' ')} and is no longer in stock.`;
    default:
      return `${item} is ${p.status.replace('_', ' ')}.`;
  }
}

/** Search box that also takes barcode scans: scanners type the code and press Enter, which picks the highlighted match. */
function ItemSearch({ branchId, branchName, exclude, onAdd }) {
  const [input, setInput] = useState('');
  const q = useDebounce(input.trim(), 200);
  const { data, isFetching } = useProductListQuery({ page: 1, limit: 15, status: 'in_stock', branchId, ...(q && { q }) }, { skip: !branchId });
  const options = (data?.items ?? []).filter((p) => !exclude.has(String(p.id)));
  // Nothing sellable here: look the code up everywhere this user can see, to say why.
  const explain = Boolean(q) && !isFetching && options.length === 0;
  const { data: anywhere } = useProductListQuery({ page: 1, limit: 5, q }, { skip: !explain });
  const code = q.toUpperCase();
  const match = explain ? ((anywhere?.items ?? []).find((p) => [p.sku, p.barcode, p.huid].includes(code)) ?? anywhere?.items?.[0]) : null;
  const onBill = match && exclude.has(String(match.id));
  const searchReason = !explain || !anywhere ? null : onBill ? `${match.sku} is already on this bill.` : match ? notSellableReason(match, branchName) : `No item matches “${q}”. Check the tag, or search by name.`;
  const [scanReason, setScanReason] = useState(null);
  const reason = scanReason ?? searchReason;

  // Enter adds only the item whose code exactly matches what was typed or scanned. The list may still show results
  // for an earlier, partial search (scanners type fast), so its highlighted row is used only if the user moved to it.
  const [lookup] = useLazyLookupProductQuery();
  const picked = useRef(null);
  const addExact = async (e) => {
    if (e.key !== 'Enter' || picked.current) return;
    const typed = input.trim().toUpperCase();
    if (!typed) return;
    e.defaultMuiPrevented = true;
    e.preventDefault();
    const add = (p) => {
      onAdd(p);
      setInput('');
      setScanReason(null);
    };
    const local = options.find((p) => [p.sku, p.barcode, p.huid].includes(typed));
    if (local) return add(local);
    try {
      const p = await lookup(typed).unwrap();
      if (exclude.has(String(p.id))) setScanReason(`${p.sku} is already on this bill.`);
      else if (p.status === 'in_stock' && String(p.branch?.id) === String(branchId)) add(p);
      else setScanReason(notSellableReason(p, branchName));
    } catch {
      setScanReason(`No item with tag “${typed}”. Check the code, or search by name and pick from the list.`);
    }
    return undefined;
  };
  return (
    <>
    <Autocomplete
      options={options}
      value={null}
      loading={isFetching}
      autoHighlight
      inputValue={input}
      onInputChange={(e, v, why) => {
        if (why === 'reset') return;
        setInput(v);
        setScanReason(null);
      }}
      onHighlightChange={(e, option, why) => {
        picked.current = why === 'keyboard' || why === 'mouse' ? option : null;
      }}
      onKeyDown={addExact}
      onChange={(e, p) => {
        if (p) {
          onAdd(p);
          setInput('');
        }
      }}
      filterOptions={(x) => x}
      getOptionLabel={(p) => `${p.sku} ${p.name}`}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      noOptionsText={q ? (reason ?? 'Searching…') : 'Scan a tag or type SKU, HUID or name'}
      renderOption={({ key, ...props }, p) => (
        <Box component="li" key={key} {...props}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {p.sku} · {p.name}
            </Typography>
            <Typography variant="caption" color="textSecondary">
              {purityLabel(p.metal, p.purity)} · {formatWeight(p.grossWeightMg)} gross{p.huid ? ` · HUID ${p.huid}` : ''}
            </Typography>
          </Box>
        </Box>
      )}
      renderInput={(params) => (
        <TextField
          {...params}
          autoFocus
          placeholder="Scan tag or search SKU, HUID, name"
          slotProps={{
            ...params.slotProps,
            input: {
              ...params.slotProps.input,
              startAdornment: (
                <InputAdornment position="start">
                  <QrCodeScannerRoundedIcon color="action" />
                </InputAdornment>
              ),
            },
          }}
        />
      )}
    />
    {reason && (
      <Alert severity="warning" sx={{ mt: 1.5 }}>
        {reason}
      </Alert>
    )}
    </>
  );
}

function Money({ label, value, strong, negative, light }) {
  return (
    <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between', alignItems: 'baseline', py: 0.6 }}>
      <Typography sx={{ fontSize: '1rem', fontWeight: strong ? 600 : 500, color: light ? 'rgba(247, 243, 232, 0.75)' : strong ? 'text.primary' : 'text.secondary' }}>
        {label}
      </Typography>
      <Typography component="span" sx={{ fontSize: '1.0625rem', fontWeight: strong ? 700 : 600, whiteSpace: 'nowrap', color: negative ? (light ? '#9BD3B5' : 'success.main') : light ? '#F7F3E8' : 'text.primary' }}>
        {negative ? '− ' : ''}
        {value}
      </Typography>
    </Stack>
  );
}

/** Today's rate for every purity this business sells; billing needs each one entered today. */
function RateStrip({ enabled }) {
  const navigate = useNavigate();
  const { data: rates = [] } = useCurrentRatesQuery(undefined, { pollingInterval: 5 * 60 * 1000 });
  const wanted = Object.entries(enabled ?? {}).flatMap(([metal, list]) => list.map((purity) => ({ metal, purity })));
  if (!wanted.length) return null;
  const stale = wanted.filter((w) => !rates.find((r) => r.metal === w.metal && r.purity === w.purity)?.isToday);
  return (
    <Card sx={{ mb: 2.5 }}>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} sx={{ px: 2, py: 1.25, alignItems: { md: 'center' } }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexShrink: 0 }}>
          <ShowChartRoundedIcon fontSize="small" sx={{ color: tokens.light.goldDark }} />
          <Typography variant="overline" sx={{ color: 'text.secondary', lineHeight: 1 }}>
            Today&apos;s rates
          </Typography>
        </Stack>
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1, flex: 1 }}>
          {wanted.map(({ metal, purity }) => {
            const rate = rates.find((r) => r.metal === metal && r.purity === purity);
            const today = rate?.isToday;
            return (
              <Box key={`${metal}${purity}`} sx={{ px: 1.25, py: 0.5, borderRadius: 1.5, border: 1, borderColor: today ? 'divider' : 'warning.main', bgcolor: today ? 'transparent' : 'rgba(183, 121, 31, 0.08)' }}>
                <Typography variant="caption" color="textSecondary" sx={{ display: 'block', lineHeight: 1.2 }}>
                  {purityLabel(metal, purity)}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: today ? 'text.primary' : 'warning.main' }}>
                  {rate ? `${formatINR(rate.ratePerGramPaise, { decimals: 0 })}/g` : 'Not set'}
                  {rate && !today && (
                    <Typography component="span" variant="caption" sx={{ ml: 0.5, fontWeight: 600 }}>
                      · old
                    </Typography>
                  )}
                </Typography>
              </Box>
            );
          })}
        </Stack>
        {stale.length > 0 && (
          <Button size="small" color="warning" variant="outlined" onClick={() => navigate('/rates')} sx={{ flexShrink: 0 }}>
            Update {stale.length} rate{stale.length === 1 ? '' : 's'}
          </Button>
        )}
      </Stack>
    </Card>
  );
}

function LineCard({ product: p, discount, discountType, breakdown: b, quoting, canDiscount, onDiscount, onDiscountType, onRemove, index, huidMissing, onHuidSaved }) {
  const parts = b
    ? [
        ['Metal', b.metalPaise],
        ['Wastage', b.wastagePaise],
        ['Making', b.makingPaise],
        ['Stones', b.stonePaise],
        ['Other', b.otherPaise],
      ].filter(([, v]) => v > 0)
    : [];
  return (
    <Box sx={{ p: 2, borderRadius: 2.5, border: 1, borderColor: 'divider', bgcolor: 'background.paper', transition: 'border-color 160ms ease, box-shadow 160ms ease', '&:hover': { borderColor: 'rgba(201, 162, 39, 0.45)', boxShadow: '0 4px 18px rgba(120, 104, 60, 0.10)' } }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start' }}>
        <Box sx={{ position: 'relative' }}>
          <AuthImage fileId={p.images?.[0]} alt={p.name} size={64} sx={{ borderRadius: 2 }} />
          <Box sx={{ position: 'absolute', top: -8, left: -8, width: 22, height: 22, borderRadius: '50%', display: 'grid', placeItems: 'center', background: tokens.sidebar.goldGradient, color: '#171717', fontSize: 11, fontWeight: 800 }}>{index + 1}</Box>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, lineHeight: 1.3 }}>
                {p.name}
              </Typography>
              <Typography variant="caption" color="textSecondary">
                {p.sku} · {purityLabel(p.metal, p.purity)}
                {p.huid ? ` · HUID ${p.huid}` : ''}
              </Typography>
            </Box>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexShrink: 0 }}>
              <Box sx={{ textAlign: 'right' }}>
                <Typography variant="h4" component="p" sx={{ fontWeight: 700 }}>
                  {b ? formatINR(b.totalPaise) : quoting ? '…' : '—'}
                </Typography>
                {b?.discountPaise > 0 && (
                  <Typography variant="caption" color="success.main" sx={{ fontWeight: 600 }}>
                    {formatINR(b.discountPaise)} off
                  </Typography>
                )}
              </Box>
              <Tooltip title="Remove from bill">
                <IconButton size="small" onClick={onRemove} aria-label={`Remove ${p.sku}`}>
                  <CloseRoundedIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>

          <Stack direction="row" sx={{ mt: 1.25, flexWrap: 'wrap', gap: 2 }}>
            <Fact label="Gross" value={formatWeight(p.grossWeightMg)} />
            <Fact label="Net" value={formatWeight(p.netWeightMg)} />
            {b?.ratePerGramPaise != null && <Fact label="Rate" value={`${formatINR(b.ratePerGramPaise, { decimals: 0 })}/g`} />}
            {parts.map(([label, value]) => (
              <Fact key={label} label={label} value={formatINR(value, { decimals: 0 })} />
            ))}
            {b && <Fact label="GST" value={formatINR(b.gstPaise, { decimals: 0 })} />}
            {canDiscount && (
              <Stack direction="row" spacing={0.75} sx={{ ml: 'auto', alignItems: 'flex-start' }}>
                <ToggleButtonGroup
                  exclusive
                  size="small"
                  value={discountType}
                  onChange={(e, v) => v && onDiscountType(v)}
                  aria-label="Discount type"
                  sx={{ height: 40, '& .MuiToggleButton-root': { px: 1.25, fontWeight: 700, fontSize: '0.875rem' }, '& .Mui-selected': { bgcolor: 'rgba(201, 162, 39, 0.16) !important', color: tokens.light.goldDark } }}
                >
                  <ToggleButton value="amount" aria-label="Discount in rupees">
                    ₹
                  </ToggleButton>
                  <ToggleButton value="percent" aria-label="Discount in percent">
                    %
                  </ToggleButton>
                </ToggleButtonGroup>
                <TextField
                  size="small"
                  label="Discount"
                  value={discount}
                  onChange={(e) => onDiscount(e.target.value.replace(/[^\d.]/g, ''))}
                  error={discountType === 'percent' && Number(discount) > 100}
                  helperText={discountType === 'percent' && discount && b ? (Number(discount) > 100 ? 'Up to 100%' : `= ${formatINR(b.discountPaise, { decimals: 0 })}`) : ' '}
                  sx={{ width: 120 }}
                  slotProps={{
                    input: discountType === 'percent' ? { endAdornment: <InputAdornment position="end">%</InputAdornment> } : { startAdornment: <InputAdornment position="start">₹</InputAdornment> },
                    htmlInput: { inputMode: 'decimal' },
                    formHelperText: { sx: { mx: 0.5, whiteSpace: 'nowrap' } },
                  }}
                />
              </Stack>
            )}
          </Stack>
          {huidMissing && <MissingHuid product={p} onSaved={onHuidSaved} />}
        </Box>
      </Stack>
    </Box>
  );
}

/** Hallmarked gold needs a HUID to be billed: add it right on the line instead of leaving the bill. */
function MissingHuid({ product, onSaved }) {
  const [huid, setHuid] = useState('');
  const [save, { isLoading, error }] = useSetProductHuidMutation();
  const value = huid.trim().toUpperCase();
  const valid = /^[A-Z0-9]{6}$/.test(value);
  const submit = async () => {
    try {
      const updated = await save({ id: product.id, huid: value }).unwrap();
      toast.success(`HUID saved on ${product.sku}`);
      onSaved(updated);
    } catch {
      /* shown below */
    }
  };
  return (
    <Alert severity="warning" sx={{ mt: 1.5, alignItems: 'center', '& .MuiAlert-message': { flex: 1 } }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' } }}>
        <Typography variant="body2" sx={{ flex: 1 }}>
          <strong>No HUID.</strong> Hallmarked gold cannot be billed without it. Enter the 6-character HUID engraved on the piece.
        </Typography>
        <TextField
          size="small"
          placeholder="e.g. AB12CD"
          value={huid}
          onChange={(e) => setHuid(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && valid && submit()}
          error={Boolean(error) || (huid.length > 0 && !valid)}
          helperText={error ? getErrorMessage(error) : huid && !valid ? '6 letters or digits' : ' '}
          sx={{ width: 150, bgcolor: 'background.paper', '& .MuiFormHelperText-root': { bgcolor: 'transparent' } }}
          slotProps={{ htmlInput: { maxLength: 6 } }}
        />
        <Button variant="contained" size="small" disabled={!valid} loading={isLoading} onClick={submit} sx={{ alignSelf: { sm: 'flex-start' }, mt: { sm: 0.25 } }}>
          Save HUID
        </Button>
      </Stack>
    </Alert>
  );
}

const Fact = ({ label, value }) => (
  <Box>
    <Typography variant="caption" color="textSecondary" sx={{ display: 'block', lineHeight: 1.2 }}>
      {label}
    </Typography>
    <Typography variant="body2" sx={{ fontWeight: 600 }}>
      {value}
    </Typography>
  </Box>
);

const QUICK_MODES = PAYMENT_MODES.filter((m) => m.value !== 'credit');

/** The order being delivered: each line shows its finished piece (on the bill, or ready to add), or how to finish it. */
function OrderPanel({ order, onBill, canFinish, onFinish, onAdd }) {
  return (
    <Box sx={{ mb: 2.5, p: 2, borderRadius: 2.5, border: '1px solid rgba(201, 162, 39, 0.35)', background: 'linear-gradient(145deg, rgba(201, 162, 39, 0.08), rgba(201, 162, 39, 0.01))' }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5, flexWrap: 'wrap' }}>
        <AssignmentOutlinedIcon fontSize="small" sx={{ color: tokens.light.goldDark }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Delivering order {order.orderNo}
        </Typography>
        <Typography variant="body2" color="textSecondary">
          · {order.customer.name} · advance {formatINR(order.advancePaise, { decimals: 0 })}
        </Typography>
      </Stack>
      <Stack spacing={1}>
        {order.items.map((item, n) => {
          const piece = item.product;
          const onThisBill = piece && onBill.has(String(piece.id));
          return (
            <Stack key={n} direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { sm: 'center' }, p: 1.25, borderRadius: 2, bgcolor: 'background.paper', border: 1, borderColor: 'divider' }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {item.description}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  {[item.purity ? purityLabel(item.metal, item.purity) : item.metal, item.approxWeightMg && `~${formatWeight(item.approxWeightMg)} ordered`, item.size && `size ${item.size}`, item.quantity > 1 && `qty ${item.quantity}`].filter(Boolean).join(' · ')}
                </Typography>
              </Box>
              {piece ? (
                onThisBill ? (
                  <Chip size="small" color="success" label={`On bill · ${piece.sku}`} />
                ) : piece.status === 'in_stock' ? (
                  <Button size="small" variant="outlined" startIcon={<AddRoundedIcon />} onClick={() => onAdd(piece)}>
                    Add {piece.sku}
                  </Button>
                ) : (
                  <Chip size="small" variant="outlined" label={`${piece.sku} · ${piece.status.replace('_', ' ')}`} />
                )
              ) : canFinish ? (
                <Button size="small" variant="contained" onClick={() => onFinish(n)}>
                  Finish item
                </Button>
              ) : (
                <Typography variant="caption" color="warning.main" sx={{ fontWeight: 600 }}>
                  Not made yet: finish it on the order first
                </Typography>
              )}
            </Stack>
          );
        })}
      </Stack>
      {order.items.some((i) => !i.product) && (
        <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 1.25 }}>
          A bill needs the finished piece. Finish item records its real weight and charges, tags it and puts it in stock; it then joins this bill.
        </Typography>
      )}
    </Box>
  );
}

export default function BillingPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data: session } = useSession();
  const activeBranchId = useSelector((s) => s.auth.activeBranchId) ?? session.branches[0]?.id;
  const branchName = session.branches.find((b) => b.id === activeBranchId)?.name ?? 'this branch';
  const canDiscount = usePermission('sales.discount');
  const canViewOrders = usePermission('order.view');

  const [lines, setLines] = useState([]); // [{ product, discount, discountType: 'amount' | 'percent' }]
  const [customer, setCustomer] = useState(null);
  const [orderId, setOrderId] = useState(params.get('orderId'));
  const [payments, setPayments] = useState([{ mode: 'cash', amount: '', reference: '' }]);
  const [tendered, setTendered] = useState('');
  const [notes, setNotes] = useState('');
  const idempotencyKey = useRef(newKey());

  const { data: linkedOrder } = useOrderQuery(orderId, { skip: !orderId });
  useEffect(() => {
    if (linkedOrder && (!customer || customer.id !== linkedOrder.customer.id)) setCustomer(linkedOrder.customer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedOrder]);
  const { data: customerOrders } = useOrdersQuery({ page: 1, limit: 10, status: 'open', customerId: customer?.id }, { skip: !customer || !canViewOrders });

  const [quoteSale, { data: freshQuote, error: quoteError, isLoading: quoting, reset: resetQuote }] = useQuoteSaleMutation();
  // The mutation clears its data while a new request runs; keep showing (and pricing % discounts from) the last
  // prices meanwhile. Without this the bill flickers, and % discounts re-quote in a loop.
  const [lastQuote, setLastQuote] = useState(null);
  useEffect(() => {
    if (freshQuote) setLastQuote(freshQuote);
  }, [freshQuote]);
  const quote = lines.length ? (freshQuote ?? lastQuote) : null;
  const [createSale, { isLoading: saving }] = useCreateSaleMutation();

  // A % discount is taken on the item's value before GST (what the discount reduces); the server prices in rupees.
  const subtotalKey = (quote?.items ?? []).map((i) => `${i.productId}:${i.breakdown.subtotalPaise}`).join(',');
  const request = useMemo(() => {
    const subtotals = new Map(subtotalKey ? subtotalKey.split(',').map((pair) => pair.split(':')) : []);
    const discountPaise = (l) => {
      if (l.discountType !== 'percent') return safePaise(l.discount);
      const pct = Math.min(Number(l.discount) || 0, 100);
      return Math.round((Number(subtotals.get(String(l.product.id)) ?? 0) * pct) / 100);
    };
    return {
      branchId: activeBranchId,
      customerId: customer?.id ?? null,
      orderId: orderId ?? null,
      items: lines.map((l) => ({ productId: l.product.id, discountPaise: discountPaise(l) })),
    };
  }, [activeBranchId, customer, orderId, lines, subtotalKey]);
  const debounced = useDebounce(request, 300);
  useEffect(() => {
    if (debounced.items.length) quoteSale(debounced);
    else resetQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const payable = quote?.payablePaise ?? 0;
  const paid = payments.reduce((s, p) => s + safePaise(p.amount), 0);
  const remaining = payable - paid;
  // Keep a single payment row in step with the amount due until the cashier splits it.
  useEffect(() => {
    if (payments.length === 1 && quote) setPayments((rows) => [{ ...rows[0], amount: rupees(quote.payablePaise) }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote?.payablePaise]);

  const addProduct = (p) => {
    setLines((ls) => (ls.some((l) => l.product.id === p.id) ? ls : [...ls, { product: p, discount: '', discountType: 'amount' }]));
    toast.success(`${p.sku} added`, { duration: 1200 });
  };

  // Delivering an order: its finished pieces go on the bill by themselves (once each; the cashier may remove them).
  const [lookupProduct] = useLazyLookupProductQuery();
  const autoAdded = useRef(new Set());
  const addFinished = async (piece) => {
    try {
      const p = await lookupProduct(piece.sku).unwrap();
      if (p.status === 'in_stock' && String(p.branch?.id) === String(activeBranchId)) addProduct(p);
      else toast.error(`${p.sku} is not in stock at ${branchName}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };
  useEffect(() => {
    for (const item of linkedOrder?.items ?? []) {
      const piece = item.product;
      if (piece?.status === 'in_stock' && !autoAdded.current.has(String(piece.id))) {
        autoAdded.current.add(String(piece.id));
        addFinished(piece);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedOrder]);
  const [finishing, setFinishing] = useState(null);
  const canCreateProduct = usePermission('product.create');
  const canAdjustStock = usePermission('inventory.adjust');
  const canEditOrder = usePermission('order.edit');
  const canFinish = canEditOrder && canCreateProduct && canAdjustStock;
  const removeLine = (id) => setLines((ls) => ls.filter((l) => l.product.id !== id));
  const setDiscount = (id, discount) => setLines((ls) => ls.map((l) => (l.product.id === id ? { ...l, discount } : l)));
  const setDiscountType = (id, discountType) => setLines((ls) => ls.map((l) => (l.product.id === id ? { ...l, discountType, discount: '' } : l)));
  const quoteLine = (id) => quote?.items?.find((i) => String(i.productId) === String(id));
  const setPayment = (n, patch) => setPayments((rows) => rows.map((r, i) => (i === n ? { ...r, ...patch } : r)));
  const clearBill = () => {
    setLines([]);
    setPayments([{ mode: 'cash', amount: '', reference: '' }]);
    setTendered('');
    setNotes('');
  };

  const pickOrder = (id) => {
    setOrderId(id);
    if (id) params.set('orderId', id);
    else params.delete('orderId');
    setParams(params, { replace: true });
  };
  const changeCustomer = (c) => {
    setCustomer(c);
    if (orderId && linkedOrder && c?.id !== linkedOrder.customer.id) pickOrder(null);
  };

  const compliance = quote?.compliance;
  const cashPaid = payments.filter((p) => p.mode === 'cash').reduce((s, p) => s + safePaise(p.amount), 0);
  const cashOver = compliance && cashPaid > compliance.cashLimitPaise;
  const change = cashPaid > 0 && tendered ? safePaise(tendered) - cashPaid : null;
  const problems = [];
  if (!lines.length) problems.push('Add at least one item');
  if (quoteError) problems.push(getErrorMessage(quoteError));
  if (quote && remaining !== 0) problems.push(remaining > 0 ? `${formatINR(remaining)} still to collect` : `${formatINR(-remaining)} more than due`);
  if (payments.some((p) => p.mode === 'credit') && !customer) problems.push('Select a customer for credit');
  if (compliance?.panMissing) problems.push('PAN required for this bill value');
  if (cashOver && compliance.cashLimitAction === 'block') problems.push('Cash above the legal limit');

  const generate = async () => {
    try {
      const sale = await createSale({
        idempotencyKey: idempotencyKey.current,
        ...request,
        payments: payments.filter((p) => safePaise(p.amount) > 0).map((p) => ({ mode: p.mode, amountPaise: safePaise(p.amount), reference: p.reference || null })),
        notes: notes || null,
      }).unwrap();
      toast.success(`Invoice ${sale.invoiceNo} created`);
      navigate(`/sales/${sale.id}`, { replace: true });
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const exclude = new Set(lines.map((l) => String(l.product.id)));
  const totals = quote?.totals;
  const grossTotal = lines.reduce((s, l) => s + (l.product.grossWeightMg ?? 0), 0);

  return (
    <>
      <PageHeader
        title="New bill"
        subtitle={`${branchName} · prices use today's metal rates`}
        actions={
          lines.length > 0 && (
            <Button color="secondary" startIcon={<RestartAltRoundedIcon />} onClick={clearBill}>
              Clear bill
            </Button>
          )
        }
      />
      <RateStrip enabled={session.catalog?.enabledPurities} />

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Card>
            <CardContent>
              {linkedOrder && (
                <OrderPanel order={linkedOrder} onBill={exclude} canFinish={canFinish} onFinish={setFinishing} onAdd={addFinished} />
              )}
              <ItemSearch branchId={activeBranchId} branchName={branchName} exclude={exclude} onAdd={addProduct} />
              <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 0.75 }}>
                Scan the tag barcode and the item is added at once, or type SKU, HUID or name and press Enter.
              </Typography>

              {lines.length === 0 ? (
                <Box sx={{ mt: 3, py: 6, borderRadius: 3, border: '2px dashed', borderColor: 'divider', textAlign: 'center' }}>
                  <Box sx={{ mx: 'auto', mb: 1.5, width: 56, height: 56, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: 'rgba(201, 162, 39, 0.12)', color: tokens.light.goldDark }}>
                    <QrCodeScannerRoundedIcon />
                  </Box>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                    Scan an item to start the bill
                  </Typography>
                  <Typography variant="body2" color="textSecondary">
                    Only items in stock at {branchName} can be billed here.
                  </Typography>
                </Box>
              ) : (
                <>
                  <Stack direction="row" sx={{ mt: 2.5, mb: 1.5, alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography variant="overline" color="textSecondary">
                      {lines.length} item{lines.length === 1 ? '' : 's'} · {formatWeight(grossTotal)} gross
                    </Typography>
                    {quoting && (
                      <Typography variant="caption" color="textSecondary">
                        Updating prices…
                      </Typography>
                    )}
                  </Stack>
                  <Stack spacing={1.5}>
                    {lines.map(({ product, discount, discountType }, index) => (
                      <LineCard
                        key={product.id}
                        index={index}
                        product={product}
                        discount={discount}
                        huidMissing={product.metal === 'gold' && Boolean(session.catalog?.huidMandatory) && !product.huid && product.jewelleryType !== 'coin_bar'}
                        onHuidSaved={(updated) => setLines((ls) => ls.map((l) => (l.product.id === product.id ? { ...l, product: { ...l.product, huid: updated.huid } } : l)))}
                        discountType={discountType}
                        onDiscountType={(v) => setDiscountType(product.id, v)}
                        breakdown={quoteLine(product.id)?.breakdown}
                        quoting={quoting}
                        canDiscount={canDiscount}
                        onDiscount={(v) => setDiscount(product.id, v)}
                        onRemove={() => removeLine(product.id)}
                      />
                    ))}
                  </Stack>
                </>
              )}
              {quoteError && (
                <Alert severity="error" sx={{ mt: 2 }}>
                  {getErrorMessage(quoteError)}
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Stack spacing={2.5} sx={{ position: { lg: 'sticky' }, top: { lg: 88 } }}>
            <Card>
              <CardContent>
                <Typography variant="overline" color="textSecondary" sx={{ display: 'block', mb: 1 }}>
                  Customer
                </Typography>
                <CustomerPicker value={customer} onChange={changeCustomer} label="Customer (optional for walk-in)" />
                {customer && canViewOrders && (customerOrders?.items?.length ?? 0) > 0 && (
                  <TextField select label="Deliver an order" value={orderId ?? ''} onChange={(e) => pickOrder(e.target.value || null)} helperText="Its advance is deducted from this bill" sx={{ mt: 2 }}>
                    <MenuItem value="">
                      <em>No order</em>
                    </MenuItem>
                    {customerOrders.items.map((o) => (
                      <MenuItem key={o.id} value={o.id}>
                        {o.orderNo} · advance {formatINR(o.advancePaise, { decimals: 0 })}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              </CardContent>
            </Card>

            <Card sx={{ overflow: 'hidden' }}>
              <Box sx={{ p: 2.5, background: `${tokens.sidebar.glow}, ${tokens.sidebar.surface}`, color: '#F7F3E8' }}>
                <Money light label="Taxable value" value={totals ? formatINR(totals.taxablePaise) : '—'} />
                {totals?.discountPaise > 0 && <Money light label={billLabels(totals).discount} value={formatINR(totals.discountPaise)} negative />}
                {totals &&
                  (quote.interState ? (
                    <Money light label={billLabels(totals).igst} value={formatINR(totals.igstPaise)} />
                  ) : (
                    <>
                      <Money light label={billLabels(totals).cgst} value={formatINR(totals.cgstPaise)} />
                      <Money light label={billLabels(totals).sgst} value={formatINR(totals.sgstPaise)} />
                    </>
                  ))}
                {totals?.roundOffPaise ? <Money light label="Round off" value={formatINR(totals.roundOffPaise)} /> : null}
                {quote?.advancePaise > 0 && (
                  <>
                    <Money light label="Bill total" value={formatINR(totals.grandTotalPaise)} strong />
                    <Money light label={`Advance ${quote.order.orderNo}`} value={formatINR(quote.advancePaise)} negative />
                  </>
                )}
                <Divider sx={{ my: 1.5, borderColor: 'rgba(201, 162, 39, 0.3)' }} />
                <Typography variant="overline" sx={{ color: 'rgba(247, 243, 232, 0.6)' }}>
                  To collect
                </Typography>
                <Typography sx={{ fontFamily: fonts.display, fontSize: 40, fontWeight: 700, lineHeight: 1.1, color: '#F4A09A' }}>{quote ? formatINR(payable) : '—'}</Typography>
              </Box>

              <CardContent>
                <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', mb: 1.25 }}>
                  <Typography variant="overline" color="textSecondary">
                    Payment
                  </Typography>
                  <Button size="small" startIcon={<AddRoundedIcon />} onClick={() => setPayments((rows) => [...rows, { mode: 'upi', amount: remaining > 0 ? rupees(remaining) : '', reference: '' }])}>
                    Split
                  </Button>
                </Stack>
                <Stack spacing={2}>
                  {payments.map((p, n) => (
                    <Box key={n}>
                      <Stack direction="row" spacing={0.75} sx={{ mb: 1, flexWrap: 'wrap', gap: 0.75 }}>
                        {(customer ? PAYMENT_MODES : QUICK_MODES).map((m) => (
                          <Chip key={m.value} label={m.label} onClick={() => setPayment(n, { mode: m.value })} color={p.mode === m.value ? 'primary' : 'default'} variant={p.mode === m.value ? 'filled' : 'outlined'} sx={{ fontWeight: 600 }} />
                        ))}
                        {payments.length > 1 && (
                          <IconButton size="small" onClick={() => setPayments((rows) => rows.filter((_, i) => i !== n))} aria-label="Remove payment" sx={{ ml: 'auto' }}>
                            <CloseRoundedIcon fontSize="small" />
                          </IconButton>
                        )}
                      </Stack>
                      <Stack direction="row" spacing={1}>
                        <TextField
                          placeholder="Amount"
                          value={p.amount}
                          onChange={(e) => setPayment(n, { amount: e.target.value.replace(/[^\d.]/g, '') })}
                          slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }}
                        />
                        {remaining !== 0 && quote && (
                          <Button variant="outlined" onClick={() => setPayment(n, { amount: rupees(safePaise(p.amount) + remaining) })} sx={{ flexShrink: 0 }}>
                            Exact
                          </Button>
                        )}
                      </Stack>
                      {p.mode !== 'cash' && p.mode !== 'credit' && (
                        <TextField placeholder="Reference (card / UPI no.)" value={p.reference} onChange={(e) => setPayment(n, { reference: e.target.value })} sx={{ mt: 1 }} />
                      )}
                    </Box>
                  ))}
                </Stack>

                {quote && (
                  <Stack direction="row" sx={{ mt: 2, p: 1.25, borderRadius: 1.5, bgcolor: 'action.hover', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                    <Box>
                      <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>
                        Paid
                      </Typography>
                      <Amount paise={paid} tone="paid" sx={{ fontSize: '1rem', fontWeight: 700 }} />
                    </Box>
                    <Box sx={{ textAlign: 'right' }}>
                      <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>
                        {remaining > 0 ? 'Remaining due' : remaining < 0 ? 'Paid more than due' : 'Balance'}
                      </Typography>
                      {remaining === 0 ? (
                        <Chip size="small" color="success" label="Fully paid" sx={{ fontWeight: 700 }} />
                      ) : (
                        <Amount paise={Math.abs(remaining)} tone="due" sx={{ fontSize: '1rem', fontWeight: 700 }} />
                      )}
                    </Box>
                  </Stack>
                )}

                {cashPaid > 0 && (
                  <Stack direction="row" spacing={1} sx={{ mt: 2, alignItems: 'center' }}>
                    <TextField
                      label="Cash received"
                      value={tendered}
                      onChange={(e) => setTendered(e.target.value.replace(/[^\d.]/g, ''))}
                      slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }}
                    />
                    <Box sx={{ minWidth: 110, textAlign: 'right' }}>
                      <Typography variant="caption" color="textSecondary">
                        Change to return
                      </Typography>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700, color: change != null && change < 0 ? 'error.main' : 'success.main' }}>
                        {change == null ? '—' : change < 0 ? `${formatINR(-change)} short` : formatINR(change)}
                      </Typography>
                    </Box>
                  </Stack>
                )}

                <Stack spacing={1.5} sx={{ mt: 2 }}>
                  {compliance?.panMissing && <Alert severity="warning">This bill needs the customer&apos;s PAN. {customer ? 'Add PAN to the customer.' : 'Select a customer with PAN.'}</Alert>}
                  {cashOver && <Alert severity={compliance.cashLimitAction === 'block' ? 'error' : 'warning'}>Cash above {formatINR(compliance.cashLimitPaise, { decimals: 0 })} (Section 269ST).</Alert>}
                  <TextField label="Note on bill (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
                  <Button variant="contained" size="large" disabled={problems.length > 0 || quoting} loading={saving} onClick={generate} startIcon={<ReceiptLongOutlinedIcon />} sx={{ py: 1.4, fontSize: '1rem' }}>
                    Generate bill {quote ? `· ${formatINR(payable, { decimals: 0 })}` : ''}
                  </Button>
                  {problems.length > 0 && lines.length > 0 && (
                    <Typography variant="caption" color="textSecondary" sx={{ textAlign: 'center' }}>
                      {problems[0]}
                    </Typography>
                  )}
                </Stack>
              </CardContent>
            </Card>
          </Stack>
        </Grid>
      </Grid>
      {linkedOrder && <FinishItemDialog order={linkedOrder} index={finishing} onClose={() => setFinishing(null)} onFinished={(piece) => { autoAdded.current.add(String(piece.id)); addFinished(piece); }} />}
    </>
  );
}
