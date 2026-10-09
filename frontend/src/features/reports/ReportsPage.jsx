import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import AssignmentReturnOutlinedIcon from '@mui/icons-material/AssignmentReturnOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import DiamondOutlinedIcon from '@mui/icons-material/DiamondOutlined';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import HourglassBottomOutlinedIcon from '@mui/icons-material/HourglassBottomOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import PointOfSaleOutlinedIcon from '@mui/icons-material/PointOfSaleOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import RequestQuoteOutlinedIcon from '@mui/icons-material/RequestQuoteOutlined';
import MapOutlinedIcon from '@mui/icons-material/MapOutlined';
import RequestPageOutlinedIcon from '@mui/icons-material/RequestPageOutlined';
import ScaleOutlinedIcon from '@mui/icons-material/ScaleOutlined';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import SupportAgentOutlinedIcon from '@mui/icons-material/SupportAgentOutlined';
import SyncAltRoundedIcon from '@mui/icons-material/SyncAltRounded';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import { Box, ButtonBase, InputBase, Stack, Typography } from '@mui/material';
import { Link as RouterLink, useSearchParams } from 'react-router';
import { EmptyState, ErrorState, LoadingState } from '../../components/StateViews.jsx';
import { fonts, tokens } from '../../theme/tokens.js';
import { useReportListQuery } from './reportApi.js';

const s = tokens.sidebar;

export const GROUP_ICONS = {
  Sales: PointOfSaleOutlinedIcon,
  'Customers & orders': PeopleAltOutlinedIcon,
  Inventory: Inventory2OutlinedIcon,
  'HR & payroll': BadgeOutlinedIcon,
  GST: RequestPageOutlinedIcon,
  'Tax & finance': AccountBalanceOutlinedIcon,
};
const GROUP_ORDER = ['Sales', 'GST', 'Customers & orders', 'Inventory', 'Tax & finance', 'HR & payroll'];

/** One accent per group, kept within the gold-and-jewel palette. */
const GROUP_ACCENT = {
  Sales: { color: '#C9A227', tint: 'rgba(201, 162, 39, 0.12)', caption: 'Invoices, days, categories and payment modes' },
  'Customers & orders': { color: '#2F7D6D', tint: 'rgba(47, 125, 109, 0.12)', caption: 'Who owes, who buys most, what is on order' },
  Inventory: { color: '#2F5D7C', tint: 'rgba(47, 93, 124, 0.12)', caption: 'Stock by metal, category, age and movement' },
  GST: { color: '#B4532A', tint: 'rgba(180, 83, 42, 0.12)', caption: 'CGST, SGST and IGST — collected, reversed and payable' },
  'Tax & finance': { color: '#8A3B5C', tint: 'rgba(138, 59, 92, 0.12)', caption: 'Profit, ledgers and the books' },
  'HR & payroll': { color: '#7A5C1E', tint: 'rgba(122, 92, 30, 0.12)', caption: 'Salaries, attendance and advances' },
};

const REPORT_ICONS = {
  'sales-register': ReceiptLongOutlinedIcon,
  'sales-daily': CalendarMonthOutlinedIcon,
  'sales-category': CategoryOutlinedIcon,
  'sales-metal': DiamondOutlinedIcon,
  'sales-payment': PaymentsOutlinedIcon,
  'sales-staff': SupportAgentOutlinedIcon,
  'sales-returns': AssignmentReturnOutlinedIcon,
  'gst-cgst': AccountBalanceOutlinedIcon,
  'gst-sgst': MapOutlinedIcon,
  'gst-igst': SyncAltRoundedIcon,
  profit: TrendingUpRoundedIcon,
  'customer-outstanding': AccountBalanceWalletOutlinedIcon,
  'top-customers': EmojiEventsOutlinedIcon,
  'orders-open': AssignmentOutlinedIcon,
  'stock-summary': Inventory2OutlinedIcon,
  'stock-category': CategoryOutlinedIcon,
  'stock-ageing': HourglassBottomOutlinedIcon,
  'stock-movements': SyncAltRoundedIcon,
  'metal-balance': ScaleOutlinedIcon,
  'salary-payments': AccountBalanceWalletOutlinedIcon,
  'salary-register': PaymentsOutlinedIcon,
  'attendance-summary': EventAvailableOutlinedIcon,
  'advances-outstanding': RequestQuoteOutlinedIcon,
};

const FILTER_LABELS = { range: 'Date range', month: 'Monthly', asOf: 'As on date', branch: 'By branch' };


/** Compact banner: title with counts on the left, search on the right — one row on desktop. */
function Hero({ total, groupCount, q, onSearch }) {
  return (
    <Box
      sx={(theme) => ({
        position: 'relative',
        overflow: 'hidden',
        mb: 2,
        px: { xs: 2.5, md: 4 },
        py: { xs: 3, md: 4 },
        borderRadius: 3,
        color: '#F7F3E8',
        background: `${s.glow}, radial-gradient(80% 120% at 100% 100%, rgba(201, 162, 39, 0.10) 0%, rgba(201, 162, 39, 0) 60%), ${s.surface}`,
        boxShadow: '0 10px 28px rgba(23, 23, 23, 0.16)',
        border: '1px solid rgba(201, 162, 39, 0.22)',
        [theme.getColorSchemeSelector('dark')]: { boxShadow: '0 10px 28px rgba(0, 0, 0, 0.45)' },
      })}
    >
      <DiamondOutlinedIcon aria-hidden sx={{ position: 'absolute', right: { xs: -20, md: 420 }, top: '50%', fontSize: 180, color: 'rgba(201, 162, 39, 0.07)', transform: 'translateY(-50%) rotate(-12deg)' }} />
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 1.5, md: 3 }} sx={{ position: 'relative', alignItems: { md: 'center' }, justifyContent: 'space-between' }}>
        <Box sx={{ minWidth: 0 }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.75 }}>
            <Typography component="h1" sx={{ fontFamily: fonts.display, fontWeight: 600, fontSize: { xs: 34, md: 44 }, lineHeight: 1, letterSpacing: '0.01em' }}>
              Reports
            </Typography>
            {[
              [total, 'reports'],
              [groupCount, 'categories'],
            ].map(([n, label]) => (
              <Box key={label} sx={{ display: 'inline-flex', alignItems: 'baseline', gap: 0.5, px: 1.25, py: 0.5, borderRadius: 999, border: '1px solid rgba(201, 162, 39, 0.3)', bgcolor: 'rgba(201, 162, 39, 0.08)' }}>
                <Typography sx={{ fontFamily: fonts.display, fontWeight: 700, fontSize: 19, lineHeight: 1.2, color: s.active }}>{n}</Typography>
                <Typography sx={{ fontSize: '0.6875rem', color: s.text, letterSpacing: '0.04em' }}>{label}</Typography>
              </Box>
            ))}
          </Stack>
          <Typography noWrap sx={{ mt: 1.5, color: s.text, fontSize: '0.9375rem' }}>
            Sales, GST, stock, customers and staff — every number your showroom runs on.
          </Typography>
        </Box>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            width: { xs: '100%', md: 380 },
            flexShrink: 0,
            px: 1.5,
            height: 48,
            borderRadius: 2.5,
            bgcolor: 'rgba(255, 255, 255, 0.06)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            transition: 'border-color 160ms ease, background-color 160ms ease',
            '&:focus-within': { borderColor: s.active, bgcolor: 'rgba(255, 255, 255, 0.09)' },
          }}
        >
          <SearchRoundedIcon sx={{ color: s.muted, fontSize: 18 }} />
          <InputBase value={q} onChange={(e) => onSearch(e.target.value)} placeholder="Find a report — GST, stock, salary…" inputProps={{ 'aria-label': 'Find a report' }} sx={{ flex: 1, color: '#F7F3E8', fontSize: '0.875rem', '& input::placeholder': { color: s.muted, opacity: 1 } }} />
        </Box>
      </Stack>
    </Box>
  );
}

function GroupTabs({ groups, active, onChange, total }) {
  const tabs = [{ name: 'All', count: total }, ...groups.map((g) => ({ name: g.name, count: g.count }))];
  return (
    // Always one line. Compact sizing fits every tab on a laptop screen; on wide screens the tabs stretch to fill
    // the row, and on narrow ones it scrolls sideways. The vertical padding keeps the selected tab's shadow unclipped.
    <Box
      role="toolbar"
      aria-label="Report categories"
      sx={{
        display: 'flex',
        flexWrap: 'nowrap',
        gap: { xs: 0.75, lg: 1 },
        mb: 2.5,
        py: 1,
        mx: { xs: -2, sm: 0 },
        px: { xs: 2, sm: 0 },
        overflowX: 'auto',
        scrollbarWidth: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
      }}
    >
      {tabs.map((t) => {
        const selected = active === t.name;
        const Icon = GROUP_ICONS[t.name];
        return (
          <ButtonBase
            key={t.name}
            onClick={() => onChange(t.name)}
            aria-pressed={selected}
            sx={{
              flex: { xs: '0 0 auto', xl: '1 0 auto' },
              gap: 0.625,
              px: { xs: 1.25, lg: 1.5 },
              height: 34,
              borderRadius: 999,
              fontSize: { xs: '0.75rem', xl: '0.8125rem' },
              fontWeight: 600,
              border: 1,
              borderColor: selected ? 'rgba(156, 122, 22, 0.55)' : 'divider',
              bgcolor: selected ? 'transparent' : 'background.paper',
              background: selected ? s.goldGradient : undefined,
              color: selected ? '#171717' : 'text.secondary',
              whiteSpace: 'nowrap',
              boxShadow: selected ? '0 4px 12px rgba(201, 162, 39, 0.28)' : '0 1px 2px rgba(23, 23, 23, 0.04)',
              transition: 'all 160ms ease',
              '&:hover': selected ? {} : { borderColor: tokens.light.gold, color: tokens.light.goldDark },
            }}
          >
            {Icon && <Icon sx={{ fontSize: 15 }} />}
            {t.name === 'All' ? 'All reports' : t.name}
            <Box component="span" sx={{ minWidth: 18, height: 18, px: 0.5, borderRadius: 9, display: 'inline-grid', placeItems: 'center', fontSize: '0.625rem', fontWeight: 700, bgcolor: selected ? 'rgba(23, 23, 23, 0.14)' : 'action.hover' }}>
              {t.count}
            </Box>
          </ButtonBase>
        );
      })}
    </Box>
  );
}

function ReportCard({ report, accent }) {
  const Icon = REPORT_ICONS[report.key] ?? GROUP_ICONS[report.group] ?? ReceiptLongOutlinedIcon;
  const tags = (report.filters ?? []).map((f) => FILTER_LABELS[f]).filter(Boolean);
  return (
    <ButtonBase
      component={RouterLink}
      to={`/reports/${report.key}`}
      sx={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        textAlign: 'left',
        height: '100%',
        px: 1.75,
        py: 1.5,
        borderRadius: 2.5,
        overflow: 'hidden',
        bgcolor: 'background.paper',
        border: 1,
        borderColor: 'divider',
        boxShadow: '0 1px 2px rgba(23, 23, 23, 0.04)',
        transition: 'transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease',
        '&::before': { content: '""', position: 'absolute', inset: '0 0 auto 0', height: 3, background: s.goldGradient, opacity: 0, transition: 'opacity 180ms ease' },
        '& .report-icon': { transition: 'background 180ms ease, color 180ms ease, box-shadow 180ms ease' },
        '& .report-open': { transition: 'gap 180ms ease, color 180ms ease' },
        '&:hover, &:focus-visible': { transform: 'translateY(-2px)', borderColor: 'rgba(201, 162, 39, 0.55)', boxShadow: '0 10px 22px rgba(156, 122, 22, 0.14)' },
        '&:hover::before, &:focus-visible::before': { opacity: 1 },
        '&:hover .report-icon, &:focus-visible .report-icon': { background: s.goldGradient, color: '#171717', boxShadow: '0 6px 14px rgba(201, 162, 39, 0.35)' },
        '&:hover .report-open, &:focus-visible .report-open': { gap: 1, color: tokens.light.goldDark },
      }}
    >
      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', flex: 1, minWidth: 0 }}>
        <Box className="report-icon" sx={{ width: 36, height: 36, borderRadius: 2, flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: accent.tint, color: accent.color }}>
          <Icon sx={{ fontSize: 19 }} />
        </Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontWeight: 650, fontSize: '0.875rem', lineHeight: 1.3, color: 'text.primary' }}>
            {report.title}
          </Typography>
          <Typography noWrap title={report.description} sx={{ fontSize: '0.75rem', lineHeight: 1.4, color: 'text.secondary', mt: 0.125 }}>
            {report.description}
          </Typography>
        </Box>
      </Stack>
      <Stack direction="row" sx={{ mt: 1.25, pt: 1, borderTop: 1, borderColor: 'divider', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Stack direction="row" spacing={0.5} sx={{ minWidth: 0, overflow: 'hidden' }}>
          {tags.map((t) => (
            <Box key={t} component="span" sx={{ px: 0.75, py: 0.125, borderRadius: 1, fontSize: '0.625rem', fontWeight: 600, whiteSpace: 'nowrap', color: 'text.secondary', bgcolor: 'action.hover' }}>
              {t}
            </Box>
          ))}
        </Stack>
        <Box className="report-open" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, flexShrink: 0, fontSize: '0.75rem', fontWeight: 650, color: 'text.secondary' }}>
          Open
          <ArrowForwardRoundedIcon sx={{ fontSize: 14 }} />
        </Box>
      </Stack>
    </ButtonBase>
  );
}

function GroupHeader({ name, count }) {
  const Icon = GROUP_ICONS[name] ?? PointOfSaleOutlinedIcon;
  const accent = GROUP_ACCENT[name] ?? GROUP_ACCENT.Sales;
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', mb: 2 }}>
      <Box sx={{ width: 36, height: 36, borderRadius: 2.5, display: 'grid', placeItems: 'center', bgcolor: accent.tint, color: accent.color, flexShrink: 0 }}>
        <Icon sx={{ fontSize: 19 }} />
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
          <Typography component="h2" sx={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 26, lineHeight: 1.1 }}>
            {name}
          </Typography>
          <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: 'text.secondary' }}>{count}</Typography>
        </Stack>
        <Typography variant="body2" color="textSecondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
          {accent.caption}
        </Typography>
      </Box>
      <Box sx={{ flex: 1, height: '1px', ml: 2, alignSelf: 'center', background: 'linear-gradient(90deg, rgba(201, 162, 39, 0.45), rgba(201, 162, 39, 0))' }} />
    </Stack>
  );
}

export default function ReportsPage() {
  const { data, isLoading, error, refetch } = useReportListQuery();
  // The chosen tab and search live in the URL (?group=…&q=…), so Back from a report returns to the same tab.
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const active = params.get('group') ?? 'All';
  const setParam = (key, value, fallback) =>
    setParams(
      (p) => {
        const nextParams = new URLSearchParams(p);
        if (!value || value === fallback) nextParams.delete(key);
        else nextParams.set(key, value);
        return nextParams;
      },
      { replace: true },
    );
  const setQ = (value) => setParam('q', value, '');
  const setActive = (value) => setParam('group', value, 'All');

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const needle = q.trim().toLowerCase();
  const matches = data.filter((r) => !needle || `${r.title} ${r.description} ${r.group}`.toLowerCase().includes(needle));
  const allGroups = GROUP_ORDER.map((g) => ({ name: g, count: matches.filter((r) => r.group === g).length })).filter((g) => g.count);
  const current = allGroups.some((g) => g.name === active) ? active : 'All'; // a search can hide the selected group
  const groups = GROUP_ORDER.filter((g) => current === 'All' || g === current)
    .map((g) => ({ name: g, reports: matches.filter((r) => r.group === g) }))
    .filter((g) => g.reports.length);

  return (
    <>
      <Hero total={data.length} groupCount={new Set(data.map((r) => r.group)).size} q={q} onSearch={setQ} />
      <GroupTabs groups={allGroups} active={current} onChange={setActive} total={matches.length} />
      {!groups.length && <EmptyState title="No report matches" description={`Nothing found for “${q.trim()}”. Try another word, like GST or stock.`} />}
      <Stack spacing={4.5}>
        {groups.map((g) => (
          <Box key={g.name} component="section" aria-label={g.name}>
            <GroupHeader name={g.name} count={g.reports.length} />
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 }}>
              {g.reports.map((r) => (
                <ReportCard key={r.key} report={r} accent={GROUP_ACCENT[r.group] ?? GROUP_ACCENT.Sales} />
              ))}
            </Box>
          </Box>
        ))}
      </Stack>
    </>
  );
}

