import AddBusinessOutlinedIcon from '@mui/icons-material/AddBusinessOutlined';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import BarChartRoundedIcon from '@mui/icons-material/BarChartRounded';
import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import CurrencyRupeeRoundedIcon from '@mui/icons-material/CurrencyRupeeRounded';
import DonutLargeRoundedIcon from '@mui/icons-material/DonutLargeRounded';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import ShowChartRoundedIcon from '@mui/icons-material/ShowChartRounded';
import StyleOutlinedIcon from '@mui/icons-material/StyleOutlined';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import { Box, Button, ButtonBase, Divider, Grid, Stack, Typography, useMediaQuery } from '@mui/material';
import { useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import SummaryCards, { SummaryCard } from '../../components/SummaryCards.jsx';
import { fonts, tokens } from '../../theme/tokens.js';
import { formatDate } from '../../utils/format.js';
import { inr, PaymentStatusChip, SubscriptionChip } from '../billing/billingUi.jsx';
import { ColumnChart } from '../home/charts.jsx';
import { EmptyNote, Panel, PanelLink, PeriodSwitch, RankList, StatTile } from '../home/dashboardUi.jsx';
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
const paymentsCount = (n) => t(n === 1 ? '{{n}} payment' : '{{n}} payments', { n });

/** Dashboard periods (the same three on every dashboard): the label on the filter, and how it reads in a sentence. */
const PERIODS = [
  { value: 'today', label: t('Today'), phrase: t('today') },
  { value: 'month', label: t('This month'), phrase: t('this month') },
  { value: 'all', label: t('All time'), short: t('All'), phrase: t('so far') },
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

// The super admin's everyday pages, one click from the overview.
const QUICK_LINKS = [
  { to: '/admin/organisations', label: t('Organisations'), icon: BusinessOutlinedIcon },
  { to: '/admin/plans', label: t('Plans'), icon: StyleOutlinedIcon },
  { to: '/admin/payments', label: t('Payments'), icon: ReceiptLongOutlinedIcon },
];

/** Initials in a soft gold tile, for organisation rows. */
const OrgMark = ({ name }) => (
  <Box sx={{ width: 38, height: 38, flexShrink: 0, borderRadius: 2, display: 'grid', placeItems: 'center', fontSize: '0.75rem', fontWeight: 800, color: 'var(--brand-strong)', background: 'linear-gradient(145deg, rgba(var(--brand-rgb), 0.22), rgba(var(--brand-rgb), 0.06))', border: '1px solid rgba(var(--brand-rgb), 0.3)' }}>
    {name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join('')}
  </Box>
);

/** One organisation row in a list: the whole row opens it (when there is a link). */
function OrgRow({ to, name, caption, end }) {
  return (
    <ButtonBase
      component={to ? RouterLink : 'div'}
      to={to}
      disabled={!to}
      sx={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left', gap: 1.25, p: 1.25, borderRadius: 2, border: 1, borderColor: 'divider', transition: 'border-color .15s, background-color .15s', '&:hover': { bgcolor: 'action.hover', borderColor: 'rgba(var(--brand-rgb), 0.4)' }, '&.Mui-disabled': { pointerEvents: 'auto' } }}
    >
      <OrgMark name={name} />
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
          {name}
        </Typography>
        <Typography variant="caption" color="textSecondary" noWrap component="div">
          {caption}
        </Typography>
      </Box>
      {end}
    </ButtonBase>
  );
}

/** The platform at a glance: money in, how subscriptions stand, who is about to lapse, who joined and who paid. */
export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const phone = useMediaQuery((theme) => theme.breakpoints.down('sm'));
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
  const perOrg = (n) => (platform.active ? t('{{value}} per organisation', { value: (n / platform.active).toFixed(1) }) : null);

  return (
    <>
      {/* The title on the dark, gold-lit band of the side menu, with the period and the everyday pages. */}
      <Box sx={{ position: 'relative', overflow: 'hidden', borderRadius: 2.5, mb: { xs: 2, sm: 2.5 }, px: { xs: 2, sm: 3 }, py: { xs: 2.25, sm: 3 }, background: `${tokens.sidebar.glow}, ${tokens.sidebar.surface}`, color: '#F7F3E8', boxShadow: '0 18px 40px -24px rgba(0, 0, 0, 0.55)' }}>
        <Box aria-hidden sx={{ position: 'absolute', width: 260, height: 260, right: -70, top: -110, borderRadius: '50%', border: '1px solid rgba(var(--brand-rgb), 0.22)' }} />
        <Box aria-hidden sx={{ position: 'absolute', width: 180, height: 180, right: 40, top: -40, borderRadius: '50%', border: '1px solid rgba(var(--brand-rgb), 0.14)' }} />
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ position: 'relative', justifyContent: 'space-between', alignItems: { md: 'center' } }}>
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', color: 'var(--brand-light)' }}>
              <WorkspacePremiumOutlinedIcon sx={{ fontSize: 15 }} />
              <Typography noWrap sx={{ fontSize: { xs: '0.6875rem', sm: '0.75rem' }, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                {t('Super admin')}
              </Typography>
            </Stack>
            <Typography sx={{ fontFamily: fonts.display, fontSize: { xs: 26, sm: 32, md: 38 }, fontWeight: 600, lineHeight: 1.1, mt: 0.5 }}>{t('Platform overview')}</Typography>
            <Typography variant="body2" sx={{ mt: 0.5, color: 'rgba(247, 243, 232, 0.6)' }}>
              {t('Organisations, subscriptions and revenue.')} · {new Date().toLocaleDateString(getLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </Typography>
          </Box>
          <Stack spacing={1.25} sx={{ alignItems: { md: 'flex-end' } }}>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(3, minmax(0, 1fr))', sm: 'repeat(3, auto)' }, gap: 1 }}>
              {QUICK_LINKS.map(({ to, label, icon: Icon }) => (
                <Button key={to} component={RouterLink} to={to} variant="outlined" startIcon={phone ? null : <Icon />} sx={{ whiteSpace: 'nowrap', color: '#F7F3E8', borderColor: 'rgba(247, 243, 232, 0.28)', bgcolor: 'rgba(247, 243, 232, 0.04)', '&:hover': { borderColor: 'var(--brand-light)', bgcolor: 'rgba(247, 243, 232, 0.1)' } }}>
                  {label}
                </Button>
              ))}
            </Box>
            <PeriodSwitch value={period} options={PERIODS} onChange={setPeriod} short={phone} onDark />
          </Stack>
        </Stack>
      </Box>

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

        <Grid container spacing={{ xs: 1.5, sm: 2.5 }}>
          <Grid size={{ xs: 12, lg: 8 }}>
            <Panel icon={ShowChartRoundedIcon} title={t('Revenue')} subtitle={t('Subscription payments · last 12 months, online and manual')} action={<PanelLink to="/admin/payments">{t('All payments')}</PanelLink>}>
              {/* The one hero figure: this month so far, against last month; MRR and all-time beside it. */}
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1.5, sm: 2 }} sx={{ mb: 2.5, alignItems: { sm: 'stretch' } }}>
                <Box sx={{ flex: 1.4, minWidth: 0, px: 2, py: 1.5, borderRadius: 2.5, background: 'linear-gradient(135deg, rgba(var(--brand-rgb), 0.14), rgba(var(--brand-rgb), 0.03))', border: '1px solid rgba(var(--brand-rgb), 0.25)' }}>
                  <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>
                    {t('This month so far')}
                  </Typography>
                  <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                    <Typography sx={{ fontFamily: fonts.display, fontSize: { xs: 34, sm: 42 }, fontWeight: 700, lineHeight: 1.1, color: 'var(--brand-strong)' }}>{inr(billing.revenue.monthPaise)}</Typography>
                    <Delta now={billing.revenue.monthPaise} before={billing.revenue.lastMonthPaise} suffix={t('vs last month')} />
                  </Stack>
                  <Typography variant="caption" color="textSecondary">
                    {t('Last month {{inr}}', { inr: inr(billing.revenue.lastMonthPaise) })}
                  </Typography>
                </Box>
                <Stack direction={{ xs: 'row', sm: 'column' }} spacing={1.25} sx={{ flex: 1, minWidth: 0 }}>
                  <StatTile label={t('Monthly recurring')} value={inr(billing.revenue.mrrPaise ?? 0)} />
                  <StatTile label={t('All time')} value={inr(billing.revenue.totalPaise)} />
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
            <Panel icon={DonutLargeRoundedIcon} title={t('Subscriptions')} subtitle={t('Where every organisation stands')}>
              <Box sx={{ display: 'grid', placeItems: 'center', pt: 0.5 }}>
                <DonutChart
                  rows={[
                    { key: 'active', label: t('Paid'), value: subs.active },
                    { key: 'trial', label: t('Free trial'), value: subs.trial },
                    { key: 'expired', label: t('Expired'), value: subs.expired },
                  ]}
                  stacked
                  size={168}
                  formatValue={(v) => String(v)}
                  formatCenter={(v) => String(v)}
                  centerLabel={t('Organisations')}
                  empty={t('No organisations yet')}
                />
              </Box>
              {billing.conversion?.organisations > 0 && (
                <>
                  <Divider sx={{ my: 2 }} />
                  <Meter label={t('Trial → paid')} part={billing.conversion.paying} whole={billing.conversion.organisations} caption={t(billing.conversion.organisations === 1 ? '{{paying}} of {{n}} organisation has paid at least once' : '{{paying}} of {{n}} organisations have paid at least once', { paying: billing.conversion.paying, n: billing.conversion.organisations })} />
                </>
              )}
            </Panel>
          </Grid>

          <Grid size={{ xs: 12, md: 6, lg: 4 }}>
            <Panel icon={TrendingUpRoundedIcon} title={t('Growth')} subtitle={t('Organisations on the platform · end of each month')}>
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
            <Panel icon={BarChartRoundedIcon} title={t('Sign-ups')} subtitle={t('New organisations each month · last 12 months')}>
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
            <Panel icon={StyleOutlinedIcon} title={t('Revenue by plan')} subtitle={t('Payments received · last 12 months')} action={<PanelLink to="/admin/plans">{t('Plans')}</PanelLink>}>
              <ShareBars rows={billing.revenue.byPlan ?? []} totalLabel={t('Last 12 months')} empty={t('No payments yet')} />
            </Panel>
          </Grid>

          <Grid size={{ xs: 12, md: 6, lg: 4 }}>
            <Panel icon={VerifiedOutlinedIcon} title={t('Paid plans')} subtitle={t('Paying organisations on each plan now')}>
              <RankList rows={(billing.plans ?? []).map((p) => ({ key: p.key ?? p.label, label: p.label, value: p.value }))} formatValue={(v) => t(v === 1 ? '{{n}} org' : '{{n}} orgs', { n: v })} empty={t('No paid subscriptions yet')} />
            </Panel>
          </Grid>
          <Grid size={{ xs: 12, md: 6, lg: 4 }}>
            <Panel icon={HubOutlinedIcon} title={t('Platform usage')} subtitle={t('Across all active organisations')}>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.25 }}>
                <UsageTile label={t('Organisations')} value={platform.active} caption={platform.suspended ? t('{{suspended}} deactivated', { suspended: platform.suspended }) : t('All active')} />
                <UsageTile label={t('Branches')} value={platform.branches} caption={perOrg(platform.branches)} />
                <UsageTile label={t('Users')} value={platform.users} caption={perOrg(platform.users)} />
                <UsageTile label={t('Paying now')} value={subs.active} caption={everyone ? t('{{Math}}% of organisations', { Math: Math.round((subs.active / everyone) * 100) }) : null} />
              </Box>
            </Panel>
          </Grid>
          <Grid size={{ xs: 12, lg: 4 }}>
            <Panel icon={TimerOutlinedIcon} title={t('Ending within 7 days')} subtitle={t('Trials and paid periods about to lapse')}>
              {soon === 0 ? (
                <EmptyNote>{t('Nothing ends this week')}</EmptyNote>
              ) : (
                <Stack spacing={1}>
                  {billing.expiring.map((x) => (
                    <OrgRow
                      key={String(x.organisationId)}
                      to={`/admin/organisations/${x.organisationId}`}
                      name={x.name}
                      caption={t('{{planName}} · ends {{endsAt}}', { planName: x.planName, endsAt: formatDate(x.endsAt) })}
                      end={
                        <Box sx={{ px: 1, py: 0.25, borderRadius: 999, fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap', color: x.daysLeft <= 2 ? 'error.main' : 'warning.dark', bgcolor: x.daysLeft <= 2 ? 'rgba(155, 44, 44, 0.08)' : 'rgba(183, 121, 31, 0.10)' }}>
                          {x.daysLeft === 0 ? t('Today') : t('{{daysLeft}}d left', { daysLeft: x.daysLeft })}
                        </Box>
                      }
                    />
                  ))}
                </Stack>
              )}
            </Panel>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Panel icon={AddBusinessOutlinedIcon} title={t('New organisations')} subtitle={t('Signed up {{phrase}}', { phrase })} action={<PanelLink to="/admin/organisations">{t('All organisations')}</PanelLink>}>
              {!platform.recent?.length ? (
                <EmptyNote>{t('No sign-ups {{phrase}}', { phrase })}</EmptyNote>
              ) : (
                <Stack spacing={1}>
                  {platform.recent.map((o) => (
                    <OrgRow
                      key={o.id}
                      to={`/admin/organisations/${o.id}`}
                      name={o.name}
                      caption={[o.owner?.name, t('joined {{createdAt}}', { createdAt: formatDate(o.createdAt) }), o.branchesUsed === 1 ? t('{{branchesUsed}} branch', { branchesUsed: o.branchesUsed }) : t('{{branchesUsed}} branches', { branchesUsed: o.branchesUsed })].filter(Boolean).join(' · ')}
                      end={<SubscriptionChip status={o.subscription?.expired ? 'expired' : o.subscription?.status} />}
                    />
                  ))}
                </Stack>
              )}
            </Panel>
          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Panel icon={ReceiptLongOutlinedIcon} title={t('Latest payments')} subtitle={t('Online and manual · {{phrase}}', { phrase })} action={<PanelLink to="/admin/payments">{t('All payments')}</PanelLink>}>
              {billing.recentPayments.length === 0 ? (
                <EmptyNote>{t('No payments {{phrase}}', { phrase })}</EmptyNote>
              ) : (
                <Stack spacing={1}>
                  {billing.recentPayments.map((p) => (
                    <OrgRow
                      key={p.id}
                      name={p.organisation.name}
                      caption={`${p.plan.name} · ${formatDate(p.paidAt ?? p.createdAt)} · ${p.source === 'manual' ? t('Manual') : t('Online')}`}
                      end={
                        <Stack sx={{ alignItems: 'flex-end', gap: 0.5 }}>
                          <Typography variant="body2" sx={{ fontWeight: 800, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                            {inr(p.amountPaise)}
                          </Typography>
                          <PaymentStatusChip status={p.status} />
                        </Stack>
                      }
                    />
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

/** A usage figure in a tinted tile, with what it means per organisation. */
function UsageTile({ label, value, caption }) {
  return (
    <Box sx={{ minWidth: 0, px: 1.5, py: 1.25, borderRadius: 2, bgcolor: 'rgba(var(--brand-rgb), 0.07)', border: '1px solid rgba(var(--brand-rgb), 0.18)' }}>
      <Typography variant="caption" color="textSecondary" noWrap component="div">
        {label}
      </Typography>
      <Typography sx={{ fontFamily: fonts.display, fontWeight: 700, fontSize: '1.625rem', lineHeight: 1.15 }}>{value}</Typography>
      {caption && (
        <Typography variant="caption" color="textSecondary" noWrap component="div">
          {caption}
        </Typography>
      )}
    </Box>
  );
}
