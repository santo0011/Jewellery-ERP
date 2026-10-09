import { zodResolver } from '@hookform/resolvers/zod';
import AddCardOutlinedIcon from '@mui/icons-material/AddCardOutlined';
import BlockRoundedIcon from '@mui/icons-material/BlockRounded';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import { Alert, Box, Button, Card, Chip, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Grid, Stack, Step, StepLabel, Stepper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';
import { formatINR, formatWeight, JEWELLERY_TYPES, ORDER_STATUS_LABELS, STONE_TYPES, toPaise } from '@jerp/shared';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useNavigate, useParams } from 'react-router';
import { z } from 'zod';
import PageHeader from '../../components/PageHeader.jsx';
import RHFSelect from '../../components/form/RHFSelect.jsx';
import RHFTextField from '../../components/form/RHFTextField.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import { usePermission } from '../../hooks/usePermission.js';
import { applyServerErrors, getErrorMessage } from '../../utils/errors.js';
import { formatDate, formatDateTime } from '../../utils/format.js';
import { purityLabel } from '../products/productForm.js';
import { useAddOrderAdvanceMutation, useCancelOrderMutation, useOrderQuery, useSetOrderStatusMutation } from './orderApi.js';
import FinishItemDialog from './FinishItemDialog.jsx';
import OrderPhotos from './OrderPhotos.jsx';
import { ADVANCE_MODE_OPTIONS, NEXT_STEP, OrderStatusChip, paymentLabel } from './orderUi.jsx';
import { MONEY_TONE } from '../../components/Amount.jsx';

const STEPS = ['booked', 'in_progress', 'ready', 'delivered'];

const advanceForm = z.object({
  amount: z.string().trim().regex(/^\d+(\.\d{0,2})?$/, 'Enter the amount').refine((v) => Number(v) > 0, 'Amount must be more than zero'),
  mode: z.string().min(1, 'Select how it was paid'),
  reference: z.string().trim().max(60),
});

function AdvanceDialog({ order, open, onClose }) {
  const [add, { isLoading, error, reset: resetMutation }] = useAddOrderAdvanceMutation();
  const { control, handleSubmit, reset, setError } = useForm({ resolver: zodResolver(advanceForm), defaultValues: { amount: '', mode: 'cash', reference: '' } });
  useEffect(() => {
    if (open) {
      reset({ amount: '', mode: 'cash', reference: '' });
      resetMutation();
    }
    // Only when it opens: resetMutation changes identity once a request starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onSubmit = handleSubmit(async (v) => {
    try {
      await add({ id: order.id, mode: v.mode, amountPaise: toPaise(v.amount), reference: v.reference || null }).unwrap();
      toast.success('Advance received');
      onClose();
    } catch (err) {
      applyServerErrors({ data: { error: { details: err?.data?.error?.details?.map((d) => ({ ...d, path: d.path === 'amountPaise' ? 'amount' : d.path })) } } }, setError);
    }
  });

  return (
    <Dialog open={open} onClose={isLoading ? undefined : onClose} maxWidth="xs" fullWidth>
      <form noValidate onSubmit={onSubmit}>
        <DialogTitle sx={{ fontWeight: 600 }}>Receive advance</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            {error && !error.data?.error?.details && <Alert severity="error">{getErrorMessage(error)}</Alert>}
            <RHFTextField control={control} name="amount" label="Amount (₹)" autoFocus slotProps={{ htmlInput: { inputMode: 'decimal' } }} />
            <RHFSelect control={control} name="mode" label="Paid by" options={ADVANCE_MODE_OPTIONS} />
            <RHFTextField control={control} name="reference" label="Reference (optional)" />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="secondary" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" loading={isLoading}>
            Save receipt
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

const cancelForm = z.object({ reason: z.string().trim().min(5, 'Give a reason (at least 5 characters)').max(300), refundMode: z.string() });

function CancelDialog({ order, open, onClose }) {
  const [cancel, { isLoading, error, reset: resetMutation }] = useCancelOrderMutation();
  const { control, handleSubmit, reset, setError } = useForm({ resolver: zodResolver(cancelForm), defaultValues: { reason: '', refundMode: 'cash' } });
  useEffect(() => {
    if (open) {
      reset({ reason: '', refundMode: 'cash' });
      resetMutation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const onSubmit = handleSubmit(async (v) => {
    try {
      await cancel({ id: order.id, reason: v.reason, ...(order.advancePaise > 0 && { refundMode: v.refundMode }) }).unwrap();
      toast.success(`Order ${order.orderNo} cancelled`);
      onClose();
    } catch (err) {
      applyServerErrors(err, setError);
    }
  });

  return (
    <Dialog open={open} onClose={isLoading ? undefined : onClose} maxWidth="xs" fullWidth>
      <form noValidate onSubmit={onSubmit}>
        <DialogTitle sx={{ fontWeight: 600 }}>Cancel order?</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            {order.advancePaise > 0 && (
              <Alert severity="warning">
                The advance of <strong>{formatINR(order.advancePaise)}</strong> will be refunded to {order.customer.name}.
              </Alert>
            )}
            {error && !error.data?.error?.details && <Alert severity="error">{getErrorMessage(error)}</Alert>}
            <RHFTextField control={control} name="reason" label="Reason" autoFocus multiline minRows={2} />
            {order.advancePaise > 0 && <RHFSelect control={control} name="refundMode" label="Refund by" options={ADVANCE_MODE_OPTIONS} />}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button color="secondary" onClick={onClose} disabled={isLoading}>
            Keep order
          </Button>
          <Button type="submit" variant="contained" color="error" loading={isLoading}>
            Cancel order
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

const typeLabel = (v) => JEWELLERY_TYPES.find((t) => t.value === v)?.label;
const stoneLabel = (v) => STONE_TYPES.find((t) => t.value === v)?.label ?? v;
const makingText = (m) => (m.type === 'percent' ? `${m.value / 100}%` : m.type === 'per_gram' ? `${formatINR(m.value, { decimals: 0 })}/g` : formatINR(m.value, { decimals: 0 }));

/** The agreed specification of an order line, as small chips. */
function ItemSpecs({ item: i }) {
  const chips = [
    i.jewelleryType && typeLabel(i.jewelleryType),
    ...(i.stones ?? []).map((s) => `${s.count} ${stoneLabel(s.type)}${s.name ? ` (${s.name})` : ''} · ${s.weight / 1000} ${s.weightUnit}`),
    i.pricingMode === 'fixed' ? `Fixed price ${formatINR(i.fixedPricePaise, { decimals: 0 })}` : null,
    i.pricingMode !== 'fixed' && i.wastage?.mode === 'percent' && i.wastage.value ? `Wastage ${i.wastage.value / 100}%` : null,
    i.pricingMode !== 'fixed' && i.making?.value ? `Making ${makingText(i.making)}` : null,
    i.otherChargePaise ? `Other ${formatINR(i.otherChargePaise, { decimals: 0 })}` : null,
    i.huid && `HUID ${i.huid}`,
  ].filter(Boolean);
  if (!chips.length) return null;
  return (
    <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.5, mt: 0.75 }}>
      {chips.map((c) => (
        <Chip key={c} size="small" variant="outlined" label={c} sx={{ height: 20, fontSize: '0.6875rem' }} />
      ))}
    </Stack>
  );
}

function MoneyRow({ label, value, strong, tone }) {
  return (
    <Stack direction="row" spacing={2} sx={{ justifyContent: 'space-between' }}>
      <Typography variant="body2" color={strong ? 'textPrimary' : 'textSecondary'} sx={{ fontWeight: strong ? 700 : 400 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: strong ? 800 : 600, whiteSpace: 'nowrap', color: tone ? MONEY_TONE[tone] : 'text.primary' }}>
        {value}
      </Typography>
    </Stack>
  );
}

function Fact({ label, children }) {
  return (
    <Box>
      <Typography variant="caption" color="textSecondary">
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 500 }} component="div">
        {children}
      </Typography>
    </Box>
  );
}

export default function OrderDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: order, isLoading, error, refetch } = useOrderQuery(id);
  const [setStatus, { isLoading: moving }] = useSetOrderStatusMutation();
  const canEdit = usePermission('order.edit');
  const canCancel = usePermission('order.cancel');
  const canBill = usePermission('sales.create');
  const [dialog, setDialog] = useState(null);
  const [finishing, setFinishing] = useState(null);
  const canCreateProduct = usePermission('product.create');
  const canAdjustStock = usePermission('inventory.adjust');
  const canFinish = canEdit && canCreateProduct && canAdjustStock;

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const open = ['booked', 'in_progress', 'ready'].includes(order.status);
  // Every rupee for this order in one list: advances and refunds, then what was paid on the delivery bill.
  const invoice = order.invoice?.status === 'completed' ? order.invoice : null;
  const payments = [
    ...order.advances.map((a) => ({ key: a.id, title: a.amountPaise < 0 ? 'Refund' : 'Advance', mode: a.mode, amountPaise: a.amountPaise, doc: a.receiptNo, at: a.at, by: a.by?.name, reference: a.reference })),
    ...(invoice?.payments ?? []).map((p, n) => ({
      key: `inv${n}`,
      title: p.mode === 'credit' ? 'On credit (due)' : 'Paid at delivery',
      mode: p.mode,
      amountPaise: p.amountPaise,
      doc: invoice.invoiceNo,
      at: invoice.createdAt,
      reference: p.reference,
      credit: p.mode === 'credit',
    })),
  ];
  const totalReceived = payments.filter((p) => !p.credit).reduce((sum, p) => sum + p.amountPaise, 0);
  const next = NEXT_STEP[order.status];
  const step = order.status === 'cancelled' ? -1 : STEPS.indexOf(order.status);

  const move = async (status) => {
    try {
      await setStatus({ id: order.id, status }).unwrap();
      toast.success(`Order marked ${ORDER_STATUS_LABELS[status].toLowerCase()}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <>
      <PageHeader
        title={order.orderNo}
        subtitle={
          <Stack component="span" direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            {order.priority === 'urgent' && <Chip size="small" color="error" label="Urgent" sx={{ height: 22, fontWeight: 700 }} />}
            <span>
              Booked {formatDate(order.createdAt)} at {order.branch?.name ?? ''}
            </span>
          </Stack>
        }
        back={{ to: '/orders', label: 'Orders' }}
        actions={
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
            {open && canCancel && (
              <Button color="error" startIcon={<BlockRoundedIcon />} onClick={() => setDialog('cancel')}>
                Cancel order
              </Button>
            )}
            {open && canEdit && (
              <Button variant="outlined" startIcon={<AddCardOutlinedIcon />} onClick={() => setDialog('advance')}>
                Add advance
              </Button>
            )}
            {open && canEdit && next && (
              <Button variant="outlined" loading={moving} onClick={() => move(next.status)}>
                {next.label}
              </Button>
            )}
            {open && canBill && (
              <Button variant="contained" startIcon={<ReceiptLongOutlinedIcon />} onClick={() => navigate(`/billing?orderId=${order.id}`)}>
                Create bill
              </Button>
            )}
            {order.saleId && (
              <Button variant="contained" startIcon={<ReceiptLongOutlinedIcon />} onClick={() => navigate(`/sales/${order.saleId}`)}>
                View invoice {order.invoiceNo}
              </Button>
            )}
          </Stack>
        }
      />

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ alignItems: { md: 'center' } }}>
            <OrderStatusChip status={order.status} size="medium" />
            {order.status === 'cancelled' ? (
              <Typography variant="body2" color="error">
                Cancelled {formatDateTime(order.cancelledAt)} · {order.cancelReason}
              </Typography>
            ) : (
              <Stepper activeStep={step} alternativeLabel sx={{ flex: 1 }}>
                {STEPS.map((s) => (
                  <Step key={s} completed={STEPS.indexOf(s) < step || order.status === 'delivered'}>
                    <StepLabel>{ORDER_STATUS_LABELS[s]}</StepLabel>
                  </Step>
                ))}
              </Stepper>
            )}
          </Stack>
          {order.overdue && (
            <Alert severity="error" sx={{ mt: 2 }}>
              Delivery was due {formatDate(order.expectedDate)}.
            </Alert>
          )}
        </CardContent>
      </Card>

      <Grid container spacing={3}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <OrderPhotos order={order} canEdit={open && canEdit} />
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h4" sx={{ mb: 2 }}>
                Items
              </Typography>
              {/* Fits the card without a sideways scrollbar: metal and weight share a column, text wraps, tighter cells. */}
              <Box>
                <Table size="small" sx={{ width: '100%', '& th, & td': { px: 1 }, '& th:first-of-type, & td:first-of-type': { pl: 0 }, '& th:last-of-type, & td:last-of-type': { pr: 0 }, '& th': { whiteSpace: 'nowrap' } }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Item</TableCell>
                      <TableCell>Metal · wt</TableCell>
                      <TableCell align="right">Qty</TableCell>
                      <TableCell align="right">Estimate</TableCell>
                      <TableCell align="right">Finished piece</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {order.items.map((i, n) => (
                      <TableRow key={n}>
                        <TableCell sx={{ wordBreak: 'break-word' }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {i.description}
                          </Typography>
                          <Typography variant="caption" color="textSecondary">
                            {[i.categoryName, i.size && `Size ${i.size}`, i.notes].filter(Boolean).join(' · ') || '—'}
                          </Typography>
                          <ItemSpecs item={i} />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ whiteSpace: 'nowrap' }}>
                            {i.purity ? purityLabel(i.metal, i.purity) : i.metal}
                          </Typography>
                          <Typography variant="caption" color="textSecondary" sx={{ whiteSpace: 'nowrap' }}>
                            {i.approxWeightMg ? `~${formatWeight(i.approxWeightMg)}` : 'Weight —'}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">{i.quantity}</TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          {i.estimatedPaise ? formatINR(i.estimatedPaise * i.quantity, { decimals: 0 }) : '—'}
                        </TableCell>
                        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                          {i.product ? (
                            <Chip size="small" label={`${i.product.sku} · ${formatWeight(i.product.grossWeightMg)}`} color={i.product.status === 'in_stock' ? 'success' : 'default'} variant="outlined" onClick={() => navigate(`/products/${i.product.id}`)} />
                          ) : open && canFinish ? (
                            <Button size="small" variant="outlined" onClick={() => setFinishing(n)}>
                              Finish item
                            </Button>
                          ) : (
                            <Typography variant="caption" color="textSecondary">
                              Not made yet
                            </Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
              {order.notes && (
                <Typography variant="body2" color="textSecondary" sx={{ mt: 2 }}>
                  Notes: {order.notes}
                </Typography>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h4" sx={{ mb: 2 }}>
                Payments
              </Typography>
              {payments.length === 0 ? (
                <Typography variant="body2" color="textSecondary">
                  No payment received yet.
                </Typography>
              ) : (
                <Stack divider={<Divider flexItem />} spacing={1.25}>
                  {payments.map((p) => (
                    <Stack key={p.key} direction="row" spacing={2} sx={{ alignItems: 'center' }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {p.title} · {paymentLabel(p.mode)}
                        </Typography>
                        <Typography variant="caption" color="textSecondary">
                          {[p.doc, formatDateTime(p.at), p.by, p.reference].filter(Boolean).join(' · ')}
                        </Typography>
                      </Box>
                      <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: 'nowrap', color: p.credit || p.amountPaise < 0 ? MONEY_TONE.due : MONEY_TONE.paid }}>
                        {p.credit ? '' : p.amountPaise < 0 ? '−' : '+'}
                        {formatINR(Math.abs(p.amountPaise))}
                      </Typography>
                    </Stack>
                  ))}
                  <Stack direction="row" sx={{ justifyContent: 'space-between', pt: 0.5 }}>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      Total received
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 800, color: MONEY_TONE.paid }}>
                      {formatINR(totalReceived)}
                    </Typography>
                  </Stack>
                </Stack>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={{ xs: 12, lg: 4 }}>
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h4" sx={{ mb: 2 }}>
                Summary
              </Typography>
              <Stack spacing={1.5}>
                <Fact label="Customer">
                  {order.customer.name} · {order.customer.mobile}
                </Fact>
                <Fact label="Delivery date">{order.expectedDate ? formatDate(order.expectedDate) : 'Not set'}</Fact>
                <Divider />
                {invoice ? (
                  <>
                    <MoneyRow label={`Bill total (${invoice.invoiceNo})`} value={formatINR(invoice.grandTotalPaise)} />
                    <MoneyRow label="Advance" value={formatINR(invoice.advanceAdjustedPaise)} tone="paid" />
                    <MoneyRow label="Paid at delivery" value={formatINR(invoice.paidPaise)} tone="paid" />
                    <MoneyRow label="Total paid" value={formatINR(invoice.advanceAdjustedPaise + invoice.paidPaise)} strong tone="paid" />
                    <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', p: 1.25, borderRadius: 1.5, bgcolor: invoice.duePaise ? 'rgba(155, 44, 44, 0.08)' : 'rgba(46, 107, 79, 0.08)' }}>
                      <Typography variant="body2" sx={{ fontWeight: 700 }}>
                        Due
                      </Typography>
                      {invoice.duePaise ? (
                        <Typography variant="subtitle1" sx={{ fontWeight: 800, color: 'error.main' }}>
                          {formatINR(invoice.duePaise)}
                        </Typography>
                      ) : (
                        <Chip size="small" color="success" label="Fully paid · ₹0" sx={{ fontWeight: 700 }} />
                      )}
                    </Stack>
                  </>
                ) : (
                  <>
                    <MoneyRow label="Estimated total" value={order.estimatedPaise ? formatINR(order.estimatedPaise) : '—'} />
                    <MoneyRow label="Advance received" value={formatINR(order.advancePaise)} tone="paid" />
                    {open && <MoneyRow label="Due at delivery (estimate)" value={order.estimatedPaise ? formatINR(order.balancePaise) : 'Billed at delivery'} strong tone={order.estimatedPaise && order.balancePaise ? 'due' : undefined} />}
                  </>
                )}
              </Stack>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="h4" sx={{ mb: 2 }}>
                Timeline
              </Typography>
              <Stack spacing={1.5}>
                {[...order.timeline].reverse().map((t, n) => (
                  <Stack key={n} direction="row" spacing={1.5}>
                    <Box sx={{ mt: 0.75, width: 8, height: 8, borderRadius: '50%', flexShrink: 0, bgcolor: n === 0 ? 'primary.main' : 'divider' }} />
                    <Box>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {ORDER_STATUS_LABELS[t.status] ?? t.status}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        {formatDateTime(t.at)}
                        {t.by ? ` · ${t.by.name}` : ''}
                        {t.note ? ` · ${t.note}` : ''}
                      </Typography>
                    </Box>
                  </Stack>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <AdvanceDialog order={order} open={dialog === 'advance'} onClose={() => setDialog(null)} />
      <CancelDialog order={order} open={dialog === 'cancel'} onClose={() => setDialog(null)} />
      <FinishItemDialog order={order} index={finishing} onClose={() => setFinishing(null)} />
    </>
  );
}
