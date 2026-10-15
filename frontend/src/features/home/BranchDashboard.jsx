import DiamondOutlinedIcon from '@mui/icons-material/DiamondOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import { Box, Card, CardContent, Divider, Grid, Link, Stack, ToggleButton, ToggleButtonGroup, Typography, useMediaQuery } from '@mui/material';
import { formatINR, formatWeight, ORDER_STATUS_LABELS } from '@jerp/shared';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router';
import ClampText from '../../components/ClampText.jsx';
import SummaryCards, { SummaryCard } from '../../components/SummaryCards.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import { formatDate, formatDateTime } from '../../utils/format.js';
import { OrderStatusChip } from '../orders/orderUi.jsx';
import { purityLabel } from '../products/productForm.js';
import { BarList } from './charts.jsx';
import { AreaChart, ShareBars, StackedBar } from './shareCharts.jsx';
import { useBranchDashboardQuery } from './dashboardApi.js';

// The same three periods on every dashboard; all time (since the branch's first bill) is the default.
const PERIODS = [
  { value: 'today', label: 'Today', phrase: 'today' },
  { value: 'month', label: 'This month', phrase: 'this month' },
  { value: 'all', label: 'All time', short: 'All', phrase: 'all time' },
];
const periodPhrase = (v) => PERIODS.find((p) => p.value === v)?.phrase ?? '';
// Phones: tighter gaps between cards, so more of the dashboard fits on a screen.
const GAP = { xs: 1.5, sm: 2 };
const ROW_GAP = { xs: 1.5, sm: 2.5 };
const metalName = (m) => m.charAt(0).toUpperCase() + m.slice(1);

function Panel({ title, subtitle, action, children }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: { xs: 1.75, sm: 2.5 }, '&:last-child': { pb: { xs: 1.75, sm: 2.5 } } }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', mb: { xs: 1.5, sm: 2 }, gap: 1 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h5" sx={{ fontSize: { xs: '0.9375rem', sm: '1rem' } }}>{title}</Typography>
            {subtitle && (
              <ClampText lines={2} lineHeight={1.4} variant="caption" color="textSecondary" sx={{ mt: 0.25 }}>
                {subtitle}
              </ClampText>
            )}
          </Box>
          {action}
        </Stack>
        {children}
      </CardContent>
    </Card>
  );
}

const shortDay = (ymd, bucket) => {
  const d = new Date(`${ymd}T00:00:00`);
  if (bucket === 'month') return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

/** The branch at a glance: today, the period's sales trend and mix, collections, orders and stock. */
export default function BranchDashboard({ branchId }) {
  const [period, setPeriod] = useState('all');
  const { data, isLoading, isFetching, error, refetch } = useBranchDashboardQuery({ branchId, period }, { skip: !branchId });
  const phone = useMediaQuery((theme) => theme.breakpoints.down('sm'));

  if (isLoading || !data) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const { sales, orders, stock } = data;
  const monthly = data.range.bucket === 'month';

  return (
    <Box sx={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity 150ms' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={{ xs: 1.25, sm: 1.5 }} sx={{ mb: ROW_GAP, alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="h4" noWrap sx={{ fontSize: { xs: '1.0625rem', sm: '1.125rem' } }}>
            {data.branch.name}
          </Typography>
          <Typography variant="caption" color="textSecondary">
            {formatDate(data.range.from)} – {formatDate(data.range.to)}
          </Typography>
        </Box>
        {/* Phones: three equal segments across the width, with short labels. */}
        <ToggleButtonGroup exclusive size="small" value={period} onChange={(e, v) => v && setPeriod(v)} aria-label="Period" sx={{ width: { xs: '100%', sm: 'auto' } }}>
          {PERIODS.map(({ value, label, short }) => (
            <ToggleButton key={value} value={value} sx={{ px: { xs: 1, sm: 1.75 }, flex: { xs: 1, sm: 'none' } }}>
              {phone && short ? short : label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>

      {sales && (
        <SummaryCards>
          <SummaryCard hideCaptionOnPhone icon={ReceiptLongOutlinedIcon} label={`Sales · ${periodPhrase(period)}`} value={formatINR(sales.period.revenuePaise, { decimals: 0 })} caption={`${sales.period.bills} bills · avg ${formatINR(sales.period.averageBillPaise, { decimals: 0 })}`} tone="blue" />
          <SummaryCard hideCaptionOnPhone icon={PaymentsOutlinedIcon} label={`Collected · ${periodPhrase(period)}`} value={formatINR(sales.period.collectedPaise, { decimals: 0 })} caption="Cash, card, UPI and bank" tone="green" valueTone="paid" />
          <SummaryCard hideCaptionOnPhone icon={PendingActionsOutlinedIcon} label={`Due · ${periodPhrase(period)}`} value={formatINR(sales.period.creditDuePaise, { decimals: 0 })} caption={sales.period.dueBills ? `${sales.period.dueBills} bill${sales.period.dueBills === 1 ? '' : 's'} still unpaid` : 'Nothing due'} tone={sales.period.creditDuePaise ? 'red' : 'green'} valueTone={sales.period.creditDuePaise ? 'due' : undefined} />
          <SummaryCard hideCaptionOnPhone icon={DiamondOutlinedIcon} label="Items sold" value={sales.period.items} caption={`${formatWeight(sales.period.grossWeightMg)} gross${sales.period.discountPaise ? ` · ${formatINR(sales.period.discountPaise, { decimals: 0 })} discount` : ''}`} tone="amber" />
        </SummaryCards>
      )}

      {sales && (
        <Grid container spacing={GAP} sx={{ mb: ROW_GAP }}>
          <Grid size={{ xs: 12, lg: 8 }}>
            <Panel title="Sales trend" subtitle={`Bill totals per ${monthly ? 'month' : 'day'} · ${periodPhrase(period)}`}>
              <AreaChart
                height={phone ? 170 : 240}
                data={sales.daily.map((d) => ({ key: d.date, label: shortDay(d.date, data.range.bucket), value: d.totalPaise, detail: `${monthly ? shortDay(d.date, 'month') : formatDate(d.date)} · ${d.bills} bill${d.bills === 1 ? '' : 's'}` }))}
              />
            </Panel>
          </Grid>
          <Grid size={{ xs: 12, lg: 4 }}>
            <Panel title="Payment mix" subtitle="How customers paid">
              <ShareBars rows={sales.byPaymentMode} owedKeys={['credit']} totalLabel="Total billed" empty="No payments in this period" />
            </Panel>
          </Grid>
        </Grid>
      )}

      <Grid container spacing={GAP} sx={{ mb: ROW_GAP }}>
        {sales && (
          <Grid size={{ xs: 12, md: 6, lg: 4 }}>
            <Panel title="Sales by category" subtitle="Value sold · items">
              <BarList rows={sales.byCategory.map((c) => ({ ...c, caption: `${c.extra} item${c.extra === 1 ? '' : 's'}` }))} empty="No items sold yet" />
            </Panel>
          </Grid>
        )}
        {stock && (
          <Grid size={{ xs: 12, md: 6, lg: 4 }}>
            <Panel title="Stock in hand" subtitle="Share of gross weight by purity" action={<Link component={RouterLink} to="/inventory" variant="caption" sx={{ fontWeight: 600 }}>Stock summary</Link>}>
              <Stack direction="row" spacing={3} sx={{ mb: { xs: 1.5, sm: 2 } }}>
                <Box>
                  <Typography sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' }, fontWeight: 800, lineHeight: 1.1 }}>{stock.items}</Typography>
                  <Typography variant="caption" color="textSecondary">
                    pieces
                  </Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' }, fontWeight: 800, lineHeight: 1.1 }}>{formatWeight(stock.grossWeightMg)}</Typography>
                  <Typography variant="caption" color="textSecondary">
                    gross weight
                  </Typography>
                </Box>
              </Stack>
              <StackedBar
                rows={stock.byPurity.map((p) => ({ key: p.key, label: `${metalName(p.metal)} ${purityLabel(p.metal, p.purity)}`, value: p.value, caption: `${p.items} pcs` }))}
                formatValue={(v) => formatWeight(v)}
                empty="Nothing in stock at this branch"
              />
            </Panel>
          </Grid>
        )}
        {orders && (
          <Grid size={{ xs: 12, md: 12, lg: 4 }}>
            <Panel title="Customer orders" subtitle="Open now · due this week" action={<Link component={RouterLink} to="/orders" variant="caption" sx={{ fontWeight: 600 }}>All orders</Link>}>
              <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', mb: { xs: 1.5, sm: 2 } }}>
                {[
                  ['booked', orders.byStatus.booked],
                  ['in_progress', orders.byStatus.in_progress],
                  ['ready', orders.byStatus.ready],
                ].map(([s, n]) => (
                  <Box key={s} sx={{ flex: '1 1 0', minWidth: 72, px: 1, py: { xs: 0.5, sm: 0.75 }, borderRadius: 2, bgcolor: 'action.hover', textAlign: 'center' }}>
                    <Typography sx={{ fontWeight: 800, fontSize: { xs: '1.05rem', sm: '1.15rem' }, lineHeight: 1.2 }}>{n}</Typography>
                    <Typography variant="caption" color="textSecondary" noWrap>
                      {ORDER_STATUS_LABELS[s]}
                    </Typography>
                  </Box>
                ))}
                {orders.overdue > 0 && (
                  <Box sx={{ flex: '1 1 0', minWidth: 72, px: 1, py: 0.75, borderRadius: 2, bgcolor: 'rgba(198, 40, 40, 0.10)', textAlign: 'center' }}>
                    <Typography sx={{ fontWeight: 800, fontSize: '1.15rem', lineHeight: 1.2, color: 'error.main' }}>{orders.overdue}</Typography>
                    <Typography variant="caption" sx={{ color: 'error.main' }}>
                      Overdue
                    </Typography>
                  </Box>
                )}
              </Stack>
              {orders.upcoming.length === 0 ? (
                <Typography variant="body2" color="textSecondary" sx={{ py: { xs: 1, sm: 2 }, textAlign: 'center' }}>
                  Nothing due this week
                </Typography>
              ) : (
                <Stack divider={<Divider flexItem />} spacing={1.25}>
                  {orders.upcoming.map((o) => (
                    <Stack key={o.id} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Link component={RouterLink} to={`/orders/${o.id}`} variant="body2" underline="hover" sx={{ fontWeight: 600, color: 'text.primary' }}>
                          {o.orderNo}
                        </Link>
                        <Typography variant="caption" color="textSecondary" component="div" noWrap>
                          {o.customer}
                        </Typography>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="caption" sx={{ fontWeight: 600, color: o.overdue ? 'error.main' : 'text.secondary', display: 'block' }}>
                          {o.overdue ? 'Overdue · ' : ''}
                          {formatDate(o.expectedDate)}
                        </Typography>
                        <OrderStatusChip status={o.status} />
                      </Box>
                    </Stack>
                  ))}
                </Stack>
              )}
            </Panel>
          </Grid>
        )}
      </Grid>

      {sales && sales.recent.length > 0 && (
        <Panel title="Recent bills" action={<Link component={RouterLink} to="/sales" variant="caption" sx={{ fontWeight: 600 }}>All invoices</Link>}>
          {/* Phones: a plain list with rules between bills (the latest five); wider screens: a grid of small cards. */}
          <Grid container spacing={{ xs: 0, sm: 1.5 }}>
            {(phone ? sales.recent.slice(0, 5) : sales.recent).map((s, i, list) => (
              <Grid key={s.id} size={{ xs: 12, sm: 6, lg: 4 }}>
                <Stack
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: 'center', px: { xs: 0, sm: 1.25 }, py: { xs: 1.125, sm: 1.25 }, borderRadius: { xs: 0, sm: 2 }, border: '1px solid', borderColor: 'divider', borderWidth: { xs: i < list.length - 1 ? '0 0 1px' : 0, sm: '1px' } }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Link component={RouterLink} to={`/sales/${s.id}`} variant="body2" underline="hover" sx={{ fontWeight: 600, color: 'text.primary' }}>
                      {s.invoiceNo}
                    </Link>
                    <Typography variant="caption" color="textSecondary" component="div" noWrap>
                      {s.customer} · {formatDateTime(s.at)}
                    </Typography>
                  </Box>
                  <Typography variant="body2" sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {formatINR(s.totalPaise, { decimals: 0 })}
                  </Typography>
                </Stack>
              </Grid>
            ))}
          </Grid>
        </Panel>
      )}
    </Box>
  );
}
