import DiamondOutlinedIcon from '@mui/icons-material/DiamondOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import { Box, Card, CardContent, Divider, Grid, Link, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { formatINR, formatWeight, ORDER_STATUS_LABELS } from '@jerp/shared';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router';
import SummaryCards, { SummaryCard } from '../../components/SummaryCards.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import { formatDate, formatDateTime } from '../../utils/format.js';
import { OrderStatusChip } from '../orders/orderUi.jsx';
import { purityLabel } from '../products/productForm.js';
import { BarList, compactINR } from './charts.jsx';
import { AreaChart, DonutChart, StackedBar } from './shareCharts.jsx';
import { useBranchDashboardQuery } from './dashboardApi.js';

const PERIODS = [7, 30, 90];
const metalName = (m) => m.charAt(0).toUpperCase() + m.slice(1);

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

const shortDay = (ymd, days) => {
  const d = new Date(`${ymd}T00:00:00`);
  return days <= 7 ? d.toLocaleDateString('en-IN', { weekday: 'short' }) : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

/** The branch at a glance: today, the period's sales trend and mix, collections, orders and stock. */
export default function BranchDashboard({ branchId }) {
  const [days, setDays] = useState(30);
  const { data, isLoading, isFetching, error, refetch } = useBranchDashboardQuery({ branchId, days }, { skip: !branchId });

  if (isLoading || !data) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  const { sales, orders, stock } = data;

  return (
    <Box sx={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity 150ms' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 2.5, alignItems: { sm: 'center' }, justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h4">{data.branch.name}</Typography>
          <Typography variant="caption" color="textSecondary">
            {formatDate(data.range.from)} – {formatDate(data.range.to)}
          </Typography>
        </Box>
        <ToggleButtonGroup exclusive size="small" value={days} onChange={(e, v) => v && setDays(v)} aria-label="Period">
          {PERIODS.map((p) => (
            <ToggleButton key={p} value={p} sx={{ px: 1.75 }}>
              Last {p} days
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Stack>

      {sales && (
        <SummaryCards>
          <SummaryCard icon={TrendingUpRoundedIcon} label="Today's sales" value={formatINR(sales.today.revenuePaise, { decimals: 0 })} caption={`${sales.today.bills} bill${sales.today.bills === 1 ? '' : 's'} today`} />
          <SummaryCard icon={PaymentsOutlinedIcon} label="Collected today" value={formatINR(sales.today.collectedPaise, { decimals: 0 })} caption="Cash, card, UPI and bank" tone="green" valueTone="paid" />
          <SummaryCard icon={ReceiptLongOutlinedIcon} label={`Sales · last ${days} days`} value={compactINR(sales.period.revenuePaise)} caption={`${sales.period.bills} bills · avg ${formatINR(sales.period.averageBillPaise, { decimals: 0 })}`} tone="blue" />
          <SummaryCard icon={DiamondOutlinedIcon} label="Items sold" value={sales.period.items} caption={`${formatWeight(sales.period.grossWeightMg)} gross${sales.period.discountPaise ? ` · ${compactINR(sales.period.discountPaise)} discount` : ''}`} tone="amber" />
        </SummaryCards>
      )}

      {sales && (
        <Grid container spacing={2} sx={{ mb: 2.5 }}>
          <Grid size={{ xs: 12, lg: 8 }}>
            <Panel title="Sales trend" subtitle={`Bill totals per day · last ${days} days`}>
              <AreaChart data={sales.daily.map((d) => ({ key: d.date, label: shortDay(d.date, days), value: d.totalPaise, detail: `${formatDate(d.date)} · ${d.bills} bill${d.bills === 1 ? '' : 's'}` }))} />
            </Panel>
          </Grid>
          <Grid size={{ xs: 12, lg: 4 }}>
            <Panel title="Payment mix" subtitle="How customers paid">
              <DonutChart rows={sales.byPaymentMode} centerLabel="Total billed" empty="No payments in this period" />
            </Panel>
          </Grid>
        </Grid>
      )}

      <Grid container spacing={2} sx={{ mb: 2.5 }}>
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
              <Stack direction="row" spacing={3} sx={{ mb: 2 }}>
                <Box>
                  <Typography sx={{ fontSize: '1.5rem', fontWeight: 800, lineHeight: 1.1 }}>{stock.items}</Typography>
                  <Typography variant="caption" color="textSecondary">
                    pieces
                  </Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '1.5rem', fontWeight: 800, lineHeight: 1.1 }}>{formatWeight(stock.grossWeightMg)}</Typography>
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
              <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', mb: 2 }}>
                {[
                  ['booked', orders.byStatus.booked],
                  ['in_progress', orders.byStatus.in_progress],
                  ['ready', orders.byStatus.ready],
                ].map(([s, n]) => (
                  <Box key={s} sx={{ flex: '1 1 0', minWidth: 72, px: 1, py: 0.75, borderRadius: 2, bgcolor: 'action.hover', textAlign: 'center' }}>
                    <Typography sx={{ fontWeight: 800, fontSize: '1.15rem', lineHeight: 1.2 }}>{n}</Typography>
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
                <Typography variant="body2" color="textSecondary" sx={{ py: 2, textAlign: 'center' }}>
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
          <Grid container spacing={1.5}>
            {sales.recent.map((s) => (
              <Grid key={s.id} size={{ xs: 12, sm: 6, lg: 4 }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', p: 1.25, borderRadius: 2, border: 1, borderColor: 'divider' }}>
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
