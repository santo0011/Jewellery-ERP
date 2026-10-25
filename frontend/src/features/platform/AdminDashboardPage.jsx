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
import { t, getLocale } from '../../i18n/index.js';

const monthName = (key) => new Date(`${key}-01T00:00:00`).toLocaleString(getLocale(), { month: 'short' });
const monthYear = (key) => new Date(`${key}-01T00:00:00`).toLocaleString(getLocale(), { month: 'short', year: 'numeric' });
const REVENUE_SERIES = [
  { key: 'onlinePaise', label: t('Online') },
  { key: 'manualPaise', label: t('Manual') },
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
const paymentsCount = (n) => t(n === 1 ? '{{n}} payment' : '{{n}} payments', { n });

/** Dashboard periods (the same three on every dashboard): the label on the filter, and how it reads in a sentence. */
const PERIODS = [
  { value: 'today', label: t('Today'), phrase: t('today') },
  { value: 'month', label: t('This month'), phrase: t('this month') },
  { value: 'all', label: t('All time'), phrase: t('so far') },
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
      aria-label={t('Period')}
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
      <PageHeader title={t('Platform overview')} subtitle={t('Organisations, subscriptions and revenue.')} actions={<PeriodFilter value={period} onChange={setPeriod} />} />

      <Box sx={{ opacity: f1 || f2 ? 0.6 : 1, transition: 'opacity 160ms ease' }}>
      <SummaryCards>
        <SummaryCard icon={CurrencyRupeeRoundedIcon} label={t('Revenue')} value={inr(pp.revenuePaise)} caption={pp.payments ? t(pp.payments === 1 ? '{{n}} payment {{phrase}}' : '{{n}} payments {{phrase}}', { n: pp.payments, phrase }) : t('No payments {{phrase}}', { phrase })} tone="green" valueTone="paid" onClick={() => navigate('/admin/payments')} />
        <SummaryCard icon={AddBusinessOutlinedIcon} label={t('New organisations')} value={joined} caption={joined ? t('Signed up {{phrase}}', { phrase }) : t('No sign-ups {{phrase}}', { phrase })} tone="gold" onClick={() => navigate('/admin/organisations')} />
        <SummaryCard icon={VerifiedOutlinedIcon} label={t('Paid subscriptions')} value={subs.active} caption={subs.trial ? t('{{trial}} more on free trial', { trial: subs.trial }) : everyone ? t('{{Math}}% of all organisations', { Math: Math.round((subs.active / everyone) * 100) }) : t('No organisations yet')} tone="blue" />
        <SummaryCard
          icon={TimerOutlinedIcon}
          label={t('Ending this week')}
          value={soon}
          caption={subs.expired ? t('{{expired}} already expired', { expired: subs.expired }) : soon ? t('Remind them to renew') : t('Nothing ends this week')}
          tone={soon || subs.expired ? 'red' : 'green'}
          valueTone={soon ? 'due' : undefined}
          onClick={() => navigate('/admin/organisations')}
        />
      </SummaryCards>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, lg: 8 }}>
          <Panel title={t('Revenue')} subtitle={t('Subscription payments received · last 12 months, online and entered manually')} action={<PanelLink to="/admin/payments">{t('All payments')}</PanelLink>}>
            {/* The one hero figure: this month so far, against last month; MRR and all-time beside it. */}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 2, sm: 4 }} sx={{ mb: 2.5, alignItems: { sm: 'flex-end' } }}>
              <Box>
                <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>
                  {t('This month so far')}
                </Typography>
                <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                  <Typography sx={{ fontSize: { xs: 36, sm: 48 }, fontWeight: 700, lineHeight: 1.1, letterSpacing: '-0.02em' }}>{inr(billing.revenue.monthPaise)}</Typography>
                  <Delta now={billing.revenue.monthPaise} before={billing.revenue.lastMonthPaise} suffix={t('vs last month')} />
                </Stack>
                <Typography variant="caption" color="textSecondary">
                  {t('Last month {{inr}}', { inr: inr(billing.revenue.lastMonthPaise) })}
                </Typography>
              </Box>
              <Stack direction="row" spacing={4}>
                <Fact label={t('Monthly recurring')} value={inr(billing.revenue.mrrPaise ?? 0)} caption={t('From paid plans now active')} />
                <Fact label={t('All time')} value={inr(billing.revenue.totalPaise)} />
              </Stack>
            </Stack>
            <StackedColumnChart
              series={REVENUE_SERIES}
              data={billing.revenue.months.map((m) => ({ key: m.key, label: monthName(m.key), onlinePaise: m.onlinePaise ?? 0, manualPaise: m.manualPaise ?? m.totalPaise, detail: `${monthYear(m.key)} · ${paymentsCount(m.count)}` }))}
              emptyLabel={t('No payments yet')}
            />
          </Panel>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Panel title={t('Subscriptions')} subtitle={t('Where every organisation stands')}>
            <DonutChart
              rows={[
                { key: 'active', label: t('Paid'), value: subs.active },
                { key: 'trial', label: t('Free trial'), value: subs.trial },
                { key: 'expired', label: t('Expired'), value: subs.expired },
              ]}
              formatValue={(v) => String(v)}
              formatCenter={(v) => String(v)}
              centerLabel={t('Organisations')}
              empty={t('No organisations yet')}
            />
            {billing.conversion?.organisations > 0 && (
              <>
                <Divider sx={{ my: 2 }} />
                <Meter label={t('Trial → paid')} part={billing.conversion.paying} whole={billing.conversion.organisations} caption={t(billing.conversion.organisations === 1 ? '{{paying}} of {{n}} organisation has paid at least once' : '{{paying}} of {{n}} organisations have paid at least once', { paying: billing.conversion.paying, n: billing.conversion.organisations })} />
              </>
            )}
          </Panel>
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 6, lg: 4 }}>
          <Panel title={t('Growth')} subtitle={t('Organisations on the platform · end of each month')}>
            <AreaChart
              height={200}
              data={(platform.signups ?? []).map((m) => ({ key: m.key, label: monthName(m.key), value: m.total ?? 0, detail: t('{{monthYear}} · {{count}} new', { monthYear: monthYear(m.key), count: m.count }) }))}
              formatValue={(v) => t(v === 1 ? '{{n}} organisation' : '{{n}} organisations', { n: v })}
              formatAxis={(v) => String(Math.round(v))}
              emptyLabel={t('No organisations yet')}
            />
          </Panel>
        </Grid>
        <Grid size={{ xs: 12, md: 6, lg: 4 }}>
          <Panel title={t('Sign-ups')} subtitle={t('New organisations each month · last 12 months')}>
            <ColumnChart
              height={200}
              data={(platform.signups ?? []).map((m) => ({ key: m.key, label: monthName(m.key), value: m.count, detail: monthYear(m.key) }))}
              formatValue={(v) => t(v === 1 ? '{{n}} organisation' : '{{n}} organisations', { n: v })}
              formatAxis={(v) => String(Math.round(v))}
              emptyLabel={t('No sign-ups yet')}
            />
          </Panel>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Panel title={t('Revenue by plan')} subtitle={t('Payments received · last 12 months')} action={<PanelLink to="/admin/plans">{t('Plans')}</PanelLink>}>
            <ShareBars rows={billing.revenue.byPlan ?? []} totalLabel={t('Last 12 months')} empty={t('No payments yet')} />
          </Panel>
        </Grid>
      </Grid>

      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 12, md: 6, lg: 4 }}>
          <Panel title={t('Paid plans')} subtitle={t('Paying organisations on each plan now')}>
            <BarList rows={billing.plans ?? []} formatValue={(v) => t(v === 1 ? '{{n}} org' : '{{n}} orgs', { n: v })} empty={t('No paid subscriptions yet')} />
          </Panel>
        </Grid>
        <Grid size={{ xs: 12, md: 6, lg: 4 }}>
          <Panel title={t('Platform usage')} subtitle={t('Across all active organisations')}>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2.5 }}>
              <Fact label={t('Organisations')} value={platform.active} caption={platform.suspended ? t('{{suspended}} deactivated', { suspended: platform.suspended }) : t('All active')} />
              <Fact label={t('Branches')} value={platform.branches} caption={platform.active ? t('{{value}} per organisation', { value: (platform.branches / platform.active).toFixed(1) }) : null} />
              <Fact label={t('Users')} value={platform.users} caption={platform.active ? t('{{value}} per organisation', { value: (platform.users / platform.active).toFixed(1) }) : null} />
              <Fact label={t('Paying now')} value={subs.active} caption={everyone ? t('{{Math}}% of organisations', { Math: Math.round((subs.active / everyone) * 100) }) : null} />
            </Box>
          </Panel>
        </Grid>
        <Grid size={{ xs: 12, lg: 4 }}>
          <Panel title={t('Ending within 7 days')} subtitle={t('Trials and paid periods about to lapse')}>
            {soon === 0 ? (
              <Empty>{t('Nothing ends this week')}</Empty>
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
                        {t('{{planName}} · ends {{endsAt}}', { planName: x.planName, endsAt: formatDate(x.endsAt) })}
                      </Typography>
                    </Box>
                    <Box sx={{ px: 1, py: 0.25, borderRadius: 999, fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap', color: x.daysLeft <= 2 ? 'error.main' : 'warning.dark', bgcolor: x.daysLeft <= 2 ? 'rgba(155, 44, 44, 0.08)' : 'rgba(183, 121, 31, 0.10)' }}>
                      {x.daysLeft === 0 ? t('Today') : t('{{daysLeft}}d left', { daysLeft: x.daysLeft })}
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
          <Panel title={t('New organisations')} subtitle={t('Signed up {{phrase}}', { phrase })} action={<PanelLink to="/admin/organisations">{t('All organisations')}</PanelLink>}>
            {!platform.recent?.length ? (
              <Empty>{t('No sign-ups {{phrase}}', { phrase })}</Empty>
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
                        {[o.owner?.name, t('joined {{createdAt}}', { createdAt: formatDate(o.createdAt) }), (o.branchesUsed === 1 ? t('{{branchesUsed}} branch', { branchesUsed: o.branchesUsed }) : t('{{branchesUsed}} branches', { branchesUsed: o.branchesUsed }))].filter(Boolean).join(' · ')}
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
          <Panel title={t('Latest payments')} subtitle={t('Online and manual · {{phrase}}', { phrase })} action={<PanelLink to="/admin/payments">{t('All payments')}</PanelLink>}>
            {billing.recentPayments.length === 0 ? (
              <Empty>{t('No payments {{phrase}}', { phrase })}</Empty>
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
                        {p.plan.name} · {formatDate(p.paidAt ?? p.createdAt)} · {p.source === 'manual' ? t('Manual') : t('Online')}
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
            {t(platform.suspended === 1 ? '{{n}} deactivated organisation' : '{{n}} deactivated organisations', { n: platform.suspended })}
          </Button>
        </Stack>
      )}
    </>
  );
}
