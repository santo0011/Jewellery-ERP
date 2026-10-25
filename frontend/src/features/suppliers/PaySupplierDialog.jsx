import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, InputAdornment, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { formatINR, toPaise } from '@jerp/shared';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import { useSession } from '../../hooks/usePermission.js';
import { getErrorMessage } from '../../utils/errors.js';
import { PAY_MODES } from '../purchases/purchaseUi.jsx';
import { usePaySupplierMutation } from './supplierApi.js';
import KeepOnPhone from '../../components/KeepOnPhone.jsx';
import { t } from '../../i18n/index.js';

const inr = (p) => formatINR(p, { decimals: 0 });
const paiseOf = (v) => {
  try {
    return v ? toPaise(v) : 0;
  } catch {
    return null;
  }
};

/**
 * Pay a supplier on their account: the old balance is paid off first, then the oldest unpaid bills.
 * `supplier` needs id, companyName, duePaise and openingDuePaise (the old balance still owed).
 */
export default function PaySupplierDialog({ supplier, onClose }) {
  const { data: session } = useSession();
  const activeBranchId = useSelector((s) => s.auth.activeBranchId) ?? session?.branches?.[0]?.id;
  const [pay, { isLoading: saving }] = usePaySupplierMutation();
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState('bank');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const due = supplier?.duePaise ?? 0;
  const oldDue = supplier?.openingDuePaise ?? 0;

  useEffect(() => {
    if (supplier) {
      setAmount(String(due / 100));
      setMode('bank');
      setReference('');
      setNote('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplier?.id]);

  const paise = paiseOf(amount);
  const problem = paise === null ? t('Enter a valid amount') : paise <= 0 ? t('Enter the amount paid') : paise > due ? t('Only {{inr}} is due', { inr: inr(due) }) : null;
  const toOld = Math.min(paise ?? 0, oldDue);
  const toBills = Math.max(0, (paise ?? 0) - toOld);

  const submit = async () => {
    try {
      const done = await pay({ id: supplier.id, branchId: activeBranchId, mode, amountPaise: paise, reference: reference.trim() || null, note: note.trim() || null }).unwrap();
      toast.success((done.duePaiseAfter ? t('{{inr}} paid to {{companyName}} · {{paymentNo}} · {{inr2}} still due', { inr: inr(done.amountPaise), companyName: supplier.companyName, paymentNo: done.paymentNo, inr2: inr(done.duePaiseAfter) }) : t('{{inr}} paid to {{companyName}} · {{paymentNo}} · all clear', { inr: inr(done.amountPaise), companyName: supplier.companyName, paymentNo: done.paymentNo })));
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <Dialog open={Boolean(supplier)} onClose={saving ? undefined : onClose} maxWidth="xs" fullWidth>
      {supplier && (
        <>
          <DialogTitle sx={{ fontWeight: 600 }}>{t('Pay {{companyName}}', { companyName: supplier.companyName })}</DialogTitle>
          <DialogContent>
            <Stack spacing={2} sx={{ pt: 1 }}>
              <Typography variant="body2" color="textSecondary">
                {oldDue > 0
                  ? t('You owe {{amount}} (old balance {{old}} + bills {{bills}}).', { amount: <strong>{inr(due)}</strong>, old: inr(oldDue), bills: inr(due - oldDue) })
                  : t('You owe {{amount}}.', { amount: <strong>{inr(due)}</strong> })}
              </Typography>
              <TextField
                label={t('Amount')}
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
                error={Boolean(problem)}
                helperText={<KeepOnPhone>{problem ?? (oldDue > 0 && toOld > 0 ? (toBills ? t('{{inr}} clears the old balance, {{inr2}} goes to the oldest bills', { inr: inr(toOld), inr2: inr(toBills) }) : t('{{inr}} clears the old balance', { inr: inr(toOld) })) : t('Goes to the oldest unpaid bills first'))}</KeepOnPhone>}
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
              {mode !== 'cash' && <TextField label={t('Reference (optional)')} value={reference} onChange={(e) => setReference(e.target.value)} helperText={t('Cheque / NEFT / UPI ref.')} slotProps={{ htmlInput: { maxLength: 60 } }} />}
              <TextField label={t('Note (optional)')} value={note} onChange={(e) => setNote(e.target.value)} slotProps={{ htmlInput: { maxLength: 200 } }} />
              {!activeBranchId && <Alert severity="warning">{t('Pick a branch first — the money goes out of its cash / bank.')}</Alert>}
            </Stack>
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose} disabled={saving}>
              {t('Cancel')}
            </Button>
            <Button variant="contained" onClick={submit} disabled={Boolean(problem) || !activeBranchId || saving}>
              {t('Pay {{value}}', { value: paise && !problem ? inr(paise) : '' })}
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  );
}
