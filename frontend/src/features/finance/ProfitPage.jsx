import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import { Box, Button, Card, CardContent, Divider, Grid, IconButton, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { formatINR } from '@jerp/shared';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import PageHeader from '../../components/PageHeader.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import SummaryCards, { SummaryCard } from '../../components/SummaryCards.jsx';
import { usePermission, useSession } from '../../hooks/usePermission.js';
import { MonthlyProfitBars, SalesExpenseChart } from './financeCharts.jsx';
import { useFinanceSummaryQuery } from './financeApi.js';

const inr = (p) => formatINR(p, { decimals: 0 });
const signed = (p) => `${p < 0 ? '−' : ''}${inr(Math.abs(p))}`;
const monthName = (m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const shiftMonth = (m, by) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1 + by, 1)).toISOString().slice(0, 7);
};
const thisMonth = () => new Date().toISOString().slice(0, 7);
const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);

/** "▲ 12% vs Sep" — how a figure moved against last month (for costs, up is bad). */
function change(now, before, { cost = false } = {}) {
  if (!before) return null;
  const delta = Math.round(((now - before) / Math.abs(before)) * 100);
  if (!delta) return 'Same as last month';
  return `${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)}% vs last month${cost ? (delta > 0 ? ' (higher)' : ' (lower)') : ''}`;
}

function Panel({ title, subtitle, action, children }) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: { xs: 1.75, sm: 2.5 }, '&:last-child': { pb: { xs: 1.75, sm: 2.5 } } }}>
        <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start', mb: { xs: 1.5, sm: 2 }, gap: 1 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h5" sx={{ fontSize: { xs: '0.9375rem', sm: '1rem' } }}>
              {title}
            </Typography>
            {subtitle && (
              <Typography variant="caption" color="textSecondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
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

/** One line of the profit statement; `total` lines are bold with a rule above. */
function Line({ label, value, minus, total, tone, hint }) {
  return (
    <>
      {total && <Divider sx={{ my: 0.75 }} />}
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', py: 0.6, gap: 1 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="body2" sx={{ fontWeight: total ? 700 : 500 }}>
            {minus && <Box component="span" sx={{ color: 'text.secondary', mr: 0.5 }}>−</Box>}
            {label}
          </Typography>
          {hint && (
            <Typography variant="caption" color="textSecondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
              {hint}
            </Typography>
          )}
        </Box>
        <Typography variant="body2" sx={{ fontWeight: total ? 800 : 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: tone ?? 'text.primary', fontSize: total ? '0.9375rem' : undefined }}>
          {signed(value)}
        </Typography>
      </Stack>
    </>
  );
}

/** Previous / next month around the month's name; no going past this month. */
function MonthSwitch({ month, onChange }) {
  return (
    <Stack direction="row" sx={{ alignItems: 'center', border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper', flexShrink: 0 }}>
      <IconButton size="small" aria-label="Previous month" onClick={() => onChange(shiftMonth(month, -1))}>
        <ChevronLeftRoundedIcon />
      </IconButton>
      <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 128, textAlign: 'center' }}>
        {monthName(month)}
      </Typography>
      <IconButton size="small" aria-label="Next month" onClick={() => onChange(shiftMonth(month, 1))} disabled={month >= thisMonth()}>
        <ChevronRightRoundedIcon />
      </IconButton>
    </Stack>
  );
}

/** The month at a glance (used on the Dashboard too): sales against expenses each day, and the bottom line. */
export function ProfitSnapshot({ data, onOpen }) {
  const t = data.totals;
  return (
    <Panel
      title="Sales vs expenses"
      subtitle={`Every day of ${monthName(data.month)} — expenses are shop expenses and salary`}
      action={
        onOpen && (
          <Button size="small" onClick={onOpen} sx={{ flexShrink: 0 }}>
            Profit & loss
          </Button>
        )
      }
    >
      <SalesExpenseChart days={data.days} height={230} />
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1, mt: 2, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
        {[
          ['Sales', t.salesPaise, 'text.primary'],
          ['Expenses', t.expensesPaise, 'text.primary'],
          ['Net profit', t.netProfitPaise, t.netProfitPaise < 0 ? 'error.main' : 'success.main'],
        ].map(([label, value, color]) => (
          <Box key={label} sx={{ minWidth: 0 }}>
            <Typography variant="caption" color="textSecondary">
              {label}
            </Typography>
            <Typography sx={{ fontWeight: 800, fontSize: { xs: '0.9375rem', sm: '1.125rem' }, color, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {signed(value)}
            </Typography>
          </Box>
        ))}
      </Box>
    </Panel>
  );
}

export default function ProfitPage() {
  const navigate = useNavigate();
  const { data: session } = useSession();
  const canSeeExpenses = usePermission('expense.view');
  const [month, setMonth] = useState(thisMonth());
  const [branchId, setBranchId] = useState('');
  const { data, isLoading, isFetching, error, refetch } = useFinanceSummaryQuery({ month, ...(branchId && { branchId }) });
  const branches = session?.branches ?? [];

  const t = data?.totals;
  const p = data?.previous;
  const maxCategory = Math.max(1, ...(data?.byCategory ?? []).map((c) => c.amountPaise), t?.salaryPaise ?? 0);

  return (
    <>
      <PageHeader
        title="Profit & loss"
        subtitle="What the shop sold, what it cost, what it spent — and what is left."
        actions={
          <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            {branches.length > 1 && (
              <TextField select size="small" value={branchId} onChange={(e) => setBranchId(e.target.value)} sx={{ minWidth: 160 }} slotProps={{ select: { displayEmpty: true } }}>
                <MenuItem value="">All branches</MenuItem>
                {branches.map((b) => (
                  <MenuItem key={b.id} value={b.id}>
                    {b.name}
                  </MenuItem>
                ))}
              </TextField>
            )}
            <MonthSwitch month={month} onChange={setMonth} />
          </Stack>
        }
      />

      {isLoading ? (
        <LoadingState label="Working out the month" />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <Box sx={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity 150ms' }}>
          <SummaryCards>
            <SummaryCard icon={ReceiptLongOutlinedIcon} label="Total sales" value={inr(t.salesPaise)} caption={change(t.salesPaise, p.salesPaise) ?? 'Before GST, less returns'} tone="blue" />
            <SummaryCard icon={Inventory2OutlinedIcon} label="Cost of goods" value={inr(t.cogsPaise)} caption="What the pieces sold cost" tone="grey" />
            <SummaryCard icon={TrendingUpRoundedIcon} label="Gross profit" value={signed(t.grossProfitPaise)} caption={`${pct(t.grossProfitPaise, t.salesPaise)}% margin`} tone="gold" />
            <SummaryCard icon={PaymentsOutlinedIcon} label="Expenses" value={inr(t.expensesPaise)} caption={change(t.expensesPaise, p.expensesPaise, { cost: true }) ?? 'Shop expenses + salary'} tone="amber" />
            <SummaryCard
              icon={AccountBalanceWalletOutlinedIcon}
              label="Net profit"
              value={signed(t.netProfitPaise)}
              caption={change(t.netProfitPaise, p.netProfitPaise) ?? (t.netProfitPaise < 0 ? 'Loss this month' : 'After every cost')}
              tone={t.netProfitPaise < 0 ? 'red' : 'green'}
              valueTone={t.netProfitPaise < 0 ? 'due' : 'paid'}
              hideCaptionOnPhone={false}
            />
          </SummaryCards>

          <Grid container spacing={{ xs: 1.5, sm: 2 }} sx={{ mb: { xs: 1.5, sm: 2 } }}>
            <Grid size={{ xs: 12, lg: 8 }}>
              <ProfitSnapshot data={data} />
            </Grid>
            <Grid size={{ xs: 12, lg: 4 }}>
              <Panel title="Profit statement" subtitle={monthName(month)}>
                <Line label="Sales" value={t.salesPaise} hint="Bills before GST, less returns" />
                <Line label="Cost of goods sold" value={t.cogsPaise} minus hint="Cost of the pieces sold" />
                <Line label="Gross profit" value={t.grossProfitPaise} total tone="var(--brand-strong)" />
                <Line label="Shop expenses" value={t.shopExpensesPaise} minus />
                <Line label="Salary" value={t.salaryPaise} minus hint="Finalised payroll for this month" />
                {t.otherPaise !== 0 && <Line label="Stock written off & round-off" value={t.otherPaise} minus />}
                <Line label="Net profit" value={t.netProfitPaise} total tone={t.netProfitPaise < 0 ? 'error.main' : 'success.main'} />
              </Panel>
            </Grid>
          </Grid>

          <Grid container spacing={{ xs: 1.5, sm: 2 }}>
            <Grid size={{ xs: 12, md: 6, lg: 5 }}>
              <Panel title="Net profit by month" subtitle="The last six months">
                <MonthlyProfitBars months={data.months} />
              </Panel>
            </Grid>
            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <Panel
                title="Where the money went"
                subtitle="Expenses by head"
                action={
                  canSeeExpenses && (
                    <Button size="small" onClick={() => navigate('/expenses')} sx={{ flexShrink: 0 }}>
                      Expenses
                    </Button>
                  )
                }
              >
                {!data.byCategory.length && !t.salaryPaise ? (
                  <Typography variant="body2" color="textSecondary" sx={{ py: 3, textAlign: 'center' }}>
                    No expenses this month
                  </Typography>
                ) : (
                  <Stack spacing={1.25}>
                    {[...(t.salaryPaise ? [{ name: 'Salary (payroll)', amountPaise: t.salaryPaise }] : []), ...data.byCategory]
                      .sort((a, b) => b.amountPaise - a.amountPaise)
                      .map((c) => (
                        <Box key={c.name}>
                          <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1, mb: 0.4 }}>
                            <Typography variant="body2" noWrap>
                              {c.name}
                            </Typography>
                            <Typography variant="body2" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                              {inr(c.amountPaise)}
                              <Typography component="span" variant="caption" color="textSecondary" sx={{ ml: 0.75 }}>
                                {pct(c.amountPaise, t.expensesPaise)}%
                              </Typography>
                            </Typography>
                          </Stack>
                          <Box sx={{ height: 6, borderRadius: 3, bgcolor: 'action.hover', overflow: 'hidden' }}>
                            <Box sx={{ height: '100%', width: `${(c.amountPaise / maxCategory) * 100}%`, borderRadius: 3, bgcolor: 'var(--brand-strong)' }} />
                          </Box>
                        </Box>
                      ))}
                  </Stack>
                )}
              </Panel>
            </Grid>
            <Grid size={{ xs: 12, lg: 3 }}>
              <Panel title="Suppliers & stock" subtitle="Cash, not profit — stock reaches profit when sold">
                <Line label="Bought this month" value={data.cash.purchasesPaise} hint={`${data.cash.purchaseBills} purchase bill${data.cash.purchaseBills === 1 ? '' : 's'}`} />
                <Line label="Paid to suppliers" value={data.cash.paidToSuppliersPaise} hint="Cash, bank and UPI this month" />
                <Line label="Still due to suppliers" value={data.cash.supplierDuePaise} total tone={data.cash.supplierDuePaise ? 'error.main' : 'success.main'} />
              </Panel>
            </Grid>
          </Grid>
        </Box>
      )}
    </>
  );
}
