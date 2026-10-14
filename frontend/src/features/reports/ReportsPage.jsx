import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import AssignmentReturnOutlinedIcon from '@mui/icons-material/AssignmentReturnOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
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
import ShoppingBagOutlinedIcon from '@mui/icons-material/ShoppingBagOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import SyncAltRoundedIcon from '@mui/icons-material/SyncAltRounded';
import { Box, ButtonBase, InputBase, Stack, Typography } from '@mui/material';
import { Link as RouterLink, useSearchParams } from 'react-router';
import { EmptyState, ErrorState, LoadingState } from '../../components/StateViews.jsx';
import { fonts, tokens } from '../../theme/tokens.js';
import { useReportListQuery } from './reportApi.js';

const s = tokens.sidebar;

export const GROUP_ICONS = {
  Sales: PointOfSaleOutlinedIcon,
  'Customers & orders': PeopleAltOutlinedIcon,
  Purchases: ShoppingBagOutlinedIcon,
  Inventory: Inventory2OutlinedIcon,
  'HR & payroll': BadgeOutlinedIcon,
  GST: RequestPageOutlinedIcon,
};
const GROUP_ORDER = ['Sales', 'GST', 'Customers & orders', 'Purchases', 'Inventory', 'HR & payroll'];

/** One accent per group, kept within the gold-and-jewel palette. */
const GROUP_ACCENT = {
  Sales: { color: '#C9A227', tint: 'rgba(201, 162, 39, 0.12)', caption: 'Invoices, days, categories and payment modes' },
  'Customers & orders': { color: '#2F7D6D', tint: 'rgba(47, 125, 109, 0.12)', caption: 'Who owes, who buys most, what is on order' },
  Purchases: { color: '#5B4B8A', tint: 'rgba(91, 75, 138, 0.12)', caption: 'Supplier bills, GST input and what is still owed' },
  Inventory: { color: '#2F5D7C', tint: 'rgba(47, 93, 124, 0.12)', caption: 'Stock by metal, category, age and movement' },
  GST: { color: '#B4532A', tint: 'rgba(180, 83, 42, 0.12)', caption: 'CGST, SGST and IGST — collected, reversed and payable' },
  'HR & payroll': { color: '#7A5C1E', tint: 'rgba(122, 92, 30, 0.12)', caption: 'Salaries, attendance and advances' },
};

const REPORT_ICONS = {
  'sales-register': ReceiptLongOutlinedIcon,
  'sales-daily': CalendarMonthOutlinedIcon,
  'sales-category': CategoryOutlinedIcon,
  'sales-returns': AssignmentReturnOutlinedIcon,
  'purchase-register': ShoppingBagOutlinedIcon,
  'purchase-supplier': StorefrontOutlinedIcon,
  'gst-summary': ReceiptLongOutlinedIcon,
  'gst-cgst': AccountBalanceOutlinedIcon,
  'gst-sgst': MapOutlinedIcon,
  'gst-igst': SyncAltRoundedIcon,
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

const FILTER_LABELS = { range: 'Date range', month: 'Monthly', asOf: 'As on date', branch: 'By branch', status: 'By status' };


/** One count in the banner: a big number over a small label. */
function HeroStat({ value, label }) {
  return (
    <Box sx={{ minWidth: { sm: 96, md: 104 }, px: { xs: 1.5, md: 2 }, py: { xs: 1, md: 1.25 }, borderRadius: 2.5, bgcolor: 'rgba(var(--brand-rgb), 0.08)', border: '1px solid rgba(var(--brand-rgb), 0.24)' }}>
      <Typography sx={{ fontFamily: fonts.display, fontWeight: 700, fontSize: { xs: 24, md: 28 }, lineHeight: 1.05, color: s.active }}>{value}</Typography>
      <Typography sx={{ mt: 0.25, fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: s.muted }}>{label}</Typography>
    </Box>
  );
}

/**
 * The banner on top of Reports: icon, title and what is inside; the counts as two stat tiles (beside the title on
 * tablets and up, under it on phones); the search on its own full-width row.
 */
function Hero({ total, groupCount, q, onSearch }) {
  return (
    <Box
      sx={(theme) => ({
        position: 'relative',
        overflow: 'hidden',
        mb: 2,
        px: { xs: 2, sm: 3, md: 3.5 },
        py: { xs: 2.25, sm: 3 },
        borderRadius: 3,
        color: '#F7F3E8',
        background: `${s.glow}, radial-gradient(80% 120% at 100% 100%, rgba(var(--brand-rgb), 0.10) 0%, rgba(var(--brand-rgb), 0) 60%), ${s.surface}`,
        boxShadow: '0 10px 28px rgba(23, 23, 23, 0.16)',
        border: '1px solid rgba(var(--brand-rgb), 0.22)',
        [theme.getColorSchemeSelector('dark')]: { boxShadow: '0 10px 28px rgba(0, 0, 0, 0.45)' },
      })}
    >
      <DiamondOutlinedIcon aria-hidden sx={{ position: 'absolute', right: { xs: -36, md: -24 }, top: { xs: -24, md: '50%' }, fontSize: { xs: 150, md: 200 }, color: 'rgba(var(--brand-rgb), 0.07)', transform: { xs: 'rotate(-12deg)', md: 'translateY(-50%) rotate(-12deg)' }, pointerEvents: 'none' }} />

      <Box sx={{ position: 'relative', display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr auto' }, gap: { xs: 2, md: 3 }, alignItems: 'center' }}>
        <Stack direction="row" spacing={{ xs: 1.5, sm: 2 }} sx={{ alignItems: 'center', minWidth: 0 }}>
          <Box sx={{ width: { xs: 44, sm: 52 }, height: { xs: 44, sm: 52 }, flexShrink: 0, borderRadius: 2.5, display: 'grid', placeItems: 'center', background: s.goldGradient, color: 'var(--brand-contrast)', boxShadow: '0 8px 20px -6px rgba(var(--brand-rgb), 0.6)' }}>
            <AssessmentOutlinedIcon sx={{ fontSize: { xs: 24, sm: 28 } }} />
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h1" sx={{ fontFamily: fonts.display, fontWeight: 600, fontSize: { xs: 28, sm: 34, md: 38 }, lineHeight: 1.05, letterSpacing: '0.01em' }}>
              Reports
            </Typography>
            <Typography sx={{ mt: 0.5, color: s.text, fontSize: { xs: '0.8125rem', sm: '0.875rem' }, lineHeight: 1.45 }}>
              Sales, purchases, GST, stock, customers and staff — every number your showroom runs on.
            </Typography>
          </Box>
        </Stack>

        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(2, auto)' }, gap: 1 }}>
          <HeroStat value={total} label="Reports" />
          <HeroStat value={groupCount} label="Categories" />
        </Box>

        <Box
          sx={{
            gridColumn: '1 / -1',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: 1.5,
            height: { xs: 44, sm: 46 },
            borderRadius: 2.5,
            bgcolor: 'rgba(255, 255, 255, 0.06)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            transition: 'border-color 160ms ease, background-color 160ms ease',
            '&:focus-within': { borderColor: s.active, bgcolor: 'rgba(255, 255, 255, 0.09)' },
          }}
        >
          <SearchRoundedIcon sx={{ color: s.muted, fontSize: 18 }} />
          <InputBase value={q} onChange={(e) => onSearch(e.target.value)} placeholder="Find a report — GST, stock, salary…" inputProps={{ 'aria-label': 'Find a report' }} sx={{ flex: 1, minWidth: 0, color: '#F7F3E8', fontSize: '0.875rem', '& input::placeholder': { color: s.muted, opacity: 1 } }} />
        </Box>
      </Box>
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
        mx: { xs: -1.5, sm: 0 },
        px: { xs: 1.5, sm: 0 },
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
              borderColor: selected ? 'rgba(var(--brand-strong-rgb), 0.55)' : 'divider',
              bgcolor: selected ? 'transparent' : 'background.paper',
              background: selected ? s.goldGradient : undefined,
              color: selected ? 'var(--brand-contrast)' : 'text.secondary',
              whiteSpace: 'nowrap',
              boxShadow: selected ? '0 4px 12px rgba(var(--brand-rgb), 0.28)' : '0 1px 2px rgba(23, 23, 23, 0.04)',
              transition: 'all 160ms ease',
              '&:hover': selected ? {} : { borderColor: tokens.brand.main, color: tokens.brand.strong },
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

/** A report tile. `to` and `icon` let other panels (Super Admin) reuse it with their own routes and icons. */
export function ReportCard({ report, accent, to, icon }) {
  const Icon = icon ?? REPORT_ICONS[report.key] ?? GROUP_ICONS[report.group] ?? ReceiptLongOutlinedIcon;
  const tags = (report.filters ?? []).map((f) => FILTER_LABELS[f]).filter(Boolean);
  return (
    <ButtonBase
      component={RouterLink}
      to={to ?? `/reports/${report.key}`}
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
        '&:hover, &:focus-visible': { transform: 'translateY(-2px)', borderColor: 'rgba(var(--brand-rgb), 0.55)', boxShadow: '0 10px 22px rgba(var(--brand-strong-rgb), 0.14)' },
        '&:hover::before, &:focus-visible::before': { opacity: 1 },
        '&:hover .report-icon, &:focus-visible .report-icon': { background: s.goldGradient, color: 'var(--brand-contrast)', boxShadow: '0 6px 14px rgba(var(--brand-rgb), 0.35)' },
        '&:hover .report-open, &:focus-visible .report-open': { gap: 1, color: tokens.brand.strong },
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

export function GroupHeader({ name, count, icon, accent: givenAccent }) {
  const Icon = icon ?? GROUP_ICONS[name] ?? PointOfSaleOutlinedIcon;
  const accent = givenAccent ?? GROUP_ACCENT[name] ?? GROUP_ACCENT.Sales;
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
      <Box sx={{ flex: 1, height: '1px', ml: 2, alignSelf: 'center', background: 'linear-gradient(90deg, rgba(var(--brand-rgb), 0.45), rgba(var(--brand-rgb), 0))' }} />
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

