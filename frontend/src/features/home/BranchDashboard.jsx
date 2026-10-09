import DiamondOutlinedIcon from '@mui/icons-material/DiamondOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import { Box, Card, CardContent, Divider, Grid, Link, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { formatINR, formatWeight, ORDER_STATUS_LABELS } from '@jerp/shared';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router';
import { MONEY_TONE } from '../../components/Amount.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import { tokens } from '../../theme/tokens.js';
import { formatDate, formatDateTime } from '../../utils/format.js';
import { OrderStatusChip } from '../orders/orderUi.jsx';
import { purityLabel } from '../products/productForm.js';
import { BarList, ColumnChart, compactINR } from './charts.jsx';
import { useBranchDashboardQuery } from './dashboardApi.js';

const PERIODS = [7, 30, 90];
const metalName = (m) => m.charAt(0).toUpperCase() + m.slice(1);

function Tile({ label, value, caption, icon: Icon, tone }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
        <Box sx={{ width: 38, height: 38, borderRadius: 2, flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: tone === 'due' ? 'rgba(155, 44, 44, 0.10)' : tone === 'paid' ? 'rgba(46, 107, 79, 0.10)' : 'rgba(201, 162, 39, 0.12)', color: tone ? MONEY_TONE[tone] : tokens.light.goldDark }}>
          <Icon fontSize="small" />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" color="textSecondary" sx={{ fontWeight: 500 }}>
            {label}
          </Typography>
          <Typography variant="h3" component="p" sx={{ fontWeight: 700, color: tone ? MONEY_TONE[tone] : 'text.primary', whiteSpace: 'nowrap', mt: 0.25 }}>
            {value}
          </Typography>
          {caption && (
            <Typography variant="caption" color="textSecondary" component="div">
              {caption}
            </Typography>
          )}
        </Box>
      </CardContent>
    </Card>
  );
}

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

      <Grid container spacing={2} sx={{ mb: 2.5 }}>
        {sales && (
          <>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <Tile label="Today's sales" icon={TrendingUpRoundedIcon} value={formatINR(sales.today.revenuePaise, { decimals: 0 })} caption={`${sales.today.bills} bill${sales.today.bills === 1 ? '' : 's'} today`} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <Tile label="Collected today" icon={PaymentsOutlinedIcon} tone="paid" value={formatINR(sales.today.collectedPaise, { decimals: 0 })} caption="Cash, card, UPI and bank" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <Tile
                label={`Sales · last ${days} days`}
                icon={ReceiptLongOutlinedIcon}
                value={compactINR(sales.period.revenuePaise)}
                caption={`${sales.period.bills} bills · avg ${formatINR(sales.period.averageBillPaise, { decimals: 0 })}`}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
              <Tile label="Items sold" icon={DiamondOutlinedIcon} value={sales.period.items} caption={`${formatWeight(sales.period.grossWeightMg)} gross${sales.period.discountPaise ? ` · ${compactINR(sales.period.discountPaise)} discount` : ''}`} />
            </Grid>
          </>
        )}
      </Grid>

      {sales && (
        <Grid container spacing={2} sx={{ mb: 2.5 }}>
          <Grid size={{ xs: 12, lg: 8 }}>
            <Panel title="Daily sales" subtitle={`Bill totals per day · last ${days} days`}>
              <ColumnChart
                data={sales.daily.map((d) => ({ key: d.date, label: shortDay(d.date, days), value: d.totalPaise, detail: `${formatDate(d.date)} · ${d.bills} bill${d.bills === 1 ? '' : 's'}` }))}
              />
            </Panel>
          </Grid>
          <Grid size={{ xs: 12, lg: 4 }}>
            <Panel title="Payment mix" subtitle="How bills were paid">
              <BarList rows={sales.byPaymentMode} empty="No payments in this period" />
            </Panel>
          </Grid>
          <Grid size={{ xs: 12, md: 6, lg: 4 }}>
            <Panel title="Sales by category" subtitle="Value sold · items">
              <BarList rows={sales.byCategory.map((c) => ({ ...c, caption: `${c.extra} item${c.extra === 1 ? '' : 's'}` }))} empty="No items sold yet" />
            </Panel>
          </Grid>
          <Grid size={{ xs: 12, md: 6, lg: 4 }}>
            <Panel title="Metal & purity sold" subtitle="Gross weight · value">
              <BarList rows={sales.byPurity.map((p) => ({ key: p.key, label: `${metalName(p.metal)} ${purityLabel(p.metal, p.purity)}`, value: p.value, caption: compactINR(p.extra) }))} formatValue={(v) => formatWeight(v)} empty="No metal sold yet" />
            </Panel>
          </Grid>
          {stock && (
            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <Panel title="Stock in hand" subtitle="Gross weight by purity" action={<Link component={RouterLink} to="/inventory" variant="caption" sx={{ fontWeight: 600 }}>Stock summary</Link>}>
                <BarList rows={stock.byPurity.map((p) => ({ key: p.key, label: `${metalName(p.metal)} ${purityLabel(p.metal, p.purity)}`, value: p.value, caption: `${p.items} item${p.items === 1 ? '' : 's'}` }))} formatValue={(v) => formatWeight(v)} empty="Nothing in stock at this branch" />
              </Panel>
            </Grid>
          )}
        </Grid>
      )}

      <Grid container spacing={2}>
        {orders && (
          <>
            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <Panel title="Orders by status" subtitle={`Open now, plus delivered and cancelled in the last ${days} days`}>
                <BarList rows={['booked', 'in_progress', 'ready', 'delivered', 'cancelled'].map((s) => ({ key: s, label: ORDER_STATUS_LABELS[s], value: orders.byStatus[s] }))} formatValue={(v) => String(v)} empty="No orders yet" />
              </Panel>
            </Grid>
            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <Panel title="Deliveries due" subtitle="Overdue and the next 7 days" action={<Link component={RouterLink} to="/orders" variant="caption" sx={{ fontWeight: 600 }}>All orders</Link>}>
                {orders.upcoming.length === 0 ? (
                  <Typography variant="body2" color="textSecondary" sx={{ py: 3, textAlign: 'center' }}>
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
          </>
        )}
        {sales && (
          <>
            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <Panel title="Top customers" subtitle={`By purchases · last ${days} days`}>
                <BarList rows={sales.topCustomers.map((c) => ({ key: String(c.id), label: c.name, value: c.value, caption: `${c.bills} bill${c.bills === 1 ? '' : 's'}` }))} empty="No named customers yet" />
              </Panel>
            </Grid>
            <Grid size={{ xs: 12, md: 6, lg: orders ? 12 : 4 }}>
              <Panel title="Recent bills" action={<Link component={RouterLink} to="/sales" variant="caption" sx={{ fontWeight: 600 }}>All invoices</Link>}>
                {sales.recent.length === 0 ? (
                  <Typography variant="body2" color="textSecondary" sx={{ py: 3, textAlign: 'center' }}>
                    No bills in this period
                  </Typography>
                ) : (
                  <Grid container spacing={1.5}>
                    {sales.recent.map((s) => (
                      <Grid key={s.id} size={{ xs: 12, sm: 6, lg: orders ? 4 : 12 }}>
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
                )}
              </Panel>
            </Grid>
          </>
        )}
      </Grid>
    </Box>
  );
}
