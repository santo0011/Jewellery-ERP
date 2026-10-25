import ApartmentOutlinedIcon from '@mui/icons-material/ApartmentOutlined';
import AutorenewRoundedIcon from '@mui/icons-material/AutorenewRounded';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import CurrencyRupeeRoundedIcon from '@mui/icons-material/CurrencyRupeeRounded';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import PersonAddAltOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import SellOutlinedIcon from '@mui/icons-material/SellOutlined';
import VerifiedOutlinedIcon from '@mui/icons-material/VerifiedOutlined';
import { Box, Stack } from '@mui/material';
import PageHeader from '../../components/PageHeader.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import { GroupHeader, ReportCard } from '../reports/ReportsPage.jsx';
import { usePlatformReportsQuery } from './platformApi.js';
import { t } from '../../i18n/index.js';

/** Groups in order, each with its icon, accent and one line on what is inside. */
export const ADMIN_REPORT_GROUPS = [
  { name: 'Revenue', icon: CurrencyRupeeRoundedIcon, accent: { color: '#2E6B4F', tint: 'rgba(46, 107, 79, 0.12)', caption: t('Subscription money in — by payment, month and plan') } },
  { name: 'Subscriptions', icon: VerifiedOutlinedIcon, accent: { color: '#2F5D7C', tint: 'rgba(47, 93, 124, 0.12)', caption: t('Where every organisation stands and who renews next') } },
  { name: 'Organisations', icon: ApartmentOutlinedIcon, accent: { color: '#B4532A', tint: 'rgba(180, 83, 42, 0.12)', caption: t('Who joined, who pays and who actually uses the software') } },
];

export const ADMIN_REPORT_ICONS = {
  'revenue-register': ReceiptLongOutlinedIcon,
  'revenue-monthly': CalendarMonthOutlinedIcon,
  'revenue-by-plan': SellOutlinedIcon,
  'subscription-status': VerifiedOutlinedIcon,
  renewals: AutorenewRoundedIcon,
  signups: PersonAddAltOutlinedIcon,
  usage: InsightsOutlinedIcon,
};

/** Super Admin reports, grouped like the showroom's Reports page. */
export default function AdminReportsPage() {
  const { data, isLoading, error, refetch } = usePlatformReportsQuery();
  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <>
      <PageHeader title={t('Reports')} subtitle={t('Revenue, subscriptions and organisations across the platform — open one to filter, export to Excel or print.')} />
      <Stack spacing={4.5}>
        {ADMIN_REPORT_GROUPS.map((g) => {
          const reports = data.filter((r) => r.group === g.name);
          if (!reports.length) return null;
          return (
            <Box key={g.name} component="section" aria-label={t(g.name)}>
              <GroupHeader name={g.name} count={reports.length} icon={g.icon} accent={g.accent} />
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 }}>
                {reports.map((r) => (
                  <ReportCard key={r.key} report={r} accent={g.accent} to={`/admin/reports/${r.key}`} icon={ADMIN_REPORT_ICONS[r.key]} />
                ))}
              </Box>
            </Box>
          );
        })}
      </Stack>
    </>
  );
}
