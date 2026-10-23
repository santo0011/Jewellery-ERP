import BlockRoundedIcon from '@mui/icons-material/BlockRounded';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import CollectDueDialog from '../customers/CollectDueDialog.jsx';
import { Alert, Box, Button, Card, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { formatINR, formatWeight, rupeesInWords, stateName } from '@jerp/shared';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Link as RouterLink, useParams } from 'react-router';
import Amount, { MONEY_TONE } from '../../components/Amount.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import { useOrganisationLogo } from '../../hooks/useOrganisationLogo.js';
import { usePermission } from '../../hooks/usePermission.js';
import { fonts } from '../../theme/tokens.js';
import { getErrorMessage } from '../../utils/errors.js';
import { formatDateTime } from '../../utils/format.js';
import { paymentLabel } from '../orders/orderUi.jsx';
import PrintPreviewDialog from '../print/PrintPreviewDialog.jsx';
import { PrintSheet } from '../print/PrintSheet.jsx';
import { DEFAULT_LAYOUT } from '../print/printLayouts.js';
import { purityLabel } from '../products/productForm.js';
import { billLabels } from './billLabels.js';
import { useCancelSaleMutation, useSaleQuery } from './saleApi.js';

const address = (a) => (a ? [a.line1, a.line2, a.city, stateName(a.stateCode), a.pincode].filter(Boolean).join(', ') : '');

function Line({ label, value, strong, tone }) {
  return (
    <Stack direction="row" sx={{ justifyContent: 'space-between', py: 0.25 }}>
      <Typography variant="body2" sx={{ fontWeight: strong ? 700 : 400 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: strong ? 700 : 500, color: tone ? MONEY_TONE[tone] : 'inherit' }}>
        {value}
      </Typography>
    </Stack>
  );
}

function CancelDialog({ sale, open, onClose }) {
  const [reason, setReason] = useState('');
  const [cancel, { isLoading }] = useCancelSaleMutation();
  const submit = async () => {
    try {
      await cancel({ id: sale.id, reason }).unwrap();
      toast.success(`Invoice ${sale.invoiceNo} cancelled`);
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };
  return (
    <Dialog open={open} onClose={isLoading ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>Cancel invoice?</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <Typography variant="body2" color="textSecondary">
            Items go back into stock and the accounts are reversed.{sale.order ? ` Order ${sale.order.orderNo} becomes ready to bill again, with its advance.` : ''}
          </Typography>
          <TextField label="Reason" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus multiline minRows={2} error={reason.length > 0 && reason.trim().length < 5} helperText="At least 5 characters" />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button color="secondary" onClick={onClose} disabled={isLoading}>
          Keep invoice
        </Button>
        <Button variant="contained" color="error" onClick={submit} loading={isLoading} disabled={reason.trim().length < 5}>
          Cancel invoice
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default function InvoicePage() {
  const { id } = useParams();
  const { data: sale, isLoading, error, refetch } = useSaleQuery(id);
  const canCancel = usePermission('sales.cancel');
  const canCollect = usePermission('accounts.receipt');
  const canPrint = usePermission('sales.print');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [collectOpen, setCollectOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const logo = useOrganisationLogo();

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const { seller, customer, totals } = sale;
  const cancelled = sale.status === 'cancelled';
  const paidNow = sale.payments.filter((p) => p.mode !== 'credit').reduce((s, p) => s + p.amountPaise, 0);
  // Still owed (the server takes off what was collected later).
  const duePaise = sale.duePaise ?? 0;
  const collectedLater = sale.collectedLaterPaise ?? 0;
  // This branch's paper size and design (Business settings → Print), with what Invoice settings put on the page.
  const layout = { ...DEFAULT_LAYOUT, ...sale.print };
  const printLogo = seller.hasLogo === false ? null : logo;

  return (
    <>
      {/* Sales → Print: the preview, the Print button and Ctrl+P all need it. */}
      {canPrint && <PrintSheet sale={sale} layout={layout} logo={printLogo} />}
      <PageHeader
        title={sale.invoiceNo}
        subtitle={formatDateTime(sale.createdAt)}
        back={{ to: '/sales', label: 'Invoices' }}
        actions={
          <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
            {!cancelled && canCancel && (
              <Button color="error" startIcon={<BlockRoundedIcon />} onClick={() => setCancelOpen(true)}>
                Cancel
              </Button>
            )}
            {!cancelled && canCollect && customer?.id && duePaise > 0 && (
              <Button variant="outlined" startIcon={<PaymentsOutlinedIcon />} onClick={() => setCollectOpen(true)}>
                Collect due {formatINR(duePaise, { decimals: 0 })}
              </Button>
            )}
            {canPrint && (
              <Button variant="contained" startIcon={<PrintOutlinedIcon />} onClick={() => setPreviewOpen(true)}>
                Print
              </Button>
            )}
          </Stack>
        }
      />
      {cancelled && (
        <Alert severity="error" sx={{ mb: 2 }}>
          Cancelled {formatDateTime(sale.cancelledAt)}
          {sale.cancelledBy ? ` by ${sale.cancelledBy.name}` : ''}: {sale.cancelReason}
        </Alert>
      )}

      <Card sx={{ maxWidth: 900, mx: 'auto', p: { xs: 2, sm: 4 }, bgcolor: '#fff', color: '#171717' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between' }}>
          <Box>
            <Typography sx={{ fontFamily: fonts.display, fontSize: 28, fontWeight: 700, lineHeight: 1.1 }}>{seller.name}</Typography>
            <Typography variant="body2" sx={{ color: '#555' }}>
              {seller.branchName}
            </Typography>
            <Typography variant="caption" sx={{ display: 'block', color: '#555', maxWidth: 360 }}>
              {address(seller.address)}
            </Typography>
            <Typography variant="caption" sx={{ display: 'block', color: '#555' }}>
              {[seller.phone, seller.email].filter(Boolean).join(' · ')}
            </Typography>
            {seller.gstin && (
              <Typography variant="caption" sx={{ display: 'block', fontWeight: 600 }}>
                GSTIN {seller.gstin}
              </Typography>
            )}
          </Box>
          <Box sx={{ textAlign: { sm: 'right' } }}>
            <Typography sx={{ fontSize: 13, letterSpacing: '0.18em', fontWeight: 700, color: 'var(--brand-strong)' }}>TAX INVOICE</Typography>
            <Typography variant="h3" sx={{ mt: 0.5 }}>
              {sale.invoiceNo}
            </Typography>
            <Typography variant="body2" sx={{ color: '#555' }}>
              {formatDateTime(sale.createdAt)}
            </Typography>
            {sale.order && (
              <Typography variant="body2" sx={{ color: '#555' }}>
                Against order{' '}
                <Box component={RouterLink} to={`/orders/${sale.order.id}`} sx={{ color: 'inherit', fontWeight: 600 }}>
                  {sale.order.orderNo}
                </Box>
              </Typography>
            )}
            {cancelled && <Typography sx={{ mt: 1, fontWeight: 800, color: '#9B2C2C', letterSpacing: '0.1em' }}>CANCELLED</Typography>}
          </Box>
        </Stack>

        <Divider sx={{ my: 2.5, borderColor: '#E6E1D3' }} />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="overline" sx={{ color: '#777' }}>
              Bill to
            </Typography>
            {customer ? (
              <>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                  {customer.name}
                </Typography>
                <Typography variant="caption" sx={{ display: 'block', color: '#555' }}>
                  {customer.mobile}
                  {customer.code ? ` · ${customer.code}` : ''}
                </Typography>
                {address(customer.address) && (
                  <Typography variant="caption" sx={{ display: 'block', color: '#555', maxWidth: 360 }}>
                    {address(customer.address)}
                  </Typography>
                )}
                {customer.gstin && <Typography variant="caption" sx={{ display: 'block' }}>GSTIN {customer.gstin}</Typography>}
                {customer.pan && <Typography variant="caption" sx={{ display: 'block' }}>PAN {customer.pan}</Typography>}
              </>
            ) : (
              <Typography variant="subtitle2">Walk-in customer</Typography>
            )}
          </Box>
          <Box sx={{ textAlign: { sm: 'right' } }}>
            <Typography variant="overline" sx={{ color: '#777' }}>
              Place of supply
            </Typography>
            <Typography variant="body2">{stateName(sale.placeOfSupply) || '—'}</Typography>
          </Box>
        </Stack>

        <Box sx={{ overflowX: 'auto', mt: 2.5 }}>
          {/* Phones: the table keeps a readable width and scrolls sideways. */}
          <Table size="small" sx={{ minWidth: { xs: 600, md: 0 }, '& td, & th': { borderColor: '#E6E1D3' } }}>
            <TableHead>
              <TableRow>
                <TableCell>#</TableCell>
                <TableCell>Item</TableCell>
                <TableCell align="right">Net wt</TableCell>
                <TableCell align="right">Rate/g</TableCell>
                <TableCell align="right">Metal</TableCell>
                <TableCell align="right">Making + other</TableCell>
                <TableCell align="right">Taxable</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {sale.items.map((i, n) => {
                const b = i.breakdown;
                return (
                  <TableRow key={String(i.productId)} sx={{ opacity: i.returned ? 0.55 : 1 }}>
                    <TableCell>{n + 1}</TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {i.name}
                        {i.returned ? ' (returned)' : ''}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#666' }}>
                        {[i.sku, purityLabel(i.metal, i.purity), i.huid && `HUID ${i.huid}`, i.hsnCode && `HSN ${i.hsnCode}`, `Gross ${formatWeight(i.grossWeightMg)}`].filter(Boolean).join(' · ')}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {formatWeight(i.netWeightMg)}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {b.ratePerGramPaise != null ? formatINR(b.ratePerGramPaise, { decimals: 0 }) : 'Fixed'}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {formatINR(b.metalPaise + b.wastagePaise)}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                      {formatINR(b.makingPaise + b.stonePaise + b.otherPaise)}
                      {b.discountPaise > 0 && (
                        <Typography variant="caption" sx={{ display: 'block', color: '#2E6B4F' }}>
                          − {formatINR(b.discountPaise)} disc.
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right" sx={{ whiteSpace: 'nowrap', fontWeight: 600 }}>
                      {formatINR(b.taxablePaise)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Box>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={3} sx={{ mt: 2.5, justifyContent: 'space-between' }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="overline" sx={{ color: '#777' }}>
              Amount in words
            </Typography>
            <Typography variant="body2" sx={{ fontStyle: 'italic' }}>
              {rupeesInWords(totals.grandTotalPaise)}
            </Typography>
            <Typography variant="overline" sx={{ color: '#777', display: 'block', mt: 1.5 }}>
              Payment
            </Typography>
            {sale.advanceAdjustedPaise > 0 && (
              <Typography variant="body2">
                Order advance <Amount paise={sale.advanceAdjustedPaise} tone="paid" />
              </Typography>
            )}
            {sale.customerAdvancePaise > 0 && (
              <Typography variant="body2">
                Advance paid earlier <Amount paise={sale.customerAdvancePaise} tone="paid" />
              </Typography>
            )}
            {sale.oldGoldPaise > 0 && (
              <Box sx={{ mb: 0.5 }}>
                <Typography variant="body2">
                  Old gold {sale.oldGold?.docNo} <Amount paise={sale.oldGoldPaise} tone="paid" />
                </Typography>
                {(sale.oldGold?.lines ?? []).map((l, n) => (
                  <Typography key={n} variant="caption" sx={{ display: 'block', color: '#555' }}>
                    {l.description} · {purityLabel(l.metal, l.purity)} · {formatWeight(l.netWeightMg)} net @ {formatINR(l.ratePerGramPaise, { decimals: 0 })}/g
                    {l.deductionBps ? ` less ${l.deductionBps / 100}%` : ''} = {formatINR(l.valuePaise)}
                  </Typography>
                ))}
              </Box>
            )}
            {sale.payments.map((p, n) => (
              <Typography key={n} variant="body2">
                {p.mode === 'credit' ? 'Left due at billing' : paymentLabel(p.mode)} <Amount paise={p.amountPaise} tone={p.mode === 'credit' ? 'due' : 'paid'} />
                {p.reference ? ` · ${p.reference}` : ''}
              </Typography>
            ))}
            {sale.notes && (
              <Typography variant="caption" sx={{ display: 'block', mt: 1.5, color: '#555' }}>
                Note: {sale.notes}
              </Typography>
            )}
          </Box>
          <Box sx={{ width: { sm: 300 } }}>
            {totals.discountPaise > 0 && <Line label={billLabels(totals).discount} value={`− ${formatINR(totals.discountPaise)}`} />}
            <Line label="Taxable value" value={formatINR(totals.taxablePaise)} />
            {sale.interState ? (
              <Line label={billLabels(totals).igst} value={formatINR(totals.igstPaise)} />
            ) : (
              <>
                <Line label={billLabels(totals).cgst} value={formatINR(totals.cgstPaise)} />
                <Line label={billLabels(totals).sgst} value={formatINR(totals.sgstPaise)} />
              </>
            )}
            {totals.roundOffPaise !== 0 && <Line label="Round off" value={formatINR(totals.roundOffPaise)} />}
            <Divider sx={{ my: 1, borderColor: '#E6E1D3' }} />
            <Line label="Invoice total" value={formatINR(totals.grandTotalPaise)} strong />
            {sale.advanceAdjustedPaise > 0 && <Line label="Order advance" value={formatINR(sale.advanceAdjustedPaise)} tone="paid" />}
            {sale.customerAdvancePaise > 0 && <Line label="Advance paid earlier" value={formatINR(sale.customerAdvancePaise)} tone="paid" />}
            {sale.oldGoldPaise > 0 && <Line label="Old gold" value={formatINR(sale.oldGoldPaise)} tone="paid" />}
            <Line label={sale.advanceAdjustedPaise > 0 || sale.customerAdvancePaise > 0 || sale.oldGoldPaise > 0 ? 'Paid now' : 'Paid'} value={formatINR(paidNow)} tone="paid" strong />
            {collectedLater > 0 && <Line label="Collected later" value={formatINR(collectedLater)} tone="paid" />}
            {duePaise > 0 ? (
              <Line label={paidNow > 0 || collectedLater > 0 || sale.advanceAdjustedPaise > 0 || sale.customerAdvancePaise > 0 || sale.oldGoldPaise > 0 ? 'Due (partly paid)' : 'Due'} value={formatINR(duePaise)} tone="due" strong />
            ) : (
              <Line label="Due" value="Fully paid" tone="paid" />
            )}
          </Box>
        </Stack>

        <Divider sx={{ my: 3, borderColor: '#E6E1D3' }} />
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <Typography variant="caption" sx={{ color: '#777', maxWidth: 420 }}>
            Thank you for your purchase. Goods once sold are subject to the store&apos;s exchange and return policy.
          </Typography>
          <Box sx={{ textAlign: 'center' }}>
            <Box sx={{ width: 180, borderTop: '1px solid #999', mb: 0.5, mt: 4 }} />
            <Typography variant="caption">For {seller.name}</Typography>
          </Box>
        </Stack>
      </Card>
      {canPrint && <PrintPreviewDialog open={previewOpen} onClose={() => setPreviewOpen(false)} sale={sale} layout={layout} logo={printLogo} />}
      <CancelDialog sale={sale} open={cancelOpen} onClose={() => setCancelOpen(false)} />
      {customer?.id && <CollectDueDialog open={collectOpen} onClose={() => setCollectOpen(false)} customerId={customer.id} saleId={sale.id} />}
    </>
  );
}
