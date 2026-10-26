import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import { Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Grid, InputAdornment, Link, LinearProgress, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
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
import BillPhotos from './BillPhotos.jsx';
import { usePayPurchaseMutation, usePurchaseQuery } from './purchaseApi.js';
import { PaymentChip, PAY_MODES, payModeLabel } from './purchaseUi.jsx';
import KeepOnPhone from '../../components/KeepOnPhone.jsx';
import { t } from '../../i18n/index.js';

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
      toast.success(t('{{paise}} paid to {{name}}', { paise: formatINR(paise, { decimals: 0 }), name: purchase.supplier.name }));
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };
  return (
    <Dialog open onClose={state.isLoading ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>{t('Pay {{name}}', { name: purchase.supplier.name })}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField
            label={t('Amount')}
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
            error={!valid}
            helperText={<KeepOnPhone>{t('Due {{due}}', { due: formatINR(purchase.duePaise, { decimals: 0 }) })}</KeepOnPhone>}
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
          <TextField label={t('Reference (optional)')} value={reference} onChange={(e) => setReference(e.target.value)} helperText={t('Cheque / NEFT / UPI ref.')} slotProps={{ htmlInput: { maxLength: 60 } }} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={state.isLoading}>
          {t('Cancel')}
        </Button>
        <Button variant="contained" onClick={submit} disabled={!valid || state.isLoading}>
          {t('Pay {{value}}', { value: paise ? formatINR(paise, { decimals: 0 }) : '' })}
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
  const canAttach = usePermission(['purchase.create', 'purchase.edit']);
  const [paying, setPaying] = useState(false);

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const totals = p.totals;
  const paidPct = totals.totalPaise ? Math.round((p.paidPaise / totals.totalPaise) * 100) : 100;

  return (
    <>
      <PageHeader
        title={t('Bill {{billNo}}', { billNo: p.billNo })}
        subtitle={`${p.supplier.name} · ${formatDate(p.billDate)} · ${p.purchaseNo}`}
        back={{ to: '/purchases', label: t('Purchases') }}
        actions={
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <PaymentChip status={p.paymentStatus} cancelled={p.status === 'cancelled'} />
            {canPay && p.duePaise > 0 && p.status !== 'cancelled' && (
              <Button variant="contained" startIcon={<PaymentsOutlinedIcon />} onClick={() => setPaying(true)}>
                {t('Pay supplier')}
              </Button>
            )}
          </Stack>
        }
      />

      {p.status === 'cancelled' && (
        <Alert severity="warning" variant="outlined" sx={{ mb: 2 }}>
          {t('This bill was cancelled on {{date}}: its pieces and metal left stock and its entries were reversed. Original bill no. {{billNo}}.', { date: formatDate(p.cancelledAt), billNo: p.originalBillNo })}
          {p.cancelReason && ` — “${p.cancelReason}”`}
        </Alert>
      )}
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 8 }}>
          <Stack spacing={2}>
            {p.items.length > 0 && (
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                  {t('Pieces ({{count}})', { count: p.items.length })}
                </Typography>
                <DataTable
                  columns={[
                    {
                      key: 'item',
                      label: t('Item'),
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
                    { key: 'purity', label: t('Purity'), render: (i) => purityLabel(i.metal, i.purity) },
                    { key: 'wt', label: t('Weight'), align: 'right', render: (i) => formatWeight(i.grossWeightMg) },
                    { key: 'cost', label: t('Cost'), align: 'right', render: (i) => formatINR(i.costPaise, { decimals: 0 }) },
                  ]}
                  rows={p.items}
                  getRowId={(i) => String(i.productId)}
                />
              </Box>
            )}
            {p.metalLines.length > 0 && (
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                  {t('Loose metal')}
                </Typography>
                <DataTable
                  columns={[
                    { key: 'kind', label: t('Type'), render: (l) => kindLabel(l.kind) },
                    { key: 'purity', label: t('Purity'), render: (l) => purityLabel(l.metal, l.purity) },
                    { key: 'wt', label: t('Weight'), align: 'right', render: (l) => formatWeight(l.grossWeightMg) },
                    { key: 'fine', label: t('Fine'), align: 'right', render: (l) => formatWeight(l.fineWeightMg) },
                    { key: 'value', label: t('Value'), align: 'right', render: (l) => formatINR(l.valuePaise, { decimals: 0 }) },
                  ]}
                  rows={p.metalLines.map((l, i) => ({ ...l, rowKey: i }))}
                  getRowId={(l) => l.rowKey}
                />
              </Box>
            )}
            <InfoCard
              title={t('Bill details')}
              items={[
                { label: t('Supplier'), value: `${p.supplier.name}${p.supplier.gstin ? ` · GSTIN ${p.supplier.gstin}` : ''}` },
                { label: t('Bill'), value: `${p.billNo} · ${formatDate(p.billDate)}` },
                { label: t('Branch'), value: p.branch?.name },
                { label: t('Against order'), value: p.order ? <Link component={RouterLink} to={`/purchases/orders/${p.order.id}`}>{p.order.orderNo}</Link> : null, hidden: !p.order },
                { label: t('Entered by'), value: p.createdBy ? `${p.createdBy.name} · ${formatDateTime(p.createdAt)}` : formatDateTime(p.createdAt) },
                { label: t('Note'), value: p.note, hidden: !p.note },
              ]}
            />
            <BillPhotos purchase={p} canEdit={canAttach} />
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, md: 4 }}>
          <Stack spacing={2}>
            <Card>
              <CardContent>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                  {t('Amount')}
                </Typography>
                <Row label={t('Goods')} value={formatINR(totals.goodsPaise, { decimals: 0 })} />
                {totals.otherChargesPaise > 0 && <Row label={t('Other charges')} value={formatINR(totals.otherChargesPaise, { decimals: 0 })} />}
                <Row label={t('GST (input credit)')} value={formatINR(totals.gstPaise, { decimals: 0 })} />
                <Divider sx={{ my: 1 }} />
                <Row label={t('Bill total')} value={formatINR(totals.totalPaise, { decimals: 0 })} strong />
                <Row label={t('Paid')} value={formatINR(p.paidPaise, { decimals: 0 })} tone="success.main" />
                <Row label={t('Still to pay')} value={formatINR(p.duePaise, { decimals: 0 })} tone={p.duePaise ? 'error.main' : 'success.main'} strong />
                <LinearProgress variant="determinate" value={paidPct} color={p.duePaise ? 'warning' : 'success'} sx={{ height: 6, borderRadius: 3, mt: 1 }} />
                <Typography variant="caption" color="textSecondary">
                  {t('{{pieces}} pcs · {{gross}} gross · {{fine}} fine', { pieces: totals.pieces, gross: formatWeight(totals.grossMg), fine: formatWeight(totals.fineMg) })}
                </Typography>
              </CardContent>
            </Card>
            <Card>
              <CardContent>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                  {t('Payments')}
                </Typography>
                {p.payments.length === 0 ? (
                  <Typography variant="body2" color="textSecondary">
                    {t('Nothing paid yet.')}
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
              {t('Open supplier →')}
            </Button>
          </Stack>
        </Grid>
      </Grid>
      {paying && <PayDialog purchase={p} onClose={() => setPaying(false)} />}
    </>
  );
}
