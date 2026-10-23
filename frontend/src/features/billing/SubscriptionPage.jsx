import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import { Alert, Box, Card, CardContent, Chip, CircularProgress, Grid, Stack, Typography } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router';
import DataTable from '../../components/DataTable.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import { usePermission } from '../../hooks/usePermission.js';
import { fonts, tokens } from '../../theme/tokens.js';
import { formatDate } from '../../utils/format.js';
import { getErrorMessage } from '../../utils/errors.js';
import { useCheckoutMutation, useMyBillingQuery, useVerifyPaymentMutation } from './billingApi.js';
import PayDialog from './PayDialog.jsx';
import { inr, methodLabel, PaymentStatusChip, PlanAction, PlanCard, SubscriptionChip, UsageBar } from './billingUi.jsx';
import { t } from '../../i18n/index.js';

function CurrentPlan({ s, usage }) {
  const ends = s.endsAt ? formatDate(s.endsAt) : null;
  return (
    <Card sx={{ mb: 3, overflow: 'hidden', position: 'relative' }}>
      <Box sx={{ position: 'absolute', inset: '0 0 auto 0', height: 4, background: s.expired ? 'linear-gradient(90deg, #E39090, #9B2C2C)' : tokens.sidebar.goldGradient }} />
      <CardContent sx={{ p: { xs: 2.5, md: 3 } }}>
        <Grid container spacing={3} sx={{ alignItems: 'center' }}>
          <Grid size={{ xs: 12, md: 5 }}>
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              <Box sx={{ width: 56, height: 56, borderRadius: 3, display: 'grid', placeItems: 'center', background: s.expired ? undefined : tokens.sidebar.goldGradient, bgcolor: s.expired ? 'rgba(155, 44, 44, 0.12)' : undefined, color: s.expired ? 'error.main' : 'var(--brand-contrast)', flexShrink: 0 }}>
                {s.expired ? <LockOutlinedIcon /> : <WorkspacePremiumOutlinedIcon />}
              </Box>
              <Box>
                <Typography variant="overline" color="textSecondary">
                  {t('Your plan')}
                </Typography>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                  <Typography sx={{ fontFamily: fonts.display, fontSize: 30, fontWeight: 700, lineHeight: 1.1 }}>{s.planName ?? '—'}</Typography>
                  <SubscriptionChip status={s.status} />
                </Stack>
                <Typography variant="body2" sx={{ mt: 0.5, color: s.expired ? 'error.main' : s.daysLeft <= 7 ? 'warning.dark' : 'text.secondary', fontWeight: s.expired || s.daysLeft <= 7 ? 600 : 400 }}>
                  {s.expired ? (ends ? t('Ended on {{ends}} — renew below to unlock the app', { ends }) : t('Ended — renew below to unlock the app')) : (s.status === 'trial' ? (s.daysLeft === 1 ? t('Free trial ends {{ends}} · {{daysLeft}} day left', { ends, daysLeft: s.daysLeft }) : t('Free trial ends {{ends}} · {{daysLeft}} days left', { ends, daysLeft: s.daysLeft })) : (s.daysLeft === 1 ? t('Renews / ends {{ends}} · {{daysLeft}} day left', { ends, daysLeft: s.daysLeft }) : t('Renews / ends {{ends}} · {{daysLeft}} days left', { ends, daysLeft: s.daysLeft })))}
                </Typography>
              </Box>
            </Stack>
          </Grid>
          <Grid size={{ xs: 12, md: 7 }}>
            <Stack spacing={1.5}>
              <UsageBar label={t('Users')} used={usage.users} limit={s.limits.users} />
              <UsageBar label={t('Branches')} used={usage.branches} limit={s.limits.branches} />
              <UsageBar label={t('Products')} used={usage.products} limit={s.limits.products} />
            </Stack>
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}

/** The organisation's subscription: where it stands, plans to buy or renew through Cashfree, and payments. */
export default function SubscriptionPage() {
  const canBuy = usePermission('subscription.manage');
  const { data, isLoading, error, refetch } = useMyBillingQuery();
  const [checkout] = useCheckoutMutation();
  const [verify] = useVerifyPaymentMutation();
  const [params, setParams] = useSearchParams();
  const [busyPlan, setBusyPlan] = useState(null);
  const [paying, setPaying] = useState(null); // plan being paid for in the payment window
  const [checking, setChecking] = useState(false);
  const verified = useRef(null);

  // Back from Cashfree: ask our server (which asks Cashfree) whether it was paid.
  const returnedOrder = params.get('order_id');
  useEffect(() => {
    if (!returnedOrder || verified.current === returnedOrder) return;
    verified.current = returnedOrder;
    setChecking(true);
    verify(returnedOrder)
      .unwrap()
      .then((p) => {
        if (p.status === 'paid') toast.success(t('Payment received — {{name}} is active until {{periodEnd}}', { name: p.plan.name, periodEnd: formatDate(p.periodEnd) }));
        else if (p.status === 'created') toast(t('Payment not completed yet. If money was taken, it will show here within a few minutes.'), { icon: '⏳' });
        else toast.error(t('The payment did not go through. You have not been charged.'));
      })
      .catch((err) => toast.error(getErrorMessage(err)))
      .finally(() => {
        setChecking(false);
        setParams((p) => {
          const n = new URLSearchParams(p);
          n.delete('order_id');
          return n;
        }, { replace: true });
      });
  }, [returnedOrder, verify, setParams]);

  // Paid plans open the payment window (QR, UPI apps, cards…); a free plan is switched on straight away.
  const buy = async (plan) => {
    if (plan.pricePaise > 0) {
      setPaying(plan);
      return;
    }
    setBusyPlan(plan.id);
    try {
      await checkout({ planId: plan.id }).unwrap();
      toast.success(t('{{name}} is now active', { name: plan.name }));
      refetch();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusyPlan(null);
    }
  };

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const s = data.subscription;

  return (
    <>
      <PageHeader title={t('Subscription')} subtitle={t('Your plan, what you use, and payments.')} />
      {checking && (
        <Alert severity="info" icon={<CircularProgress size={18} />} sx={{ mb: 2 }}>
          {t('Confirming your payment with Cashfree…')}
        </Alert>
      )}
      <CurrentPlan s={s} usage={data.usage} />

      <Stack direction="row" sx={{ alignItems: 'baseline', justifyContent: 'space-between', mb: 1.5, gap: 1, flexWrap: 'wrap' }}>
        <Typography variant="h3">{s.expired ? t('Choose a plan to continue') : t('Plans')}</Typography>
        {data.gateway.enabled && (
          <Chip size="small" label={data.gateway.mode === 'sandbox' ? t('Test mode — no real money') : t('Secure payment by Cashfree')} color={data.gateway.mode === 'sandbox' ? 'warning' : 'success'} variant="outlined" />
        )}
      </Stack>
      {!data.gateway.enabled && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          {t('Online payment is not set up yet. Please contact the platform administrator to renew.')}
        </Alert>
      )}
      <Grid container spacing={2.5} sx={{ mb: 4 }}>
        {data.plans.map((p) => {
          const current = String(p.id) === String(s.planId) && !s.expired && s.status === 'active';
          const label = p.pricePaise === 0 ? t('Switch to this plan') : String(p.id) === String(s.planId) ? t('Renew · Pay {{inr}}', { inr: inr(p.pricePaise) }) : t('Pay {{inr}}', { inr: inr(p.pricePaise) });
          return (
            <Grid key={p.id} size={{ xs: 12, sm: 6, lg: 4 }}>
              <PlanCard
                plan={p}
                current={current}
                action={
                  canBuy ? (
                    <PlanAction onClick={() => buy(p)} disabled={Boolean(busyPlan) || (!data.gateway.enabled && p.pricePaise > 0)} variant={p.isPopular || current ? 'contained' : 'outlined'}>
                      {busyPlan === p.id ? t('Opening payment…') : label}
                    </PlanAction>
                  ) : (
                    <Typography variant="caption" color="textSecondary">
                      {t('Ask the owner to change the plan')}
                    </Typography>
                  )
                }
              />
            </Grid>
          );
        })}
      </Grid>

      {paying && <PayDialog plan={paying} mode={data.gateway.mode} onClose={() => setPaying(null)} onPaid={() => refetch()} />}

      <Typography variant="h3" sx={{ mb: 1.5 }}>
        {t('Payment history')}
      </Typography>
      <DataTable
        columns={[
          {
            key: 'date',
            label: t('Date'),
            render: (p) => (
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {formatDate(p.paidAt ?? p.createdAt)}
                </Typography>
                <Typography variant="caption" color="textSecondary">
                  {p.orderId}
                </Typography>
              </Box>
            ),
          },
          { key: 'plan', label: t('Plan'), render: (p) => (p.months === 1 ? t('{{name}} · {{months}} month', { name: p.plan.name, months: p.months }) : t('{{name}} · {{months}} months', { name: p.plan.name, months: p.months })) },
          { key: 'period', label: t('Covers'), render: (p) => (p.periodStart ? `${formatDate(p.periodStart)} – ${formatDate(p.periodEnd)}` : '—') },
          { key: 'method', label: t('Paid by'), render: (p) => (p.source === 'manual' ? t('{{methodLabel}} (recorded)', { methodLabel: methodLabel(p.paymentMethod) }) : methodLabel(p.paymentMethod)) },
          { key: 'amount', label: t('Amount'), align: 'right', render: (p) => <Typography variant="body2" sx={{ fontWeight: 700 }}>{inr(p.amountPaise)}</Typography> },
          { key: 'status', label: t('Status'), render: (p) => <PaymentStatusChip status={p.status} /> },
        ]}
        rows={data.payments}
        empty={{ title: t('No payments yet'), description: t('Your subscription payments will show here.') }}
      />
    </>
  );
}
