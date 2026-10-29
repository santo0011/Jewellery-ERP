import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import { Box, Button, Card, CardContent, Divider, Grid, IconButton, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { formatINR } from '@jerp/shared';
import { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import { useNavigate } from 'react-router';
import PageHeader from '../../components/PageHeader.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import SummaryCards, { SummaryCard } from '../../components/SummaryCards.jsx';
import { usePermission, useSession } from '../../hooks/usePermission.js';
import { MonthlyProfitBars, SalesExpenseChart } from './financeCharts.jsx';
import { useFinanceSummaryQuery } from './financeApi.js';
import { t, getLocale } from '../../i18n/index.js';

const inr = (p) => formatINR(p, { decimals: 0 });
const signed = (p) => `${p < 0 ? '−' : ''}${inr(Math.abs(p))}`;
const monthName = (m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString(getLocale(), { month: 'long', year: 'numeric', timeZone: 'UTC' });
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
  if (!delta) return t('Same as last month');
  return (delta > 0 ? (cost ? (delta > 0 ? t('▲ {{delta}}% vs last month (higher)', { delta: Math.abs(delta) }) : t('▲ {{delta}}% vs last month (lower)', { delta: Math.abs(delta) })) : t('▲ {{delta}}% vs last month', { delta: Math.abs(delta) })) : (cost ? (delta > 0 ? t('▼ {{delta}}% vs last month (higher)', { delta: Math.abs(delta) }) : t('▼ {{delta}}% vs last month (lower)', { delta: Math.abs(delta) })) : t('▼ {{delta}}% vs last month', { delta: Math.abs(delta) })));
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
    // Its own text colour: it sits on the page header's dark band, whose light text would vanish on this white box.
    <Stack direction="row" sx={{ alignItems: 'center', border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper', color: 'text.primary', flexShrink: 0 }}>
      <IconButton size="small" aria-label={t('Previous month')} onClick={() => onChange(shiftMonth(month, -1))}>
        <ChevronLeftRoundedIcon />
      </IconButton>
      <Typography variant="body2" sx={{ fontWeight: 700, minWidth: 128, textAlign: 'center' }}>
        {monthName(month)}
      </Typography>
      <IconButton size="small" aria-label={t('Next month')} onClick={() => onChange(shiftMonth(month, 1))} disabled={month >= thisMonth()}>
        <ChevronRightRoundedIcon />
      </IconButton>
    </Stack>
  );
}

/** The month at a glance: sales against expenses each day, and the bottom line. */
export function ProfitSnapshot({ data, onOpen }) {
  const totals = data.totals;
  return (
    <Panel
      title={t('Sales vs expenses')}
      subtitle={t('Every day of {{monthName}} — expenses are shop expenses and salary', { monthName: monthName(data.month) })}
      action={
        onOpen && (
          <Button size="small" onClick={onOpen} sx={{ flexShrink: 0 }}>
            {t('Profit & loss')}
          </Button>
        )
      }
    >
      <SalesExpenseChart days={data.days} height={230} />
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 1, mt: 2, pt: 1.5, borderTop: 1, borderColor: 'divider' }}>
        {[
          [t('Sales'), totals.salesPaise, 'text.primary'],
          [t('Expenses'), totals.expensesPaise, 'text.primary'],
          [t('Net profit'), totals.netProfitPaise, totals.netProfitPaise < 0 ? 'error.main' : 'success.main'],
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
  // Starts on the branch picked in the top bar (all branches when that is "All"), and follows it when it changes.
  const activeBranchId = useSelector((s) => s.auth.activeBranchId);
  const branchView = useSelector((s) => s.auth.branchView);
  const workingBranch = branchView === 'all' ? '' : (activeBranchId ?? '');
  const [branchId, setBranchId] = useState(workingBranch);
  useEffect(() => setBranchId(workingBranch), [workingBranch]);
  const branches = session?.branches ?? [];
  // A branch this user cannot see (e.g. a stale saved one) falls back to all branches.
  const shownBranch = branches.some((b) => b.id === branchId) ? branchId : '';
  const { data, isLoading, isFetching, error, refetch } = useFinanceSummaryQuery({ month, ...(shownBranch && { branchId: shownBranch }) });

  const totals = data?.totals;
  const p = data?.previous;
  const maxCategory = Math.max(1, ...(data?.byCategory ?? []).map((c) => c.amountPaise), totals?.salaryPaise ?? 0);

  return (
    <>
      <PageHeader
        title={t('Profit & loss')}
        subtitle={t('What the shop sold, what it cost, what it spent — and what is left.')}
        actions={
          <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            {branches.length > 1 && (
              <TextField select size="small" value={shownBranch}onChange={(e) => setBranchId(e.target.value)} sx={{ minWidth: 160 }} slotProps={{ select: { displayEmpty: true } }}>
                <MenuItem value="">{t('All branches')}</MenuItem>
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
        <LoadingState label={t('Working out the month')} />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : (
        <Box sx={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity 150ms' }}>
          <SummaryCards>
            <SummaryCard icon={ReceiptLongOutlinedIcon} label={t('Total sales')} value={inr(totals.salesPaise)} caption={change(totals.salesPaise, p.salesPaise) ?? t('Before GST, less returns')} tone="blue" />
            <SummaryCard icon={TrendingUpRoundedIcon} label={t('Gross profit')} value={signed(totals.grossProfitPaise)} caption={t('{{pct}}% margin', { pct: pct(totals.grossProfitPaise, totals.salesPaise) })} tone="gold" />
            <SummaryCard icon={PaymentsOutlinedIcon} label={t('Expenses')} value={inr(totals.expensesPaise)} caption={change(totals.expensesPaise, p.expensesPaise, { cost: true }) ?? t('Shop expenses + salary')} tone="amber" />
            <SummaryCard
              icon={AccountBalanceWalletOutlinedIcon}
              label={t('Net profit')}
              value={signed(totals.netProfitPaise)}
              caption={change(totals.netProfitPaise, p.netProfitPaise) ?? (totals.netProfitPaise < 0 ? t('Loss this month') : t('After every cost'))}
              tone={totals.netProfitPaise < 0 ? 'red' : 'green'}
              valueTone={totals.netProfitPaise < 0 ? 'due' : 'paid'}
              hideCaptionOnPhone={false}
            />
          </SummaryCards>

          <Grid container spacing={{ xs: 1.5, sm: 2 }} sx={{ mb: { xs: 1.5, sm: 2 } }}>
            <Grid size={{ xs: 12, lg: 8 }}>
              <ProfitSnapshot data={data} />
            </Grid>
            <Grid size={{ xs: 12, lg: 4 }}>
              <Panel title={t('Profit statement')} subtitle={monthName(month)}>
                <Line label={t('Sales')} value={totals.salesPaise} hint={t('Bills before GST, less returns')} />
                <Line label={t('Cost of goods sold')} value={totals.cogsPaise} minus hint={t('Cost of the pieces sold')} />
                <Line label={t('Gross profit')} value={totals.grossProfitPaise} total tone="var(--brand-strong)" />
                <Line label={t('Shop expenses')} value={totals.shopExpensesPaise} minus />
                <Line label={t('Salary')} value={totals.salaryPaise} minus hint={t('Finalised payroll for this month')} />
                {totals.otherPaise !== 0 && <Line label={t('Stock written off & round-off')} value={totals.otherPaise} minus />}
                <Line label={t('Net profit')} value={totals.netProfitPaise} total tone={totals.netProfitPaise < 0 ? 'error.main' : 'success.main'} />
              </Panel>
            </Grid>
          </Grid>

          <Grid container spacing={{ xs: 1.5, sm: 2 }}>
            <Grid size={{ xs: 12, md: 6, lg: 5 }}>
              <Panel title={t('Net profit by month')} subtitle={t('The last six months')}>
                <MonthlyProfitBars months={data.months} />
              </Panel>
            </Grid>
            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <Panel
                title={t('Where the money went')}
                subtitle={t('Expenses by head')}
                action={
                  canSeeExpenses && (
                    <Button size="small" onClick={() => navigate('/expenses')} sx={{ flexShrink: 0 }}>
                      {t('Expenses')}
                    </Button>
                  )
                }
              >
                {!data.byCategory.length && !totals.salaryPaise ? (
                  <Typography variant="body2" color="textSecondary" sx={{ py: 3, textAlign: 'center' }}>
                    {t('No expenses this month')}
                  </Typography>
                ) : (
                  <Stack spacing={1.25}>
                    {[...(totals.salaryPaise ? [{ name: 'Salary (payroll)', amountPaise: totals.salaryPaise }] : []), ...data.byCategory]
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
                                {pct(c.amountPaise, totals.expensesPaise)}%
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
              <Panel title={t('Suppliers & stock')} subtitle={t('Cash, not profit — stock reaches profit when sold')}>
                <Line label={t('Bought this month')} value={data.cash.purchasesPaise} hint={(data.cash.purchaseBills === 1 ? t('{{purchaseBills}} purchase bill', { purchaseBills: data.cash.purchaseBills }) : t('{{purchaseBills}} purchase bills', { purchaseBills: data.cash.purchaseBills }))} />
                <Line label={t('Paid to suppliers')} value={data.cash.paidToSuppliersPaise} hint={t('Cash, bank and UPI this month')} />
                <Line label={t('Still due to suppliers')} value={data.cash.supplierDuePaise} total tone={data.cash.supplierDuePaise ? 'error.main' : 'success.main'} />
              </Panel>
            </Grid>
          </Grid>
        </Box>
      )}
    </>
  );
}
