import AddBusinessOutlinedIcon from '@mui/icons-material/AddBusinessOutlined';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import CurrencyRupeeRoundedIcon from '@mui/icons-material/CurrencyRupeeRounded';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import { Box, Button, Card, CardContent, Divider, Grid, Link, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router';
import ClampText from '../../components/ClampText.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import SummaryCards, { SummaryCard } from '../../components/SummaryCards.jsx';
import { formatDate } from '../../utils/format.js';
import { inr, PaymentStatusChip, SubscriptionChip } from '../billing/billingUi.jsx';
import { BarList, ColumnChart } from '../home/charts.jsx';
import { AreaChart, DonutChart, ShareBars } from '../home/shareCharts.jsx';
import { Delta, Meter, StackedColumnChart } from './adminCharts.jsx';
import { useBillingDashboardQuery, usePlatformDashboardQuery } from './platformApi.js';

const monthName = (key) => new Date(`${key}-01T00:00:00`).toLocaleString('en-IN', { month: 'short' });
const monthYear = (key) => new Date(`${key}-01T00:00:00`).toLocaleString('en-IN', { month: 'short', year: 'numeric' });
const REVENUE_SERIES = [
  { key: 'onlinePaise', label: 'Online' },
  { key: 'manualPaise', label: 'Manual' },
];

/** A label and its figure on one line, for the small facts beside the hero number and in Platform usage. */
const Fact = ({ label, value, caption }) => (
  <Box sx={{ minWidth: 0 }}>
    <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>
      {label}
    </Typography>
    <Typography sx={{ fontWeight: 700, fontSize: '1.125rem', lineHeight: 1.3 }}>{value}</Typography>
    {caption && (
      <Typography variant="caption" color="textSecondary">
        {caption}
      </Typography>
    )}
  </Box>
);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Dashboard periods (the same three on every dashboard): the label on the filter, and how it reads in a sentence. */
const PERIODS = [
  { value: 'today', label: 'Today', phrase: 'today' },
  { value: 'month', label: 'This month', phrase: 'this month' },
  { value: 'all', label: 'All time', phrase: 'so far' },
];
const PERIOD_KEY = 'jerp.admin.dashboardPeriod.v2';
const savedPeriod = () => {
  try {
    const v = localStorage.getItem(PERIOD_KEY);
    return PERIODS.some((p) => p.value === v) ? v : 'all';
  } catch {
    return 'all';
  }
};

function PeriodFilter({ value, onChange }) {
  return (
    <ToggleButtonGroup
      exclusive
      size="small"
      value={value}
      onChange={(e, v) => v && onChange(v)}
      aria-label="Period"
      sx={{
        bgcolor: 'background.paper',
        width: { xs: '100%', sm: 'auto' },
        // Phones: equal buttons across the full width, nothing cut off. The chosen one is filled gold (theme).
        '& .MuiToggleButton-root': { flex: { xs: '1 1 0', sm: 'none' }, minWidth: 0, px: { xs: 0.5, sm: 1.75 }, py: 0.625, fontSize: { xs: '0.75rem', sm: '0.8125rem' }, fontWeight: 600, textTransform: 'none', whiteSpace: 'nowrap', border: 1, borderColor: 'divider' },
      }}
    >
      {PERIODS.map((p) => (
        <ToggleButton key={p.value} value={p.value}>
          {p.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}

function Panel({ title, subtitle, action, children }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, gap: 1 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h5">{title}</Typography>
            {subtitle && (
              <ClampText lines={2} lineHeight={1.4} variant="caption" color="textSecondary" sx={{ mt: 0.25 }}>
                {subtitle}
              </ClampText>
            )}
          </Box>
          {action}
        </Stack>
        <Box sx={{ flex: 1 }}>{children}</Box>
      </CardContent>
    </Card>
  );
}

const PanelLink = ({ to, children }) => (
  <Link component={RouterLink} to={to} variant="caption" underline="hover" sx={{ fontWeight: 700, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 0.25 }}>
    {children} <ArrowForwardRoundedIcon sx={{ fontSize: 14 }} />
  </Link>
);

const Empty = ({ children }) => (
  <Typography variant="body2" color="textSecondary" sx={{ py: 4, textAlign: 'center' }}>
    {children}
  </Typography>
);

/** Initials in a soft gold circle, used for organisation rows. */
const OrgMark = ({ name }) => (
  <Box sx={{ width: 36, height: 36, flexShrink: 0, borderRadius: 2, display: 'grid', placeItems: 'center', fontSize: '0.75rem', fontWeight: 800, color: 'var(--brand-strong)', background: 'linear-gradient(145deg, rgba(var(--brand-rgb), 0.20), rgba(var(--brand-rgb), 0.06))', border: '1px solid rgba(var(--brand-rgb), 0.3)' }}>
    {name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join('')}
  </Box>
);

/** The platform at a glance: money in, how subscriptions stand, who is about to lapse, who joined and who paid. */
export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const [period, setPeriodState] = useState(savedPeriod);
  const setPeriod = (v) => {
    setPeriodState(v);
    try {
      localStorage.setItem(PERIOD_KEY, v);
    } catch {
      /* the choice just isn't remembered */
    }
  };
  // While a new period loads, the last numbers stay on screen (dimmed) instead of a spinner.
  const { data: platform, isLoading: l1, isFetching: f1, error: e1, refetch: r1 } = usePlatformDashboardQuery(period);
  const { data: billing, isLoading: l2, isFetching: f2, error: e2, refetch: r2 } = useBillingDashboardQuery(period);
  if (l1 || l2) return <LoadingState />;
  if (e1 || e2) return <ErrorState error={e1 ?? e2} onRetry={() => (r1(), r2())} />;
  const subs = billing.subscriptions;
  const everyone = subs.active + subs.trial + subs.expired;
  const soon = billing.expiring.length;
  const phrase = PERIODS.find((p) => p.value === period).phrase;
  const pp = billing.period ?? { revenuePaise: 0, payments: 0, payingOrganisations: 0 };
  const joined = platform.newInPeriod ?? 0;

  return (
    <>
      <PageHeader title="Platform overview" subtitle="Organisations, subscriptions and revenue." actions={<PeriodFilter value={period} onChange={setPeriod} />} />

      <Box sx={{ opacity: f1 || f2 ? 0.6 : 1, transition: 'opacity 160ms ease' }}>
      <SummaryCards>
        <SummaryCard icon={CurrencyRupeeRoundedIcon} label="Revenue" value={inr(pp.revenuePaise)} caption={pp.payments ? `${plural(pp.payments, 'payment')} ${phrase}` : `No payments ${phrase}`} tone="green" valueTone="paid" onClick={() => navigate('/admin/payments')} />
        <SummaryCard icon={AddBusinessOutlinedIcon} label="New organisations" value={joined} caption={joined ? `Signed up ${phrase}` : `No sign-ups ${phrase}`} tone="gold" onClick={() => navigate('/admin/organisations')} />
        <SummaryCard icon={VerifiedOutlinedIcon} label="Paid subscriptions" value={subs.active} caption={subs.trial ? `${subs.trial} more on free trial` : everyone ? `${Math.round((subs.active / everyone) * 100)}% of all organisations` : 'No organisations yet'} tone="blue" />
        <SummaryCard
          icon={TimerOutlinedIcon}
          label="Ending this week"
          value={soon}
          caption={subs.expired ? `${subs.expired} already expired` : soon ? 'Remind them to renew' : 'Nothing ends this week'}
          tone={soon || subs.expired ? 'red' : 'green'}
          valueTone={soon ? 'due' : undefined}
          onClick={() => navigate('/admin/organisations')}
        />
      </SummaryCards>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Panel title="Revenue" subtitle="Subscription payments received · last 12 months, online and entered manually" action={<PanelLink to="/admin/payments">All payments</PanelLink>}>
            {/* The one hero figure: this month so far, against last month; MRR and all-time beside it. */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 2, sm: 4 }} sx={{ mb: 2.5, alignItems: { sm: 'flex-end' } }}>
              <Box>
                <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>
                  This month so far
                </Typography>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                  <Typography sx={{ fontSize: { xs: 36, sm: 48 }, fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em' }}>{inr(billing.revenue.monthPaise)}</Typography>
                  <Delta now={billing.revenue.monthPaise} before={billing.revenue.lastMonthPaise} suffix="vs last month" />
                </Stack>
                <Typography variant="caption" color="textSecondary">
                  Last month {inr(billing.revenue.lastMonthPaise)}
                </Typography>
              </Box>
              <Stack direction="row" spacing={4}>
                <Fact label="Monthly recurring" value={inr(billing.revenue.mrrPaise ?? 0)} caption="From paid plans now active" />
                <Fact label="All time" value={inr(billing.revenue.totalPaise)} />
              </Stack>
            </Stack>
            <StackedColumnChart
              series={REVENUE_SERIES}
              data={billing.revenue.months.map((m) => ({ key: m.key, label: monthName(m.key), onlinePaise: m.onlinePaise ?? 0, manualPaise: m.manualPaise ?? m.totalPaise, detail: `${monthYear(m.key)} · ${plural(m.count, 'payment')}` }))}
              emptyLabel="No payments yet"
            />
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
              formatCenter={(v) => String(v)}
              centerLabel="Organisations"
              empty="No organisations yet"
            />
            {billing.conversion?.organisations > 0 && (
              <>
                <Divider sx={{ my: 2 }} />
                <Meter label="Trial → paid" part={billing.conversion.paying} whole={billing.conversion.organisations} caption={`${billing.conversion.paying} of ${plural(billing.conversion.organisations, 'organisation')} have paid at least once`} />
              </>
            )}
          </Panel>
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 6, lg: 4 }}>
          <Panel title="Growth" subtitle="Organisations on the platform · end of each month">
            <AreaChart
              height={200}
              data={(platform.signups ?? []).map((m) => ({ key: m.key, label: monthName(m.key), value: m.total ?? 0, detail: `${monthYear(m.key)} · ${m.count} new` }))}
              formatValue={(v) => plural(v, 'organisation')}
              formatAxis={(v) => String(Math.round(v))}
              emptyLabel="No organisations yet"
            />
          </Panel>
        </Grid>
        <Grid size={{ xs: 12, md: 6, lg: 4 }}>
          <Panel title="Sign-ups" subtitle="New organisations each month · last 12 months">
            <ColumnChart
              height={200}
              data={(platform.signups ?? []).map((m) => ({ key: m.key, label: monthName(m.key), value: m.count, detail: monthYear(m.key) }))}
              formatValue={(v) => plural(v, 'organisation')}
              formatAxis={(v) => String(Math.round(v))}
              emptyLabel="No sign-ups yet"
            />
          </Panel>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Panel title="Revenue by plan" subtitle="Payments received · last 12 months" action={<PanelLink to="/admin/plans">Plans</PanelLink>}>
            <ShareBars rows={billing.revenue.byPlan ?? []} totalLabel="Last 12 months" empty="No payments yet" />
          </Panel>
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 6, lg: 4 }}>
          <Panel title="Paid plans" subtitle="Paying organisations on each plan now">
            <BarList rows={billing.plans ?? []} formatValue={(v) => plural(v, 'org')} empty="No paid subscriptions yet" />
          </Panel>
        </Grid>
        <Grid size={{ xs: 12, md: 6, lg: 4 }}>
          <Panel title="Platform usage" subtitle="Across all active organisations">
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2.5 }}>
              <Fact label="Organisations" value={platform.active} caption={platform.suspended ? `${platform.suspended} deactivated` : 'All active'} />
              <Fact label="Branches" value={platform.branches} caption={platform.active ? `${(platform.branches / platform.active).toFixed(1)} per organisation` : null} />
              <Fact label="Users" value={platform.users} caption={platform.active ? `${(platform.users / platform.active).toFixed(1)} per organisation` : null} />
              <Fact label="Paying now" value={subs.active} caption={everyone ? `${Math.round((subs.active / everyone) * 100)}% of organisations` : null} />
            </Box>
          </Panel>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Panel title="Ending within 7 days" subtitle="Trials and paid periods about to lapse">
            {soon === 0 ? (
              <Empty>Nothing ends this week</Empty>
            ) : (
              <Stack divider={<Divider flexItem />} spacing={1.25}>
                {billing.expiring.map((x) => (
                  <Stack key={String(x.organisationId)} direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                    <OrgMark name={x.name} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Link component={RouterLink} to={`/admin/organisations/${x.organisationId}`} underline="hover" noWrap sx={{ display: 'block', fontWeight: 600, fontSize: '0.875rem', color: 'text.primary' }}>
                        {x.name}
                      </Link>
                      <Typography variant="caption" color="textSecondary" noWrap component="div">
                        {x.planName} · ends {formatDate(x.endsAt)}
                      </Typography>
                    </Box>
                    <Box sx={{ px: 1, py: 0.25, borderRadius: 999, fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap', color: x.daysLeft <= 2 ? 'error.main' : 'warning.dark', bgcolor: x.daysLeft <= 2 ? 'rgba(155, 44, 44, 0.08)' : 'rgba(183, 121, 31, 0.10)' }}>
                      {x.daysLeft === 0 ? 'Today' : `${x.daysLeft}d left`}
                    </Box>
                  </Stack>
                ))}
              </Stack>
            )}
          </Panel>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Panel title="New organisations" subtitle={`Signed up ${phrase}`} action={<PanelLink to="/admin/organisations">All organisations</PanelLink>}>
            {!platform.recent?.length ? (
              <Empty>No sign-ups {phrase}</Empty>
            ) : (
              <Stack divider={<Divider flexItem />} spacing={1.25}>
                {platform.recent.map((o) => (
                  <Stack key={o.id} direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                    <OrgMark name={o.name} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Link component={RouterLink} to={`/admin/organisations/${o.id}`} underline="hover" noWrap sx={{ display: 'block', fontWeight: 600, fontSize: '0.875rem', color: 'text.primary' }}>
                        {o.name}
                      </Link>
                      <Typography variant="caption" color="textSecondary" noWrap component="div">
                        {[o.owner?.name, `joined ${formatDate(o.createdAt)}`, `${o.branchesUsed} branch${o.branchesUsed === 1 ? '' : 'es'}`].filter(Boolean).join(' · ')}
                      </Typography>
                    </Box>
                    <SubscriptionChip status={o.subscription?.expired ? 'expired' : o.subscription?.status} />
                  </Stack>
                ))}
              </Stack>
            )}
          </Panel>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Panel title="Latest payments" subtitle={`Online and manual · ${phrase}`} action={<PanelLink to="/admin/payments">All payments</PanelLink>}>
            {billing.recentPayments.length === 0 ? (
              <Empty>No payments {phrase}</Empty>
            ) : (
              <Stack divider={<Divider flexItem />} spacing={1.25}>
                {billing.recentPayments.map((p) => (
                  <Stack key={p.id} direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
                    <OrgMark name={p.organisation.name} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                        {p.organisation.name}
                      </Typography>
                      <Typography variant="caption" color="textSecondary" noWrap component="div">
                        {p.plan.name} · {formatDate(p.paidAt ?? p.createdAt)} · {p.source === 'manual' ? 'Manual' : 'Online'}
                      </Typography>
                    </Box>
                    <Stack sx={{ alignItems: 'flex-end', gap: 0.5 }}>
                      <Typography variant="body2" sx={{ fontWeight: 800, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                        {inr(p.amountPaise)}
                      </Typography>
                      <PaymentStatusChip status={p.status} />
                    </Stack>
                  </Stack>
                ))}
              </Stack>
            )}
          </Panel>
        </Grid>
      </Grid>

      </Box>

      {platform.suspended > 0 && (
        <Stack direction="row" sx={{ mt: 2, justifyContent: 'flex-end' }}>
          <Button size="small" color="secondary" component={RouterLink} to="/admin/organisations" endIcon={<ArrowForwardRoundedIcon />}>
            {plural(platform.suspended, 'deactivated organisation')}
          </Button>
        </Stack>
      )}
    </>
  );
}
