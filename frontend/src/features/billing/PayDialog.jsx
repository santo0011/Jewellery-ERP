import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import AlternateEmailRoundedIcon from '@mui/icons-material/AlternateEmailRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import CreditCardOutlinedIcon from '@mui/icons-material/CreditCardOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded';
import PhoneIphoneRoundedIcon from '@mui/icons-material/PhoneIphoneRounded';
import QrCode2RoundedIcon from '@mui/icons-material/QrCode2Rounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import ScheduleRoundedIcon from '@mui/icons-material/ScheduleRounded';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogContent, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Skeleton, Stack, TextField, Typography, useMediaQuery,
} from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';
import { tokens } from '../../theme/tokens.js';
import { formatDate } from '../../utils/format.js';
import { getErrorMessage } from '../../utils/errors.js';
import { useCheckoutMutation, useStartUpiMutation, useVerifyPaymentMutation } from './billingApi.js';
import { inr, periodText } from './billingUi.jsx';
import { openCashfreeCheckout } from './cashfreeSdk.js';

/** Every way to pay. UPI ones run on this screen; the rest open Cashfree's secure page showing only that kind. */
const METHODS = [
  { key: 'qr', upi: true, icon: QrCode2RoundedIcon, title: 'Scan QR code', sub: 'Scan with your phone — any UPI app' },
  { key: 'apps', upi: true, icon: PhoneIphoneRoundedIcon, title: 'UPI apps', sub: 'PhonePe, Google Pay, Paytm, BHIM' },
  { key: 'upi_id', upi: true, icon: AlternateEmailRoundedIcon, title: 'UPI ID', sub: 'Get a payment request in your app' },
  { key: 'cards', icon: CreditCardOutlinedIcon, title: 'Debit / Credit card', sub: 'Visa, Mastercard, RuPay, Amex' },
  { key: 'netbanking', icon: AccountBalanceOutlinedIcon, title: 'Net banking', sub: 'All major banks' },
  { key: 'wallets', icon: AccountBalanceWalletOutlinedIcon, title: 'Wallets', sub: 'PhonePe, Paytm, Amazon Pay & more' },
  { key: 'paylater', icon: ScheduleRoundedIcon, title: 'Pay later & EMI', sub: 'Pay later apps and card EMI' },
];

const APPS = [
  { key: 'phonepe', label: 'PhonePe', color: '#5F259F' },
  { key: 'gpay', label: 'Google Pay', color: '#1A73E8' },
  { key: 'paytm', label: 'Paytm', color: '#00B9F1' },
  { key: 'bhim', label: 'BHIM', color: '#F37021' },
  { key: 'other', label: 'Other UPI app', color: '#4A4A4A' },
];

const HOSTED_COPY = {
  cards: 'Enter your card on Cashfree’s secure page. Your card details are never sent to or stored by us.',
  netbanking: 'Pick your bank on Cashfree’s secure page and sign in to your net banking to approve.',
  wallets: 'Pick your wallet on Cashfree’s secure page and approve the payment there.',
  paylater: 'Choose a pay-later app or EMI option on Cashfree’s secure page.',
};

function Waiting({ attempt }) {
  return (
    <Stack spacing={1} sx={{ alignItems: 'center', mt: 2 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <CircularProgress size={16} />
        <Typography variant="body2" color="textSecondary">
          Waiting for payment… this screen updates by itself
        </Typography>
      </Stack>
      {attempt?.status === 'FAILED' && (
        <Alert severity="warning" sx={{ width: '100%' }}>
          The last try did not go through{attempt.message ? ` (${attempt.message})` : ''}. You can try again.
        </Alert>
      )}
    </Stack>
  );
}

/**
 * Pay for a plan. `plan` is the plan being bought; `mode` is 'sandbox' or 'production'.
 * UPI (QR / apps / UPI ID) is paid here and confirmed by polling; other methods go to Cashfree and come back.
 */
export default function PayDialog({ plan, mode, onClose, onPaid }) {
  const phone = useMediaQuery((t) => t.breakpoints.down('md'));
  const [method, setMethod] = useState(phone ? 'apps' : 'qr');
  const [checkout] = useCheckoutMutation();
  const [startUpi] = useStartUpiMutation();
  const [verify] = useVerifyPaymentMutation();
  const [order, setOrder] = useState(null); // the UPI checkout, made once and reused for QR / apps / UPI ID
  const [view, setView] = useState({}); // per method: { qrcode } | { links } | { sentTo }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [upiId, setUpiId] = useState('');
  const [attempt, setAttempt] = useState(null);
  const [paid, setPaid] = useState(null);
  const sandbox = mode !== 'production';
  const current = METHODS.find((m) => m.key === method);
  const creating = useRef(null);

  const upiOrder = useCallback(async () => {
    if (order) return order;
    creating.current ??= checkout({ planId: plan.id, methods: 'upi' }).unwrap();
    const res = await creating.current;
    setOrder(res);
    return res;
  }, [order, checkout, plan.id]);

  const runUpi = useCallback(
    async (key, extra = {}) => {
      setBusy(true);
      setError(null);
      try {
        const o = await upiOrder();
        const res = await startUpi({ orderId: o.orderId, method: key, ...extra }).unwrap();
        setView((v) => ({ ...v, [key]: res }));
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [upiOrder, startUpi],
  );

  // QR and app links are fetched as soon as their tab opens; UPI ID waits for the ID.
  useEffect(() => {
    if (paid || !current?.upi || method === 'upi_id' || view[method]) return;
    runUpi(method);
  }, [method, current, view, paid, runUpi]);

  // While a UPI checkout is open, ask the server (which asks Cashfree) every few seconds whether it is paid.
  useEffect(() => {
    if (!order || paid) return undefined;
    let stop = false;
    const tick = async () => {
      try {
        const p = await verify(order.orderId).unwrap();
        if (stop) return;
        if (p.status === 'paid') {
          setPaid(p);
          onPaid?.(p);
        } else setAttempt(p.attempt);
      } catch {
        /* keep trying quietly */
      }
    };
    const id = setInterval(tick, 3500);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [order, paid, verify, onPaid]);

  const hosted = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await checkout({ planId: plan.id, methods: method }).unwrap();
      await openCashfreeCheckout({ paymentSessionId: res.paymentSessionId, mode: res.mode });
    } catch (err) {
      setError(err?.message && !err?.data ? err.message : getErrorMessage(err));
      setBusy(false);
    }
  };

  const panel = () => {
    if (paid) {
      return (
        <Stack spacing={1.5} sx={{ alignItems: 'center', textAlign: 'center', py: 4 }}>
          <CheckCircleRoundedIcon sx={{ fontSize: 72, color: 'success.main' }} />
          <Typography variant="h3">Payment received</Typography>
          <Typography color="textSecondary">
            {paid.plan.name} is active until <strong>{formatDate(paid.periodEnd)}</strong>.
          </Typography>
          <Button variant="contained" onClick={onClose} sx={{ mt: 1 }}>
            Done
          </Button>
        </Stack>
      );
    }
    if (method === 'qr') {
      const qr = view.qr?.qrcode;
      return (
        <Stack sx={{ alignItems: 'center', textAlign: 'center' }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Scan to pay {inr(plan.pricePaise)}
          </Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
            Open PhonePe, Google Pay, Paytm, BHIM or any UPI app on your phone and scan
          </Typography>
          <Box sx={{ p: 1.5, borderRadius: 3, border: '2px solid', borderColor: tokens.light.gold, bgcolor: '#fff', lineHeight: 0 }}>
            {qr ? <Box component="img" src={qr} alt="UPI QR code" sx={{ width: 220, height: 220, imageRendering: 'pixelated' }} /> : <Skeleton variant="rectangular" width={220} height={220} />}
          </Box>
          <Stack direction="row" sx={{ gap: 0.75, mt: 1.5, flexWrap: 'wrap', justifyContent: 'center' }}>
            {APPS.slice(0, 4).map((a) => (
              <Chip key={a.key} size="small" label={a.label} sx={{ bgcolor: `${a.color}14`, color: a.color, fontWeight: 700 }} />
            ))}
          </Stack>
          <Button size="small" startIcon={<RefreshRoundedIcon />} onClick={() => runUpi('qr')} disabled={busy} sx={{ mt: 1 }}>
            New QR code
          </Button>
          {order && <Waiting attempt={attempt} />}
        </Stack>
      );
    }
    if (method === 'apps') {
      const links = view.apps?.links;
      return (
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Pay {inr(plan.pricePaise)} with a UPI app
          </Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
            {phone ? 'Tap your app — it opens with the amount filled in. Approve with your UPI PIN, then come back here.' : 'These open the app on a phone. On a laptop, scanning the QR code is easier.'}
          </Typography>
          <Stack spacing={1}>
            {APPS.map((a) => (
              <Button
                key={a.key}
                fullWidth
                size="large"
                variant="outlined"
                disabled={!links?.[a.key]}
                href={links?.[a.key] ?? undefined}
                target={sandbox ? '_blank' : undefined}
                rel="noreferrer"
                endIcon={<OpenInNewRoundedIcon fontSize="small" />}
                sx={{ justifyContent: 'space-between', borderColor: 'divider', color: 'text.primary', fontWeight: 700, '&:hover': { borderColor: a.color, bgcolor: `${a.color}0D` } }}
              >
                <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                  <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: a.color }} />
                  <span>{a.label}</span>
                </Stack>
              </Button>
            ))}
          </Stack>
          {!links && busy && <Skeleton height={40} />}
          {order && <Waiting attempt={attempt} />}
        </Box>
      );
    }
    if (method === 'upi_id') {
      const sent = view.upi_id?.sentTo;
      return (
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Get a request in your UPI app
          </Typography>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
            We send a {inr(plan.pricePaise)} request to your UPI ID. Open the app and approve it with your PIN.
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <TextField label="UPI ID" placeholder="name@okhdfcbank" value={upiId} onChange={(e) => setUpiId(e.target.value.trim())} slotProps={{ htmlInput: { autoCapitalize: 'none', spellCheck: false } }} />
            <Button variant="contained" onClick={() => runUpi('upi_id', { upiId })} disabled={busy || !/^[^@\s]+@[^@\s]+$/.test(upiId)} sx={{ flexShrink: 0, height: 56 }}>
              {sent ? 'Send again' : 'Send request'}
            </Button>
          </Stack>
          {sent && (
            <Alert severity="info" sx={{ mt: 2 }}>
              Request sent to <strong>{sent}</strong>. Approve it in your UPI app within a few minutes.
            </Alert>
          )}
          {sent && <Waiting attempt={attempt} />}
        </Box>
      );
    }
    return (
      <Stack spacing={2}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            {current.title}
          </Typography>
          <Typography variant="body2" color="textSecondary">
            {HOSTED_COPY[method]}
          </Typography>
        </Box>
        <Box sx={{ p: 2, borderRadius: 2, bgcolor: 'action.hover', display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <LockOutlinedIcon color="success" />
          <Typography variant="body2">You will come back here automatically once it is done.</Typography>
        </Box>
        <Button variant="contained" size="large" onClick={hosted} disabled={busy} endIcon={busy ? <CircularProgress size={16} color="inherit" /> : <OpenInNewRoundedIcon />}>
          Continue to pay {inr(plan.pricePaise)}
        </Button>
      </Stack>
    );
  };

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth fullScreen={phone}>
      <Box sx={{ px: 3, py: 2, display: 'flex', alignItems: 'center', gap: 2, borderBottom: 1, borderColor: 'divider', background: `linear-gradient(120deg, rgba(201, 162, 39, 0.10), transparent 60%)` }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="overline" color="textSecondary">
            {plan.name} · {periodText(plan.durationMonths)}
          </Typography>
          <Typography sx={{ fontSize: '1.6rem', fontWeight: 800, lineHeight: 1.1 }}>{inr(plan.pricePaise)}</Typography>
        </Box>
        <Chip icon={<LockOutlinedIcon />} label="Secured by Cashfree" size="small" variant="outlined" color="success" />
        <IconButton onClick={onClose} aria-label="Close">
          <CloseRoundedIcon />
        </IconButton>
      </Box>
      <DialogContent sx={{ p: 0 }}>
        <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, minHeight: { md: 460 } }}>
          {!paid && (
            <List sx={{ width: { md: 280 }, flexShrink: 0, borderRight: { md: 1 }, borderBottom: { xs: 1, md: 0 }, borderColor: 'divider', py: 1, display: { xs: 'flex', md: 'block' }, overflowX: { xs: 'auto', md: 'visible' } }}>
              {METHODS.map((m) => (
                <ListItemButton
                  key={m.key}
                  selected={method === m.key}
                  onClick={() => {
                    setMethod(m.key);
                    setError(null);
                  }}
                  sx={{ mx: 1, borderRadius: 2, flexShrink: 0, '&.Mui-selected': { bgcolor: 'rgba(201, 162, 39, 0.14)', '& .MuiListItemIcon-root': { color: tokens.light.goldDark } } }}
                >
                  <ListItemIcon sx={{ minWidth: 36 }}>
                    <m.icon />
                  </ListItemIcon>
                  <ListItemText primary={m.title} secondary={m.sub} slotProps={{ primary: { sx: { fontWeight: 700, fontSize: '0.875rem', whiteSpace: 'nowrap' } }, secondary: { sx: { fontSize: '0.75rem', display: { xs: 'none', md: 'block' } } } }} />
                </ListItemButton>
              ))}
            </List>
          )}
          <Box sx={{ flex: 1, p: { xs: 2.5, md: 3.5 }, minWidth: 0 }}>
            {error && (
              <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
                {error}
              </Alert>
            )}
            {panel()}
            {sandbox && !paid && (
              <Alert severity="warning" icon={false} sx={{ mt: 3, fontSize: '0.8125rem' }}>
                <strong>Test mode — no real money.</strong> A real UPI app cannot pay a test QR. To try a payment, use <em>UPI apps</em> — it opens Cashfree’s test page where you can mark the payment as successful — or a card / net banking test option.
              </Alert>
            )}
          </Box>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
