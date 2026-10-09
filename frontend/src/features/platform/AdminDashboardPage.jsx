import ApartmentOutlinedIcon from '@mui/icons-material/ApartmentOutlined';
import EventBusyOutlinedIcon from '@mui/icons-material/EventBusyOutlined';
import HourglassTopRoundedIcon from '@mui/icons-material/HourglassTopRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import { Box, Card, CardContent, Divider, Grid, Link, Stack, Typography } from '@mui/material';
import { Link as RouterLink, useNavigate } from 'react-router';
import PageHeader from '../../components/PageHeader.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import SummaryCards, { SummaryCard } from '../../components/SummaryCards.jsx';
import { formatDate } from '../../utils/format.js';
import { inr, PaymentStatusChip, SubscriptionChip } from '../billing/billingUi.jsx';
import { ColumnChart, compactINR } from '../home/charts.jsx';
import { DonutChart } from '../home/shareCharts.jsx';
import { useBillingDashboardQuery, usePlatformDashboardQuery } from './platformApi.js';

function Panel({ title, subtitle, action, children }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, gap: 1 }}>
          <Box>
            <Typography variant="h5">{title}</Typography>
            {subtitle && (
              <Typography variant="caption" color="textSecondary">
                {subtitle}
              </Typography>
            )}
          </Box>
          {action}
        </Stack>
        {children}
      </CardContent>
    </Card>
  );
}

const monthName = (key) => new Date(`${key}-01T00:00:00`).toLocaleString('en-IN', { month: 'short' });

/** The platform at a glance: money in, how subscriptions stand, who is about to lapse, latest payments. */
export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const { data: platform, isLoading: l1, error: e1, refetch: r1 } = usePlatformDashboardQuery();
  const { data: billing, isLoading: l2, error: e2, refetch: r2 } = useBillingDashboardQuery();
  if (l1 || l2) return <LoadingState />;
  if (e1 || e2) return <ErrorState error={e1 ?? e2} onRetry={() => (r1(), r2())} />;
  const subs = billing.subscriptions;

  return (
    <>
      <PageHeader title="Platform overview" subtitle="Organisations, subscriptions and revenue." />
      <SummaryCards>
        <SummaryCard icon={TrendingUpRoundedIcon} label="Revenue this month" value={inr(billing.revenue.monthPaise)} caption={`All time ${compactINR(billing.revenue.totalPaise)}`} tone="green" valueTone="paid" onClick={() => navigate('/admin/payments')} />
        <SummaryCard icon={VerifiedOutlinedIcon} label="Paid subscriptions" value={subs.active} caption="Active and paid up" tone="blue" />
        <SummaryCard icon={HourglassTopRoundedIcon} label="On free trial" value={subs.trial} caption="Can become paying customers" tone="amber" />
        <SummaryCard icon={EventBusyOutlinedIcon} label="Expired" value={subs.expired} caption={subs.expired ? 'Locked until they renew' : 'None lapsed'} tone={subs.expired ? 'red' : 'green'} valueTone={subs.expired ? 'due' : undefined} />
      </SummaryCards>

      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Panel title="Revenue" subtitle="Subscription payments received · last 6 months" action={<Link component={RouterLink} to="/admin/payments" variant="caption" sx={{ fontWeight: 600 }}>All payments</Link>}>
            <ColumnChart data={billing.revenue.months.map((m) => ({ key: m.key, label: monthName(m.key), value: m.totalPaise, detail: `${m.count} payment${m.count === 1 ? '' : 's'}` }))} emptyLabel="No payments yet" />
          </Panel>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Panel title="Subscriptions" subtitle="Where every organisation stands">
            <DonutChart
              rows={[
                { key: 'active', label: 'Paid', value: subs.active },
                { key: 'trial', label: 'Free trial', value: subs.trial },
                { key: 'expired', label: 'Expired', value: subs.expired },
              ]}
              formatValue={(v) => String(v)}
              centerLabel="Organisations"
              empty="No organisations yet"
            />
          </Panel>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Panel title="Ending within 7 days" subtitle="Trials and paid periods about to lapse">
            {billing.expiring.length === 0 ? (
              <Typography variant="body2" color="textSecondary" sx={{ py: 3, textAlign: 'center' }}>
                Nothing ends this week
              </Typography>
            ) : (
              <Stack divider={<Divider flexItem />} spacing={1.25}>
                {billing.expiring.map((x) => (
                  <Stack key={String(x.organisationId)} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Link component={RouterLink} to={`/admin/organisations/${x.organisationId}`} underline="hover" sx={{ fontWeight: 600, color: 'text.primary' }}>
                        {x.name}
                      </Link>
                      <Typography variant="caption" color="textSecondary" component="div">
                        {x.planName} · ends {formatDate(x.endsAt)}
                      </Typography>
                    </Box>
                    <Typography variant="caption" sx={{ fontWeight: 700, color: x.daysLeft <= 2 ? 'error.main' : 'warning.dark' }}>
                      {x.daysLeft === 0 ? 'Today' : `${x.daysLeft} day${x.daysLeft === 1 ? '' : 's'}`}
                    </Typography>
                    <SubscriptionChip status={x.status} />
                  </Stack>
                ))}
              </Stack>
            )}
          </Panel>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Panel title="Latest payments" action={<Link component={RouterLink} to="/admin/payments" variant="caption" sx={{ fontWeight: 600 }}>All payments</Link>}>
            {billing.recentPayments.length === 0 ? (
              <Typography variant="body2" color="textSecondary" sx={{ py: 3, textAlign: 'center' }}>
                No payments yet
              </Typography>
            ) : (
              <Stack divider={<Divider flexItem />} spacing={1.25}>
                {billing.recentPayments.map((p) => (
                  <Stack key={p.id} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                        {p.organisation.name}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        {p.plan.name} · {formatDate(p.paidAt ?? p.createdAt)} · {p.source === 'manual' ? 'manual' : 'online'}
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 700 }}>
                      {inr(p.amountPaise)}
                    </Typography>
                    <PaymentStatusChip status={p.status} />
                  </Stack>
                ))}
              </Stack>
            )}
          </Panel>
        </Grid>
        <Grid size={12}>
          <Card>
            <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <ApartmentOutlinedIcon color="action" />
              <Typography variant="body2">
                <strong>{platform.organisations}</strong> organisations · <strong>{platform.active}</strong> active · <strong>{platform.suspended}</strong> deactivated · <strong>{platform.branches}</strong> branches · <strong>{platform.users}</strong> users
              </Typography>
              <Box sx={{ flex: 1 }} />
              <Link component={RouterLink} to="/admin/organisations" sx={{ fontWeight: 600 }}>
                Manage organisations →
              </Link>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </>
  );
}
