import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import { Box, Button, Card, MenuItem, Stack, TextField, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { useParams, useSearchParams } from 'react-router';
import PageHeader from '../../components/PageHeader.jsx';
import { ErrorState, LoadingState } from '../../components/StateViews.jsx';
import { formatDate } from '../../utils/format.js';
import { downloadCsv, presets, printStyles, ReportSheet } from '../reports/ReportViewPage.jsx';
import { usePlatformReportQuery } from './platformApi.js';
import { t } from '../../i18n/index.js';

const STATUS_OPTIONS = [
  { value: '', label: t('All organisations') },
  { value: 'active', label: t('Paid (active)') },
  { value: 'trial', label: t('Free trial') },
  { value: 'expired', label: t('Expired') },
];

/** One Super Admin report: filters on top, then the same sheet (summary, table, totals) as the showroom reports. */
export default function AdminReportViewPage() {
  const { key } = useParams();
  const [params, setParams] = useSearchParams();
  const query = Object.fromEntries([...params.entries()].filter(([, v]) => v));
  const { data: report, isLoading, isFetching, error, refetch } = usePlatformReportQuery({ key, ...query });
  const set = (patch) => {
    const next = { ...query, ...patch };
    setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)), { replace: true });
  };

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const f = report.filters;
  const p = report.params;
  const period = f.includes('range') ? `${formatDate(p.from)} – ${formatDate(p.to)}` : t('As on {{formatDate}}', { formatDate: formatDate(new Date()) });
  const statusLabel = f.includes('status') ? STATUS_OPTIONS.find((o) => o.value === (p.status ?? ''))?.label : null;

  return (
    <>
      {printStyles}
      <PageHeader
        title={t(report.title)}
        subtitle={t(report.description)}
        back={{ to: '/admin/reports', label: t('Reports') }}
        actions={
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" color="secondary" startIcon={<FileDownloadOutlinedIcon />} onClick={() => downloadCsv(report)} disabled={!report.rows.length}>
              {t('Excel (CSV)')}
            </Button>
            <Button variant="contained" startIcon={<PrintOutlinedIcon />} onClick={() => window.print()}>
              {t('Print')}
            </Button>
          </Stack>
        }
      />

      {(f.includes('range') || f.includes('status')) && (
        <Card sx={{ p: { xs: 1.5, sm: 2 }, mb: 2 }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: f.includes('range') ? 'minmax(150px, 180px) minmax(150px, 180px) auto' : 'minmax(220px, 280px)' },
              alignItems: 'center',
              gap: 1.5,
              '& .MuiInputBase-root': { height: 40 },
              '@media (pointer: fine)': { '& .MuiInputBase-input': { fontSize: '0.875rem' } },
            }}
          >
            {f.includes('range') && (
              <>
                <TextField label={t('From')} type="date" value={p.from} onChange={(e) => e.target.value && set({ from: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
                <TextField label={t('To')} type="date" value={p.to} onChange={(e) => e.target.value && set({ to: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} />
                <ToggleButtonGroup
                  exclusive
                  size="small"
                  aria-label={t('Quick period')}
                  value={presets().find((x) => p.from === x.from && p.to === x.to)?.label ?? null}
                  onChange={(e, label) => {
                    const x = presets().find((y) => y.label === label);
                    if (x) set({ from: x.from, to: x.to });
                  }}
                  sx={{
                    height: 40,
                    gridColumn: { xs: '1 / -1', md: 'auto' },
                    justifySelf: { md: 'start' },
                    width: { xs: '100%', md: 'auto' },
                    bgcolor: 'background.paper',
                    '& .MuiToggleButton-root': { flex: { xs: 1, md: 'none' }, px: { xs: 0.75, sm: 1.5 }, fontSize: '0.8125rem', fontWeight: 600, color: 'text.secondary', textTransform: 'none', whiteSpace: 'nowrap' },
                    '& .MuiToggleButton-root.Mui-selected': { bgcolor: 'primary.main', color: 'primary.contrastText', '&:hover': { bgcolor: 'primary.dark' } },
                  }}
                >
                  {presets().map((x) => (
                    <ToggleButton key={x.label} value={x.label}>
                      {x.label}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </>
            )}
            {f.includes('status') && (
              <TextField select label={t('Status')} value={p.status ?? ''} onChange={(e) => set({ status: e.target.value })} slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }} sx={{ gridColumn: { xs: '1 / -1', md: 'auto' } }}>
                {STATUS_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </TextField>
            )}
          </Box>
        </Card>
      )}

      <ReportSheet report={report} isFetching={isFetching} period={period} scope={statusLabel} printTitle={t('Jewellery ERP · Platform')} emptyHint={f.includes('range') ? t('Try a wider date range.') : t('Nothing to show right now.')} />
    </>
  );
}
