import AddCardOutlinedIcon from '@mui/icons-material/AddCardOutlined';
import MoreTimeRoundedIcon from '@mui/icons-material/MoreTimeRounded';
import RocketLaunchOutlinedIcon from '@mui/icons-material/RocketLaunchOutlined';
import { Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Grid, InputAdornment, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { toPaise } from '@jerp/shared';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import DataTable from '../../components/DataTable.jsx';
import { formatDate } from '../../utils/format.js';
import { getErrorMessage } from '../../utils/errors.js';
import { inr, SubscriptionChip, UsageBar } from '../billing/billingUi.jsx';
import { paymentColumns } from './PaymentsPage.jsx';
import { useAssignPlanMutation, useOrganisationBillingQuery, usePlansQuery } from './platformApi.js';

const COPY = {
  trial: { title: 'Start a free trial', button: 'Start trial', icon: RocketLaunchOutlinedIcon },
  manual: { title: 'Record a payment', button: 'Record payment', icon: AddCardOutlinedIcon },
  extend: { title: 'Extend the subscription', button: 'Extend', icon: MoreTimeRoundedIcon },
};

function AssignDialog({ orgId, mode, current, onClose }) {
  const { data: plans } = usePlansQuery();
  const [assign, state] = useAssignPlanMutation();
  const [f, setF] = useState({ planId: '', days: '', months: '', amount: '', paymentMode: 'bank', reference: '', note: '' });
  const plan = plans?.find((p) => String(p.id) === String(f.planId));

  useEffect(() => {
    if (!plans?.length) return;
    const start = plans.find((p) => String(p.id) === String(current?.planId)) ?? plans.find((p) => p.isDefault) ?? plans[0];
    setF((x) => ({ ...x, planId: String(start.id), days: mode === 'trial' ? '14' : mode === 'extend' ? '30' : '', months: String(start.durationMonths), amount: String(start.pricePaise / 100) }));
  }, [plans, mode, current?.planId]);

  const pick = (id) => {
    const p = plans.find((x) => String(x.id) === id);
    setF((x) => ({ ...x, planId: id, months: String(p.durationMonths), amount: String(p.pricePaise / 100) }));
  };
  const set = (k, digits) => (e) => setF((x) => ({ ...x, [k]: digits ? e.target.value.replace(/[^\d.]/g, '') : e.target.value }));

  const submit = async () => {
    let amountPaise;
    try {
      amountPaise = toPaise(f.amount || '0');
    } catch {
      toast.error('Enter a valid amount');
      return;
    }
    try {
      await assign({
        id: orgId,
        planId: f.planId,
        mode,
        ...(f.days && mode !== 'manual' && { days: Number(f.days) }),
        ...(mode === 'manual' && { months: Number(f.months), amountPaise, paymentMode: f.paymentMode, reference: f.reference || null }),
        note: f.note || null,
      }).unwrap();
      toast.success(mode === 'trial' ? 'Trial started' : mode === 'manual' ? 'Payment recorded — subscription active' : 'Subscription extended');
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <Dialog open onClose={state.isLoading ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>{COPY[mode].title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField select label="Plan" value={f.planId} onChange={(e) => pick(e.target.value)}>
            {(plans ?? []).map((p) => (
              <MenuItem key={p.id} value={String(p.id)}>
                {p.name} · {p.pricePaise ? `${inr(p.pricePaise)} / ${p.durationMonths} mo` : 'Free'}
                {!p.isActive ? ' (not offered)' : ''}
              </MenuItem>
            ))}
          </TextField>
          {mode !== 'manual' && <TextField label={mode === 'trial' ? 'Trial length' : 'Add'} value={f.days} onChange={set('days', true)} slotProps={{ input: { endAdornment: <InputAdornment position="end">days</InputAdornment> } }} />}
          {mode === 'manual' && (
            <>
              <Grid container spacing={2}>
                <Grid size={6}>
                  <TextField label="Months" value={f.months} onChange={set('months', true)} />
                </Grid>
                <Grid size={6}>
                  <TextField label="Amount received" value={f.amount} onChange={set('amount', true)} slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> } }} />
                </Grid>
                <Grid size={6}>
                  <TextField select label="Paid by" value={f.paymentMode} onChange={set('paymentMode')}>
                    {[['bank', 'Bank transfer'], ['upi', 'UPI'], ['cash', 'Cash'], ['cheque', 'Cheque'], ['other', 'Other']].map(([v, l]) => (
                      <MenuItem key={v} value={v}>
                        {l}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid size={6}>
                  <TextField label="Reference" value={f.reference} onChange={set('reference')} placeholder="UTR / cheque no." />
                </Grid>
              </Grid>
              {plan && (
                <Alert severity="info" icon={false}>
                  {plan.name} for {f.months || plan.durationMonths} month{Number(f.months) === 1 ? '' : 's'} — starts when the current period ends (or today if it has lapsed).
                </Alert>
              )}
            </>
          )}
          <TextField label="Note (optional)" value={f.note} onChange={set('note')} slotProps={{ htmlInput: { maxLength: 200 } }} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={state.isLoading}>
          Cancel
        </Button>
        <Button variant="contained" onClick={submit} disabled={!f.planId || state.isLoading}>
          {COPY[mode].button}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** The organisation's plan, period, usage and payments, with the Super Admin's three actions. */
export default function OrgSubscriptionPanel({ orgId }) {
  const { data } = useOrganisationBillingQuery(orgId);
  const [mode, setMode] = useState(null);
  if (!data) return null;
  const s = data.subscription;

  return (
    <Card>
      <CardContent>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ justifyContent: 'space-between', alignItems: { sm: 'flex-start' }, mb: 2 }}>
          <Box>
            <Typography variant="overline" color="textSecondary">
              Subscription
            </Typography>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Typography variant="h3">{s.planName ?? 'No plan'}</Typography>
              <SubscriptionChip status={s.status} />
            </Stack>
            <Typography variant="body2" color={s.expired ? 'error' : 'textSecondary'} sx={{ mt: 0.5, fontWeight: s.expired ? 600 : 400 }}>
              {s.expired
                ? `Ended ${s.endsAt ? formatDate(s.endsAt) : ''} — the organisation is locked until it renews`
                : s.endsAt
                  ? `${s.status === 'trial' ? 'Trial ends' : 'Paid until'} ${formatDate(s.endsAt)} · ${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'} left`
                  : '—'}
            </Typography>
          </Box>
          <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap' }}>
            {Object.entries(COPY).map(([m, c]) => (
              <Button key={m} size="small" variant={m === 'manual' ? 'contained' : 'outlined'} startIcon={<c.icon />} onClick={() => setMode(m)}>
                {c.button}
              </Button>
            ))}
          </Stack>
        </Stack>
        <Grid container spacing={2} sx={{ mb: 2.5 }}>
          <Grid size={{ xs: 12, md: 4 }}>
            <UsageBar label="Users" used={data.usage.users} limit={s.limits.users} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <UsageBar label="Branches" used={data.usage.branches} limit={s.limits.branches} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <UsageBar label="Products" used={data.usage.products} limit={s.limits.products} />
          </Grid>
        </Grid>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Payments
        </Typography>
        <DataTable columns={paymentColumns({ showOrg: false })} rows={data.payments} empty={{ title: 'No payments yet', description: 'Online payments and the ones you record show here.' }} />
      </CardContent>
      {mode && <AssignDialog orgId={orgId} mode={mode} current={s} onClose={() => setMode(null)} />}
    </Card>
  );
}
