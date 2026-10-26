import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import DiamondOutlinedIcon from '@mui/icons-material/DiamondOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import PlaceOutlinedIcon from '@mui/icons-material/PlaceOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import ShowChartRoundedIcon from '@mui/icons-material/ShowChartRounded';
import { Box, ButtonBase, Grid, Stack, Typography, useMediaQuery } from '@mui/material';
import { formatINR, formatWeight, ORDER_STATUS_LABELS } from '@jerp/shared';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router';
import SummaryCards, { SummaryCard } from '../../components/SummaryCards.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import { usePermission } from '../../hooks/usePermission.js';
import { getLocale, t, tValue } from '../../i18n/index.js';
import { fonts } from '../../theme/tokens.js';
import { formatDate } from '../../utils/format.js';
import { useFinanceSummaryQuery } from '../finance/financeApi.js';
import { SalesExpenseChart } from '../finance/financeCharts.jsx';
import { OrderStatusChip } from '../orders/orderUi.jsx';
import { purityLabel } from '../products/productForm.js';
import { useBranchDashboardQuery } from './dashboardApi.js';
import { EmptyNote, goldBg, Initials, Panel, PanelLink, PeriodSwitch, RankList, ShareBar, StatTile } from './dashboardUi.jsx';
import { AreaChart, DonutChart } from './shareCharts.jsx';

// The same three periods on every dashboard.
const PERIODS = [
  { value: 'today', label: t('Today'), phrase: t('today') },
  { value: 'month', label: t('This month'), phrase: t('this month') },
  { value: 'all', label: t('All time'), short: t('All'), phrase: t('all time') },
];
const periodPhrase = (v) => PERIODS.find((p) => p.value === v)?.phrase ?? '';
const COLLECTION_PARTS = [
  ['bills', t('Bills')],
  ['orderAdvances', t('Orders')],
  ['dueCollections', t('Dues')],
  ['customerAdvances', t('Advances')],
];
/** Where the money came from: bill payments, order advances / part payments, dues collected and customer advances. */
const collectedCaption = (by) => {
  const parts = COLLECTION_PARTS.filter(([key]) => by?.[key] > 0).map(([key, label]) => `${label} ${formatINR(by[key], { decimals: 0 })}`);
  return parts.length ? parts.join(' · ') : t('Bills, orders, dues and advances');
};
// Phones: tighter gaps between panels, so more of the dashboard fits on a screen.
const GAP = { xs: 1.5, sm: 2.5 };
const metalName = (m) => t(m.charAt(0).toUpperCase() + m.slice(1));
const inr = (p) => formatINR(p, { decimals: 0 });
const DUE = 'var(--mui-palette-error-main)';

const shortDay = (ymd, bucket) => {
  const d = new Date(`${ymd}T00:00:00`);
  if (bucket === 'month') return d.toLocaleDateString(getLocale(), { month: 'short', year: '2-digit' });
  return d.toLocaleDateString(getLocale(), { day: 'numeric', month: 'short' });
};
/** 0–23 → "9 am", "12 pm", "5 pm". */
const hourLabel = (h) => t(h < 12 ? '{{h}} am' : '{{h}} pm', { h: h % 12 || 12 });
const timeOf = (at) => new Date(at).toLocaleTimeString(getLocale(), { hour: 'numeric', minute: '2-digit' });
const dayOf = (at) => new Date(at).toLocaleDateString(getLocale(), { day: 'numeric', month: 'short' });

/** The branch at a glance: the period's figures, sales trend and mix, best sellers, stock, orders and latest bills. */
export default function BranchDashboard({ branchId }) {
  const canSeeMonth = usePermission('report.finance');
  const [period, setPeriod] = useState('today');
  const { data, isLoading, isFetching, error, refetch } = useBranchDashboardQuery({ branchId, period }, { skip: !branchId });
  const phone = useMediaQuery((theme) => theme.breakpoints.down('sm'));

  if (isLoading || !data) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const { sales, orders, stock } = data;
  const monthly = data.range.bucket === 'month';
  const phrase = periodPhrase(period);

  return (
    <Box sx={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity 150ms' }}>
      {/* Which branch and dates, and the period. */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25} sx={{ mb: { xs: 1.75, sm: 2.25 }, alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
        <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', minWidth: 0 }}>
          <Box sx={(theme) => ({ width: 36, height: 36, flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', ...goldBg(theme), color: 'var(--brand-contrast)' })}>
            <PlaceOutlinedIcon sx={{ fontSize: 19 }} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography noWrap sx={{ fontWeight: 700, fontSize: { xs: '1rem', sm: '1.0625rem' }, lineHeight: 1.25 }}>
              {data.branch.name}
            </Typography>
            <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', color: 'text.secondary' }}>
              <CalendarMonthOutlinedIcon sx={{ fontSize: 13 }} />
              <Typography variant="caption" noWrap>
                {data.range.from === data.range.to ? formatDate(data.range.from) : `${formatDate(data.range.from)} – ${formatDate(data.range.to)}`}
              </Typography>
            </Stack>
          </Box>
        </Stack>
        <PeriodSwitch value={period} options={PERIODS} onChange={setPeriod} short={phone} />
      </Stack>

      {sales && (
        <SummaryCards>
          <SummaryCard hideCaptionOnPhone icon={ReceiptLongOutlinedIcon} label={t('Sales · {{periodPhrase}}', { periodPhrase: phrase })} value={inr(sales.period.revenuePaise)} caption={t('{{bills}} bills · avg {{averageBill}}', { bills: sales.period.bills, averageBill: inr(sales.period.averageBillPaise) })} tone="blue" />
          <SummaryCard hideCaptionOnPhone icon={PaymentsOutlinedIcon} label={t('Collected · {{periodPhrase}}', { periodPhrase: phrase })} value={inr(sales.period.collectedPaise)} caption={collectedCaption(sales.period.collectedBreakdown)} tone="green" valueTone="paid" />
          <SummaryCard hideCaptionOnPhone icon={PendingActionsOutlinedIcon} label={t('Due · {{periodPhrase}}', { periodPhrase: phrase })} value={inr(sales.period.creditDuePaise)} caption={sales.period.dueBills ? (sales.period.dueBills === 1 ? t('{{dueBills}} bill still unpaid', { dueBills: sales.period.dueBills }) : t('{{dueBills}} bills still unpaid', { dueBills: sales.period.dueBills })) : t('Nothing due')} tone={sales.period.creditDuePaise ? 'red' : 'green'} valueTone={sales.period.creditDuePaise ? 'due' : undefined} />
          <SummaryCard hideCaptionOnPhone icon={DiamondOutlinedIcon} label={t('Items sold')} value={sales.period.items} caption={sales.period.discountPaise ? t('{{grossWeight}} gross · {{discount}} discount', { grossWeight: formatWeight(sales.period.grossWeightMg), discount: inr(sales.period.discountPaise) }) : t('{{grossWeight}} gross', { grossWeight: formatWeight(sales.period.grossWeightMg) })} tone="amber" />
        </SummaryCards>
      )}

      <Grid container spacing={GAP}>
        {sales && (
          <>
            <Grid size={{ xs: 12, lg: 8 }}>
              <Panel
                icon={ShowChartRoundedIcon}
                title={t('Sales trend')}
                subtitle={sales.hourly ? t('Bill totals per hour · {{periodPhrase}}', { periodPhrase: phrase }) : monthly ? t('Bill totals per month · {{periodPhrase}}', { periodPhrase: phrase }) : t('Bill totals per day · {{periodPhrase}}', { periodPhrase: phrase })}
                action={
                  <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                    <Typography sx={{ fontFamily: fonts.display, fontWeight: 700, fontSize: { xs: 20, sm: 24 }, lineHeight: 1, color: 'var(--brand-strong)' }}>{inr(sales.period.revenuePaise)}</Typography>
                    <Typography variant="caption" color="textSecondary">
                      {sales.period.bills === 1 ? t('{{count}} bill', { count: sales.period.bills }) : t('{{count}} bills', { count: sales.period.bills })}
                    </Typography>
                  </Box>
                }
              >
                <AreaChart
                  height={phone ? 170 : 250}
                  data={
                    sales.hourly
                      ? sales.hourly.map((h) => ({ key: h.hour, label: hourLabel(h.hour), value: h.totalPaise, detail: h.bills === 1 ? t('{{hourLabel}} – {{hourLabel2}} · {{bills}} bill', { hourLabel: hourLabel(h.hour), hourLabel2: hourLabel((h.hour + 1) % 24), bills: h.bills }) : t('{{hourLabel}} – {{hourLabel2}} · {{bills}} bills', { hourLabel: hourLabel(h.hour), hourLabel2: hourLabel((h.hour + 1) % 24), bills: h.bills }) }))
                      : sales.daily.map((d) => ({ key: d.date, label: shortDay(d.date, data.range.bucket), value: d.totalPaise, detail: t(d.bills === 1 ? '{{date}} · {{bills}} bill' : '{{date}} · {{bills}} bills', { date: monthly ? shortDay(d.date, 'month') : formatDate(d.date), bills: d.bills }) }))
                  }
                />
              </Panel>
            </Grid>
            <Grid size={{ xs: 12, lg: 4 }}>
              <PaymentMix rows={sales.byPaymentMode} />
            </Grid>
          </>
        )}

        {canSeeMonth && (
          <Grid size={12}>
            <MonthSales branchId={branchId} />
          </Grid>
        )}

        {sales && (
          <Grid size={{ xs: 12, md: 6, lg: 4 }}>
            <Panel icon={CategoryOutlinedIcon} title={t('Top categories')} subtitle={t('Value sold · {{periodPhrase}}', { periodPhrase: phrase })}>
              <RankList rows={sales.byCategory.map((c) => ({ key: c.key, label: tValue(c.label), value: c.value, caption: c.extra === 1 ? t('{{extra}} item', { extra: c.extra }) : t('{{extra}} items', { extra: c.extra }) }))} formatValue={inr} empty={t('No items sold yet')} />
            </Panel>
          </Grid>
        )}
        {sales && (
          <Grid size={{ xs: 12, md: 6, lg: 4 }}>
            <Panel icon={PeopleAltOutlinedIcon} title={t('Top customers')} subtitle={t('Who bought the most · {{periodPhrase}}', { periodPhrase: phrase })} action={<PanelLink to="/customers">{t('All')}</PanelLink>}>
              <RankList avatar rows={(sales.topCustomers ?? []).map((c) => ({ key: String(c.id), label: c.name, value: c.value, to: `/customers/${c.id}`, caption: c.bills === 1 ? t('{{count}} bill', { count: c.bills }) : t('{{count}} bills', { count: c.bills }) }))} formatValue={inr} empty={t('No customer bills in this period')} />
            </Panel>
          </Grid>
        )}
        {stock && (
          <Grid size={{ xs: 12, md: 6, lg: 4 }}>
            <StockPanel stock={stock} />
          </Grid>
        )}

        {orders && (
          <Grid size={{ xs: 12, md: 6, lg: 5 }}>
            <OrdersPanel orders={orders} />
          </Grid>
        )}
        {sales && (
          <Grid size={{ xs: 12, lg: orders ? 7 : 12 }}>
            <RecentBills bills={phone ? sales.recent.slice(0, 5) : sales.recent} />
          </Grid>
        )}
      </Grid>
    </Box>
  );
}

/** Money received by mode, as a ring; what was left on credit is owed, not received, so it sits apart below. */
function PaymentMix({ rows }) {
  const received = rows.filter((r) => r.key !== 'credit').map((r) => ({ ...r, label: t(r.label) }));
  const credit = rows.find((r) => r.key === 'credit')?.value ?? 0;
  return (
    <Panel icon={PaymentsOutlinedIcon} title={t('Payment mix')} subtitle={t('Money received, by mode')}>
      <Box sx={{ display: 'grid', placeItems: 'center', pt: 0.5 }}>
        <DonutChart stacked rows={received} size={168} thickness={22} centerLabel={t('Received')} empty={t('No payments in this period')} />
      </Box>
      {credit > 0 && (
        <Stack direction="row" sx={{ mt: 2, px: 1.5, py: 1, borderRadius: 2, alignItems: 'center', justifyContent: 'space-between', bgcolor: 'rgba(155, 44, 44, 0.07)', border: '1px solid rgba(155, 44, 44, 0.2)' }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: DUE }}>
            {t('Left on credit')}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 800, color: DUE }}>
            {inr(credit)}
          </Typography>
        </Stack>
      )}
    </Panel>
  );
}

/** This month, day by day: sales only, with the month's total, the daily average and the best day. */
function MonthSales({ branchId }) {
  const { data } = useFinanceSummaryQuery({ branchId }, { skip: !branchId });
  if (!data) return null;
  const soFar = data.days.filter((d) => !d.future);
  const total = data.totals.salesPaise;
  const best = soFar.reduce((top, d) => (d.salesPaise > (top?.salesPaise ?? 0) ? d : top), null);
  const month = new Date(`${data.month}-01T00:00:00`).toLocaleDateString(getLocale(), { month: 'long', year: 'numeric' });
  return (
    <Panel icon={CalendarMonthOutlinedIcon} title={t('Sales this month')} subtitle={t('Every day of {{monthName}}', { monthName: month })} action={<PanelLink to="/sales">{t('Invoices')}</PanelLink>}>
      <Grid container spacing={2.5} sx={{ alignItems: 'center' }}>
        <Grid size={{ xs: 12, md: 9 }}>
          <SalesExpenseChart days={data.days} height={210} salesOnly />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <Stack direction={{ xs: 'row', md: 'column' }} spacing={1.25}>
            <StatTile label={t('Sales')} value={inr(total)} />
            <StatTile label={t('Daily average')} value={inr(soFar.length ? Math.round(total / soFar.length) : 0)} />
            <StatTile label={best ? t('Best day ({{day}})', { day: Number(best.date.slice(8)) }) : t('Best day')} value={inr(best?.salesPaise ?? 0)} tone="success.main" />
          </Stack>
        </Grid>
      </Grid>
    </Panel>
  );
}

/** Pieces and weight in stock, then each purity's share of the weight. */
function StockPanel({ stock }) {
  const top = stock.byPurity.slice(0, 5);
  return (
    <Panel icon={Inventory2OutlinedIcon} title={t('Stock in hand')} subtitle={t('By purity, share of gross weight')} action={<PanelLink to="/inventory">{t('Stock')}</PanelLink>}>
      <Stack direction="row" spacing={1.25} sx={{ mb: 2 }}>
        <StatTile label={t('pieces')} value={stock.items} />
        <StatTile label={t('gross weight')} value={formatWeight(stock.grossWeightMg)} />
      </Stack>
      {top.length === 0 ? (
        <EmptyNote>{t('Nothing in stock at this branch')}</EmptyNote>
      ) : (
        <Stack spacing={1.5}>
          {top.map((p) => (
            <Box key={p.key}>
              <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'baseline', mb: 0.5 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {metalName(p.metal)} {purityLabel(p.metal, p.purity)}
                  <Typography component="span" variant="caption" color="textSecondary" sx={{ ml: 0.75 }}>
                    {t('{{items}} pcs', { items: p.items })}
                  </Typography>
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                  {formatWeight(p.value)}
                </Typography>
              </Stack>
              <ShareBar share={stock.grossWeightMg ? p.value / stock.grossWeightMg : 0} />
            </Box>
          ))}
        </Stack>
      )}
    </Panel>
  );
}

/** Orders as a pipeline (booked → in progress → ready), what needs attention, and what is due this week. */
function OrdersPanel({ orders }) {
  const steps = ['booked', 'in_progress', 'ready'];
  return (
    <Panel icon={AssignmentOutlinedIcon} title={t('Customer orders')} subtitle={t('Open now · due this week')} action={<PanelLink to="/orders">{t('All orders')}</PanelLink>}>
      <Box sx={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', mb: 2 }}>
        {/* The line the steps sit on. */}
        <Box sx={{ position: 'absolute', top: 19, left: '16%', right: '16%', height: 2, bgcolor: 'rgba(var(--brand-rgb), 0.25)' }} />
        {steps.map((s, i) => (
          <Box key={s} sx={{ position: 'relative', textAlign: 'center' }}>
            <Box sx={(theme) => ({ mx: 'auto', width: 40, height: 40, borderRadius: '50%', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: '1.0625rem', border: '2px solid', borderColor: 'background.paper', boxShadow: '0 0 0 1px rgba(var(--brand-rgb), 0.35)', ...(i === 2 ? { ...goldBg(theme), color: 'var(--brand-contrast)' } : { bgcolor: 'background.paper', color: 'text.primary' }) })}>{orders.byStatus[s]}</Box>
            <Typography variant="caption" color="textSecondary" noWrap component="div" sx={{ mt: 0.5, fontWeight: 600 }}>
              {ORDER_STATUS_LABELS[s]}
            </Typography>
          </Box>
        ))}
      </Box>
      {(orders.overdue > 0 || orders.urgent > 0 || orders.advanceHeldPaise > 0) && (
        <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap', mb: 1.75 }}>
          {orders.overdue > 0 && <Pill tone="due">{t('{{count}} overdue', { count: orders.overdue })}</Pill>}
          {orders.urgent > 0 && <Pill tone="warn">{t('{{count}} urgent', { count: orders.urgent })}</Pill>}
          {orders.advanceHeldPaise > 0 && <Pill>{t('Advance held {{amount}}', { amount: inr(orders.advanceHeldPaise) })}</Pill>}
        </Stack>
      )}
      {orders.upcoming.length === 0 ? (
        <EmptyNote>{t('Nothing due this week')}</EmptyNote>
      ) : (
        <Stack spacing={1}>
          {orders.upcoming.map((o) => (
            <ButtonBase key={o.id} component={RouterLink} to={`/orders/${o.id}`} sx={{ justifyContent: 'flex-start', textAlign: 'left', gap: 1.25, p: 1, borderRadius: 2, border: 1, borderColor: o.overdue ? 'rgba(155, 44, 44, 0.3)' : 'divider', '&:hover': { bgcolor: 'action.hover' } }}>
              <DateBadge ymd={o.expectedDate} overdue={o.overdue} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                  {tValue(o.customer)}
                </Typography>
                <Typography variant="caption" color="textSecondary" noWrap component="div">
                  {o.orderNo}
                  {o.priority === 'urgent' ? ` · ${t('Urgent')}` : ''}
                </Typography>
              </Box>
              <OrderStatusChip status={o.status} />
            </ButtonBase>
          ))}
        </Stack>
      )}
    </Panel>
  );
}

/** The day of a date in a small calendar tile; red when it is past. */
function DateBadge({ ymd, overdue }) {
  const d = new Date(`${ymd}T00:00:00`);
  return (
    <Box sx={{ width: 40, flexShrink: 0, borderRadius: 1.5, overflow: 'hidden', textAlign: 'center', border: 1, borderColor: overdue ? 'rgba(155, 44, 44, 0.35)' : 'rgba(var(--brand-rgb), 0.35)' }}>
      <Box sx={{ fontSize: '0.5625rem', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', py: 0.25, color: '#fff', bgcolor: overdue ? DUE : 'var(--brand-strong)' }}>{d.toLocaleDateString(getLocale(), { month: 'short' })}</Box>
      <Box sx={{ fontWeight: 800, fontSize: '0.9375rem', py: 0.25, color: overdue ? DUE : 'text.primary' }}>{d.getDate()}</Box>
    </Box>
  );
}

function Pill({ tone, children }) {
  const style = tone === 'due' ? { color: DUE, bgcolor: 'rgba(155, 44, 44, 0.08)' } : tone === 'warn' ? { color: 'warning.main', bgcolor: 'rgba(183, 121, 31, 0.1)' } : { color: 'var(--brand-strong)', bgcolor: 'rgba(var(--brand-rgb), 0.1)' };
  return <Box sx={{ px: 1.25, py: 0.375, borderRadius: 999, fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap', ...style }}>{children}</Box>;
}

/** The latest bills: who, which invoice and when, and the amount. */
function RecentBills({ bills }) {
  return (
    <Panel icon={ReceiptLongOutlinedIcon} title={t('Recent bills')} subtitle={t('The latest invoices at this branch')} action={<PanelLink to="/sales">{t('All invoices')}</PanelLink>}>
      {bills.length === 0 ? (
        <EmptyNote>{t('No bills yet')}</EmptyNote>
      ) : (
        <Grid container spacing={1}>
          {bills.map((s) => (
            <Grid key={s.id} size={{ xs: 12, sm: 6 }}>
              <ButtonBase component={RouterLink} to={`/sales/${s.id}`} sx={{ width: '100%', justifyContent: 'flex-start', textAlign: 'left', gap: 1.25, p: 1.25, borderRadius: 2, border: 1, borderColor: 'divider', transition: 'border-color .15s, background-color .15s', '&:hover': { bgcolor: 'action.hover', borderColor: 'rgba(var(--brand-rgb), 0.4)' } }}>
                <Initials name={tValue(s.customer)} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                    {tValue(s.customer)}
                  </Typography>
                  <Typography variant="caption" color="textSecondary" noWrap component="div">
                    {s.invoiceNo} · {dayOf(s.at)}, {timeOf(s.at)}
                  </Typography>
                </Box>
                <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                    {inr(s.totalPaise)}
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    {s.items === 1 ? t('{{count}} item', { count: s.items }) : t('{{count}} items', { count: s.items })}
                  </Typography>
                </Box>
              </ButtonBase>
            </Grid>
          ))}
        </Grid>
      )}
    </Panel>
  );
}
