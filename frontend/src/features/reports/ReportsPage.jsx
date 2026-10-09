import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import PointOfSaleOutlinedIcon from '@mui/icons-material/PointOfSaleOutlined';
import { Box, ButtonBase, Card, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router';
import PageHeader from '../../components/PageHeader.jsx';
import SearchField from '../../components/SearchField.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/StateViews.jsx';
import { useReportListQuery } from './reportApi.js';

export const GROUP_ICONS = {
  Sales: PointOfSaleOutlinedIcon,
  'Customers & orders': PeopleAltOutlinedIcon,
  Inventory: Inventory2OutlinedIcon,
  'HR & payroll': BadgeOutlinedIcon,
  'Tax & finance': AccountBalanceOutlinedIcon,
};
const GROUP_ORDER = ['Sales', 'Customers & orders', 'Inventory', 'Tax & finance', 'HR & payroll'];

export default function ReportsPage() {
  const { data, isLoading, error, refetch } = useReportListQuery();
  const [q, setQ] = useState('');

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const needle = q.trim().toLowerCase();
  const list = data.filter((r) => !needle || `${r.title} ${r.description} ${r.group}`.toLowerCase().includes(needle));
  const groups = GROUP_ORDER.map((g) => ({ name: g, reports: list.filter((r) => r.group === g) })).filter((g) => g.reports.length);

  return (
    <>
      <PageHeader title="Reports" subtitle={`${data.length} reports across sales, stock, customers, tax, accounts and staff.`} />
      <Box sx={{ mb: 3, maxWidth: 420 }}>
        <SearchField value={q} onChange={setQ} placeholder="Find a report — e.g. GST, stock, salary" />
      </Box>
      {!groups.length && <EmptyState title="No report matches" description="Try another word." />}
      <Stack spacing={3.5}>
        {groups.map((g) => {
          const Icon = GROUP_ICONS[g.name] ?? PointOfSaleOutlinedIcon;
          return (
            <Box key={g.name}>
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}>
                <Icon sx={{ color: 'primary.main' }} fontSize="small" />
                <Typography variant="h3">{g.name}</Typography>
                <Typography variant="body2" color="textSecondary">
                  · {g.reports.length}
                </Typography>
              </Stack>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', lg: 'repeat(3, 1fr)' }, gap: 1.5 }}>
                {g.reports.map((r) => (
                  <Card key={r.key} sx={{ height: '100%', transition: 'box-shadow 150ms, transform 150ms', '&:hover': { boxShadow: 4, transform: 'translateY(-1px)' } }}>
                    <ButtonBase component={RouterLink} to={`/reports/${r.key}`} sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1.5, p: 2, width: '100%', height: '100%', textAlign: 'left' }}>
                      <Box sx={{ minWidth: 0 }}>
                        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                          {r.title}
                        </Typography>
                        <Typography variant="body2" color="textSecondary">
                          {r.description}
                        </Typography>
                      </Box>
                      <ArrowForwardRoundedIcon fontSize="small" sx={{ color: 'text.secondary', mt: 0.25 }} />
                    </ButtonBase>
                  </Card>
                ))}
              </Box>
            </Box>
          );
        })}
      </Stack>
    </>
  );
}
