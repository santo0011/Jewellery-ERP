import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, InputAdornment, Stack, TextField, Typography } from '@mui/material';
import { formatINR, toPaise } from '@jerp/shared';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import Amount from '../../components/Amount.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import { useSession } from '../../hooks/usePermission.js';
import { getErrorMessage } from '../../utils/errors.js';
import { formatDate } from '../../utils/format.js';
import { ADVANCE_MODE_OPTIONS } from '../orders/orderUi.jsx';
import { useCollectDueMutation, useCustomerDuesQuery } from './customerApi.js';
import KeepOnPhone from '../../components/KeepOnPhone.jsx';

const rupees = (paise) => String(paise / 100);
const paiseOf = (v) => {
  try {
    return v ? toPaise(v) : 0;
  } catch {
    return null;
  }
};

/**
 * Collect a payment later against what the customer owes (bills left partly paid and old due).
 * With `saleId` the payment goes to that bill first; anything more goes to the old due, then the oldest bills.
 */
export default function CollectDueDialog({ open, onClose, customerId, saleId = null }) {
  const { data: session } = useSession();
  const activeBranchId = useSelector((s) => s.auth.activeBranchId) ?? session.branches[0]?.id;
  const { data: dues, isLoading, error, refetch } = useCustomerDuesQuery(customerId, { skip: !open || !customerId });
  const [collect, { isLoading: saving }] = useCollectDueMutation();
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('cash');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');

  const forBill = saleId ? dues?.bills.find((b) => String(b.saleId) === String(saleId)) : null;
  useEffect(() => {
    if (open && dues) {
      setAmount(rupees(forBill?.duePaise ?? dues.totalDuePaise));
      setMode('cash');
      setReference('');
      setNote('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dues?.totalDuePaise, forBill?.duePaise]);

  const paise = paiseOf(amount);
  const total = dues?.totalDuePaise ?? 0;
  const problem = paise === null ? 'Enter a valid amount' : paise <= 0 ? 'Enter the amount received' : paise > total ? `Only ${formatINR(total)} is due` : null;

  const submit = async () => {
    try {
      const receipt = await collect({ customerId, branchId: activeBranchId, mode, amountPaise: paise, reference: reference || null, note: note || null, saleId: forBill ? saleId : null }).unwrap();
      toast.success(`${formatINR(receipt.amountPaise)} received · receipt ${receipt.receiptNo}${receipt.duePaiseAfter ? ` · ${formatINR(receipt.duePaiseAfter)} still due` : ' · all dues cleared'}`);
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 600 }}>Collect payment{dues ? ` · ${dues.customer.name}` : ''}</DialogTitle>
      <DialogContent>
        {isLoading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : !total ? (
          <Alert severity="success">Nothing is due. All bills are fully paid.</Alert>
        ) : (
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            {/* What is owed: old due and each bill with money still due. */}
            <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: 'action.hover' }}>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', mb: 0.75 }}>
                <Typography variant="overline" color="textSecondary">
                  Total due
                </Typography>
                <Amount paise={total} tone="due" sx={{ fontSize: '1.25rem', fontWeight: 800 }} />
              </Stack>
              <Stack spacing={0.5}>
                {dues.openingDuePaise > 0 && <DueRow label="Old due" value={dues.openingDuePaise} />}
                {dues.bills.map((b) => (
                  <DueRow key={b.saleId} label={`${b.invoiceNo} · ${formatDate(b.businessDate)}`} value={b.duePaise} highlight={forBill && String(b.saleId) === String(saleId)} />
                ))}
              </Stack>
            </Box>

            <Box>
              <TextField
                label="Amount received"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                error={Boolean(amount) && Boolean(problem)}
                helperText={<KeepOnPhone>{problem ?? (paise < total ? `${formatINR(total - paise)} will still be due` : 'Clears all dues')}</KeepOnPhone>}
                slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> }, htmlInput: { inputMode: 'decimal' } }}
                autoFocus
              />
              <Stack direction="row" sx={{ gap: 0.75, mt: 1, flexWrap: 'wrap' }}>
                {forBill && forBill.duePaise !== total && <Chip size="small" variant="outlined" label={`This bill ${formatINR(forBill.duePaise, { decimals: 0 })}`} onClick={() => setAmount(rupees(forBill.duePaise))} />}
                <Chip size="small" variant="outlined" label={`Full due ${formatINR(total, { decimals: 0 })}`} onClick={() => setAmount(rupees(total))} />
              </Stack>
            </Box>

            <Stack direction="row" sx={{ gap: 0.5 }}>
              {ADVANCE_MODE_OPTIONS.map((m) => (
                <Chip
                  key={m.value}
                  label={m.value === 'bank' ? 'Bank' : m.label}
                  title={m.label}
                  onClick={() => setMode(m.value)}
                  color={mode === m.value ? 'primary' : 'default'}
                  variant={mode === m.value ? 'filled' : 'outlined'}
                  sx={{ flex: '1 1 0', minWidth: 0, fontWeight: 600 }}
                />
              ))}
            </Stack>
            {mode !== 'cash' && <TextField label="Reference (card / UPI / UTR no.)" value={reference} onChange={(e) => setReference(e.target.value)} />}
            <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
            <Divider />
            <Typography variant="caption" color="textSecondary">
              {forBill ? `Goes to ${forBill.invoiceNo} first; anything more clears the old due, then the oldest bills.` : 'Clears the old due first, then the oldest bills.'}
            </Typography>
          </Stack>
        )}
      </DialogContent>
      {/* Phones: Save full width on top (one line, easy to tap), Cancel under it. */}
      <DialogActions
        sx={{
          px: 3,
          pb: 2,
          '@media (max-width:599.95px)': { flexDirection: 'column-reverse', alignItems: 'stretch', gap: 1, '& > .MuiButton-root': { flex: 'none', width: '100%', ml: '0 !important' } },
        }}
      >
        <Button color="secondary" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        {total > 0 && (
          <Button variant="contained" onClick={submit} loading={saving} disabled={Boolean(problem)} sx={{ whiteSpace: 'nowrap', minHeight: { xs: 48, sm: 40 }, px: 2.5, fontSize: { xs: '0.9375rem', sm: '0.875rem' } }}>
            Save receipt {paise > 0 && !problem ? `· ${formatINR(paise, { decimals: 0 })}` : ''}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}

function DueRow({ label, value, highlight }) {
  return (
    <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1 }}>
      <Typography variant="body2" color={highlight ? 'textPrimary' : 'textSecondary'} sx={{ fontWeight: highlight ? 700 : 400 }} noWrap>
        {label}
        {highlight ? ' (this bill)' : ''}
      </Typography>
      <Amount paise={value} tone="due" variant="body2" sx={{ fontWeight: 600, flexShrink: 0 }} />
    </Stack>
  );
}
