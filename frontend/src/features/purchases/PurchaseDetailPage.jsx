import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import { Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Grid, InputAdornment, Link, LinearProgress, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { formatINR, formatWeight, METAL_POOL_KINDS, toPaise } from '@jerp/shared';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Link as RouterLink, useNavigate, useParams } from 'react-router';
import DataTable from '../../components/DataTable.jsx';
import InfoCard from '../../components/InfoCard.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import { usePermission } from '../../hooks/usePermission.js';
import { formatDate, formatDateTime } from '../../utils/format.js';
import { getErrorMessage } from '../../utils/errors.js';
import { purityLabel } from '../products/productForm.js';
import { usePayPurchaseMutation, usePurchaseQuery } from './purchaseApi.js';
import { PaymentChip, PAY_MODES, payModeLabel } from './purchaseUi.jsx';

const kindLabel = (k) => METAL_POOL_KINDS.find((x) => x.value === k)?.label ?? k;

function PayDialog({ purchase, onClose }) {
  const [pay, state] = usePayPurchaseMutation();
  const [amount, setAmount] = useState(String(purchase.duePaise / 100));
  const [mode, setMode] = useState('bank');
  const [reference, setReference] = useState('');
  let paise = 0;
  try {
    paise = toPaise(amount) ?? 0;
  } catch {
    paise = 0;
  }
  const valid = paise > 0 && paise <= purchase.duePaise;
  const submit = async () => {
    try {
      await pay({ id: purchase.id, amountPaise: paise, mode, reference: reference.trim() || null }).unwrap();
      toast.success(`${formatINR(paise, { decimals: 0 })} paid to ${purchase.supplier.name}`);
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };
  return (
    <Dialog open onClose={state.isLoading ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>Pay {purchase.supplier.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
            error={!valid}
            helperText={`Due ${formatINR(purchase.duePaise, { decimals: 0 })}`}
            slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }}
            autoFocus
          />
          <ToggleButtonGroup exclusive fullWidth size="small" value={mode} onChange={(e, v) => v && setMode(v)}>
            {PAY_MODES.map((m) => (
              <ToggleButton key={m.value} value={m.value}>
                {m.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
          <TextField label="Reference (optional)" value={reference} onChange={(e) => setReference(e.target.value)} helperText="Cheque / NEFT / UPI ref." slotProps={{ htmlInput: { maxLength: 60 } }} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={state.isLoading}>
          Cancel
        </Button>
        <Button variant="contained" onClick={submit} disabled={!valid || state.isLoading}>
          Pay {paise ? formatINR(paise, { decimals: 0 }) : ''}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function Row({ label, value, strong, tone }) {
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

export default function PurchaseDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: p, isLoading, error, refetch } = usePurchaseQuery(id);
  const canPay = usePermission('purchase.edit');
  const [paying, setPaying] = useState(false);

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const t = p.totals;
  const paidPct = t.totalPaise ? Math.round((p.paidPaise / t.totalPaise) * 100) : 100;

  return (
    <>
      <PageHeader
        title={`Bill ${p.billNo}`}
        subtitle={`${p.supplier.name} · ${formatDate(p.billDate)} · ${p.purchaseNo}`}
        back={{ to: '/purchases', label: 'Purchases' }}
        actions={
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <PaymentChip status={p.paymentStatus} />
            {canPay && p.duePaise > 0 && (
              <Button variant="contained" startIcon={<PaymentsOutlinedIcon />} onClick={() => setPaying(true)}>
                Pay supplier
              </Button>
            )}
          </Stack>
        }
      />

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Stack spacing={2}>
            {p.items.length > 0 && (
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                  Pieces ({p.items.length})
                </Typography>
                <DataTable
                  columns={[
                    {
                      key: 'item',
                      label: 'Item',
                      render: (i) => (
                        <Box>
                          <Link component={RouterLink} to={`/products/${i.productId}`} underline="hover" variant="body2" sx={{ fontWeight: 600 }}>
                            {i.sku}
                          </Link>
                          <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>
                            {i.name}
                          </Typography>
                        </Box>
                      ),
                    },
                    { key: 'purity', label: 'Purity', render: (i) => purityLabel(i.metal, i.purity) },
                    { key: 'wt', label: 'Weight', align: 'right', render: (i) => formatWeight(i.grossWeightMg) },
                    { key: 'cost', label: 'Cost', align: 'right', render: (i) => formatINR(i.costPaise, { decimals: 0 }) },
                  ]}
                  rows={p.items}
                  getRowId={(i) => String(i.productId)}
                />
              </Box>
            )}
            {p.metalLines.length > 0 && (
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                  Loose metal
                </Typography>
                <DataTable
                  columns={[
                    { key: 'kind', label: 'Type', render: (l) => kindLabel(l.kind) },
                    { key: 'purity', label: 'Purity', render: (l) => purityLabel(l.metal, l.purity) },
                    { key: 'wt', label: 'Weight', align: 'right', render: (l) => formatWeight(l.grossWeightMg) },
                    { key: 'fine', label: 'Fine', align: 'right', render: (l) => formatWeight(l.fineWeightMg) },
                    { key: 'value', label: 'Value', align: 'right', render: (l) => formatINR(l.valuePaise, { decimals: 0 }) },
                  ]}
                  rows={p.metalLines.map((l, i) => ({ ...l, rowKey: i }))}
                  getRowId={(l) => l.rowKey}
                />
              </Box>
            )}
            <InfoCard
              title="Bill details"
              items={[
                { label: 'Supplier', value: `${p.supplier.name}${p.supplier.gstin ? ` · GSTIN ${p.supplier.gstin}` : ''}` },
                { label: 'Bill', value: `${p.billNo} · ${formatDate(p.billDate)}` },
                { label: 'Branch', value: p.branch?.name },
                { label: 'Against order', value: p.order ? <Link component={RouterLink} to={`/purchases/orders/${p.order.id}`}>{p.order.orderNo}</Link> : null, hidden: !p.order },
                { label: 'Entered by', value: p.createdBy ? `${p.createdBy.name} · ${formatDateTime(p.createdAt)}` : formatDateTime(p.createdAt) },
                { label: 'Note', value: p.note, hidden: !p.note },
              ]}
            />
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Stack spacing={2}>
            <Card>
              <CardContent>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                  Amount
                </Typography>
                <Row label="Goods" value={formatINR(t.goodsPaise, { decimals: 0 })} />
                {t.otherChargesPaise > 0 && <Row label="Other charges" value={formatINR(t.otherChargesPaise, { decimals: 0 })} />}
                <Row label="GST (input credit)" value={formatINR(t.gstPaise, { decimals: 0 })} />
                <Divider sx={{ my: 1 }} />
                <Row label="Bill total" value={formatINR(t.totalPaise, { decimals: 0 })} strong />
                <Row label="Paid" value={formatINR(p.paidPaise, { decimals: 0 })} tone="success.main" />
                <Row label="Still to pay" value={formatINR(p.duePaise, { decimals: 0 })} tone={p.duePaise ? 'error.main' : 'success.main'} strong />
                <LinearProgress variant="determinate" value={paidPct} color={p.duePaise ? 'warning' : 'success'} sx={{ height: 6, borderRadius: 3, mt: 1 }} />
                <Typography variant="caption" color="textSecondary">
                  {t.pieces} pcs · {formatWeight(t.grossMg)} gross · {formatWeight(t.fineMg)} fine
                </Typography>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                  Payments
                </Typography>
                {p.payments.length === 0 ? (
                  <Typography variant="body2" color="textSecondary">
                    Nothing paid yet.
                  </Typography>
                ) : (
                  <Stack divider={<Divider flexItem />} spacing={1}>
                    {p.payments.map((x, i) => (
                      <Stack key={i} direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {payModeLabel(x.mode)} · {formatDate(x.date)}
                          </Typography>
                          <Typography variant="caption" color="textSecondary">
                            {[x.reference, x.by?.name].filter(Boolean).join(' · ') || ' '}
                          </Typography>
                        </Box>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.main' }}>
                          {formatINR(x.amountPaise, { decimals: 0 })}
                        </Typography>
                      </Stack>
                    ))}
                  </Stack>
                )}
              </CardContent>
            </Card>
            <Button variant="text" onClick={() => navigate(`/suppliers/${p.supplier.id}`)}>
              Open supplier →
            </Button>
          </Stack>
        </Grid>
      </Grid>
      {paying && <PayDialog purchase={p} onClose={() => setPaying(false)} />}
    </>
  );
}
