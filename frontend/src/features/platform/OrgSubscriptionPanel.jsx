import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import { Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Grid, InputAdornment, Link, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import DataTable from '../../components/DataTable.jsx';
import { formatDate } from '../../utils/format.js';
import { getErrorMessage } from '../../utils/errors.js';
import { inr, SubscriptionChip, UsageBar } from '../billing/billingUi.jsx';
import { paymentColumns } from './PaymentsPage.jsx';
import { useAssignPlanMutation, useOrganisationBillingQuery, usePlansQuery } from './platformApi.js';

// How the plan was paid. "Free" activates it complimentary (no amount).
const PAID_BY = [
  ['bank', 'Bank transfer'],
  ['upi', 'UPI'],
  ['cash', 'Cash'],
  ['cheque', 'Cheque'],
  ['free', 'Free (complimentary)'],
];

/**
 * Activate a plan in one step: the plan (its price and length come with it) and how it was paid. Rarely needed
 * trials and extra days sit behind a link. Every activation is kept in the records with how it happened.
 */
function ActivatePlanDialog({ orgId, current, onClose }) {
  const { data: plans } = usePlansQuery();
  const [assign, state] = useAssignPlanMutation();
  const [planId, setPlanId] = useState('');
  const [paidBy, setPaidBy] = useState('bank');
  const [reference, setReference] = useState('');
  const [other, setOther] = useState(null); // null, or 'trial' / 'extend' when chosen from "Other options"
  const [days, setDays] = useState('14');
  const plan = plans?.find((p) => String(p.id) === String(planId));

  useEffect(() => {
    if (!plans?.length || planId) return;
    const start = plans.find((p) => String(p.id) === String(current?.planId)) ?? plans.find((p) => p.isDefault) ?? plans[0];
    setPlanId(String(start.id));
  }, [plans, current?.planId, planId]);

  const free = paidBy === 'free' || !plan?.pricePaise;
  const n = Number(days) || 0;
  const summary = !plan
    ? ''
    : other === 'trial'
      ? `${n}-day free trial of ${plan.name}, from today`
      : other === 'extend'
        ? `${n} more day${n === 1 ? '' : 's'} on the current ${current?.status === 'trial' ? 'trial' : 'plan'}`
        : `${plan.name} · ${plan.durationMonths} month${plan.durationMonths === 1 ? '' : 's'} · ${free ? 'Free' : inr(plan.pricePaise)}`;

  const submit = async () => {
    if (other && !n) {
      toast.error('Enter the number of days');
      return;
    }
    try {
      await assign({
        id: orgId,
        planId,
        ...(other
          ? { mode: other, days: n }
          : free
            ? { mode: 'complimentary', months: plan.durationMonths }
            : { mode: 'manual', months: plan.durationMonths, amountPaise: plan.pricePaise, paymentMode: paidBy, reference: reference.trim() || null }),
      }).unwrap();
      toast.success(other === 'trial' ? 'Free trial started' : other === 'extend' ? 'Subscription extended' : `${plan.name} activated`);
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <Dialog open onClose={state.isLoading ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>{other === 'trial' ? 'Start a free trial' : other === 'extend' ? 'Add days' : 'Activate plan'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField select label="Plan" value={planId} onChange={(e) => setPlanId(e.target.value)}>
            {(plans ?? []).map((p) => (
              <MenuItem key={p.id} value={String(p.id)}>
                {p.name} · {p.pricePaise ? `${inr(p.pricePaise)} / ${p.durationMonths} mo` : 'Free'}
              </MenuItem>
            ))}
          </TextField>

          {other ? (
            <TextField label={other === 'trial' ? 'Trial days' : 'Days to add'} value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ''))} slotProps={{ input: { endAdornment: <InputAdornment position="end">days</InputAdornment> } }} />
          ) : (
            <>
              <TextField select label="Paid by" value={paidBy} onChange={(e) => setPaidBy(e.target.value)}>
                {PAID_BY.map(([v, l]) => (
                  <MenuItem key={v} value={v}>
                    {l}
                  </MenuItem>
                ))}
              </TextField>
              {!free && <TextField label="Reference (optional)" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UTR / cheque / receipt no." />}
            </>
          )}

          {summary && (
            <Box sx={{ px: 1.5, py: 1.25, borderRadius: 2, bgcolor: 'rgba(var(--brand-rgb), 0.08)' }}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {summary}
              </Typography>
            </Box>
          )}

          <Typography variant="caption" color="textSecondary" sx={{ textAlign: 'center' }}>
            {other ? (
              <Link component="button" type="button" variant="caption" onClick={() => setOther(null)}>
                Back to activate plan
              </Link>
            ) : (
              <>
                Need a{' '}
                <Link
                  component="button"
                  type="button"
                  variant="caption"
                  onClick={() => {
                    setOther('trial');
                    setDays('14');
                  }}
                >
                  free trial
                </Link>{' '}
                or{' '}
                <Link
                  component="button"
                  type="button"
                  variant="caption"
                  onClick={() => {
                    setOther('extend');
                    setDays('30');
                  }}
                >
                  extra days
                </Link>{' '}
                instead?
              </>
            )}
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button color="secondary" onClick={onClose} disabled={state.isLoading}>
          Cancel
        </Button>
        <Button variant="contained" onClick={submit} disabled={!plan} loading={state.isLoading}>
          {other === 'trial' ? 'Start trial' : other === 'extend' ? 'Add days' : 'Activate'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Every activation of the organisation's plan — online payments, recorded payments, complimentary, trials, extensions. */
export function OrgPaymentsTable({ orgId }) {
  const { data, isLoading, error, refetch } = useOrganisationBillingQuery(orgId);
  return (
    <DataTable
      columns={paymentColumns({ showOrg: false })}
      rows={data?.payments}
      loading={isLoading}
      error={error}
      onRetry={refetch}
      empty={{ title: 'Nothing yet', description: 'Every activation shows here — online payments, payments you record, complimentary plans, trials and extensions.' }}
    />
  );
}

/** The organisation's plan, period and usage, with the Super Admin's "Activate plan" (records are on their own tab). */
export default function OrgSubscriptionPanel({ orgId }) {
  const { data } = useOrganisationBillingQuery(orgId);
  const [activating, setActivating] = useState(false);
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
          <Button variant="contained" startIcon={<VerifiedOutlinedIcon />} onClick={() => setActivating(true)} sx={{ flexShrink: 0 }}>
            Activate plan
          </Button>
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
      </CardContent>
      {activating && <ActivatePlanDialog orgId={orgId} current={s} onClose={() => setActivating(false)} />}
    </Card>
  );
}
