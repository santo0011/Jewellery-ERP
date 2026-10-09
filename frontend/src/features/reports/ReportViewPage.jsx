import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import { Alert, Box, Button, Card, Chip, GlobalStyles, Link, MenuItem, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { formatINR, formatWeight } from '@jerp/shared';
import { Link as RouterLink, useParams, useSearchParams } from 'react-router';
import { MONEY_TONE } from '../../components/Amount.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/StateViews.jsx';
import { useSession } from '../../hooks/usePermission.js';
import { formatDate, formatDateTime } from '../../utils/format.js';
import { useReportQuery } from './reportApi.js';

// Print only the report sheet.
const printStyles = (
  <GlobalStyles
    styles={{
      '@media print': {
        'body *': { visibility: 'hidden' },
        '#report-sheet, #report-sheet *': { visibility: 'visible' },
        '#report-sheet': { position: 'absolute', inset: 0, margin: 0 },
        '#report-sheet .no-print': { display: 'none' },
        '@page': { size: 'A4 landscape', margin: '10mm' },
      },
    }}
  />
);

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function presets() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const fyStart = m >= 3 ? y : y - 1;
  return [
    { label: 'Today', from: iso(now), to: iso(now) },
    { label: 'This month', from: iso(new Date(y, m, 1)), to: iso(now) },
    { label: 'Last month', from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) },
    { label: 'This FY', from: `${fyStart}-04-01`, to: iso(now) },
  ];
}

/** One formatter per column type, shared by the table and the summary tiles. */
function formatValue(type, v) {
  if (v === null || v === undefined || v === '') return '—';
  switch (type) {
    case 'money':
      return formatINR(v);
    case 'weight':
      return formatWeight(v);
    case 'percent':
      return `${v}%`;
    case 'date':
      return formatDate(v);
    case 'days':
      return Number.isInteger(v) ? String(v) : `${Math.floor(v)}½`;
    case 'number':
      return Number(v).toLocaleString('en-IN');
    default:
      return String(v);
  }
}

/** Raw value for CSV: rupees and grams as plain numbers so a spreadsheet can add them up. */
function csvValue(type, v) {
  if (v === null || v === undefined) return '';
  if (type === 'money') return (v / 100).toFixed(2);
  if (type === 'weight') return (v / 1000).toFixed(3);
  return String(v);
}

function downloadCsv(report) {
  const head = report.columns.map((c) => c.label + (c.type === 'money' ? ' (₹)' : c.type === 'weight' ? ' (g)' : ''));
  const body = report.rows.map((r) => report.columns.map((c) => csvValue(c.type, r[c.key])));
  const totals = report.totals && Object.keys(report.totals).length ? [report.columns.map((c, i) => (i === 0 ? 'Total' : c.key in report.totals ? csvValue(c.type, report.totals[c.key]) : ''))] : [];
  const esc = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const csv = [head, ...body, ...totals].map((line) => line.map((x) => esc(String(x))).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${report.key}-${report.params.month && report.filters.includes('month') ? report.params.month : `${report.params.from}_to_${report.params.to}`}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

const numeric = (type) => ['money', 'weight', 'number', 'percent', 'days'].includes(type);

function Cell({ column, row, value, total }) {
  const tone = column.toneFromRow ? row?._tone : column.tone;
  const negative = column.signed && typeof value === 'number' && value < 0;
  const color = negative ? MONEY_TONE.due : value && tone ? MONEY_TONE[tone] : undefined;
  const text = formatValue(column.type, value);
  const link = row?._links?.[column.key];
  return (
    <TableCell align={numeric(column.type) ? 'right' : 'left'} sx={{ whiteSpace: numeric(column.type) || column.type === 'date' || (typeof value === 'string' && !value.includes(' ')) ? 'nowrap' : 'normal', fontWeight: total || column.strong ? 700 : 400, color, fontVariantNumeric: 'tabular-nums' }}>
      {link && value ? (
        <Link component={RouterLink} to={link} underline="hover" sx={{ fontWeight: 600 }}>
          {text}
        </Link>
      ) : (
        text
      )}
    </TableCell>
  );
}

export default function ReportViewPage() {
  const { key } = useParams();
  const { data: session } = useSession();
  const [params, setParams] = useSearchParams();
  const query = Object.fromEntries([...params.entries()].filter(([, v]) => v));
  const { data: report, isLoading, isFetching, error, refetch } = useReportQuery({ key, ...query });
  const set = (patch) => {
    const next = { ...query, ...patch };
    setParams(Object.fromEntries(Object.entries(next).filter(([, v]) => v)), { replace: true });
  };

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const f = report.filters;
  const p = report.params;
  const multiBranch = session.branches.length > 1;
  const branchName = p.branchId ? (session.branches.find((b) => b.id === p.branchId)?.name ?? '') : 'All branches';
  const period = f.includes('month') ? new Date(`${p.month}-01T00:00:00Z`).toLocaleString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : f.includes('range') ? `${formatDate(p.from)} – ${formatDate(p.to)}` : f.includes('asOf') ? `As on ${formatDate(p.to)}` : 'As on today';
  const hasTotals = report.totals && Object.keys(report.totals).length > 0 && report.rows.length > 0;

  return (
    <>
      {printStyles}
      <PageHeader
        title={report.title}
        subtitle={report.description}
        back={{ to: '/reports', label: 'Reports' }}
        actions={
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" color="secondary" startIcon={<FileDownloadOutlinedIcon />} onClick={() => downloadCsv(report)} disabled={!report.rows.length}>
              Excel (CSV)
            </Button>
            <Button variant="contained" startIcon={<PrintOutlinedIcon />} onClick={() => window.print()}>
              Print
            </Button>
          </Stack>
        }
      />

      <Card sx={{ p: 2, mb: 2 }}>
        <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1.5, alignItems: 'center' }}>
          {f.includes('range') && (
            <>
              <TextField label="From" type="date" value={p.from} onChange={(e) => e.target.value && set({ from: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} sx={{ width: 170 }} />
              <TextField label="To" type="date" value={p.to} onChange={(e) => e.target.value && set({ to: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} sx={{ width: 170 }} />
              <Stack direction="row" spacing={0.75} sx={{ flexWrap: 'wrap', rowGap: 0.75 }}>
                {presets().map((x) => (
                  <Chip key={x.label} label={x.label} onClick={() => set({ from: x.from, to: x.to })} color={p.from === x.from && p.to === x.to ? 'primary' : 'default'} variant={p.from === x.from && p.to === x.to ? 'filled' : 'outlined'} />
                ))}
              </Stack>
            </>
          )}
          {f.includes('asOf') && <TextField label="As on" type="date" value={p.to} onChange={(e) => e.target.value && set({ to: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} sx={{ width: 170 }} />}
          {f.includes('month') && <TextField label="Month" type="month" value={p.month} onChange={(e) => e.target.value && set({ month: e.target.value })} slotProps={{ inputLabel: { shrink: true } }} sx={{ width: 190 }} />}
          {f.includes('account') && (
            <TextField select label="Account" value={p.account ?? 'cash'} onChange={(e) => set({ account: e.target.value })} sx={{ width: 170 }}>
              <MenuItem value="cash">Cash in hand</MenuItem>
              <MenuItem value="bank">Bank accounts</MenuItem>
            </TextField>
          )}
          {f.includes('branch') && multiBranch && (
            <TextField select label="Branch" value={p.branchId ?? ''} onChange={(e) => set({ branchId: e.target.value })} slotProps={{ inputLabel: { shrink: true }, select: { displayEmpty: true } }} sx={{ width: 210 }}>
              <MenuItem value="">All branches</MenuItem>
              {session.branches.map((b) => (
                <MenuItem key={b.id} value={b.id}>
                  {b.name}
                </MenuItem>
              ))}
            </TextField>
          )}
        </Stack>
      </Card>

      <Box id="report-sheet" sx={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity 120ms' }}>
        {/* Print heading: hidden on screen, shown on paper. */}
        <Box sx={{ display: 'none', '@media print': { display: 'block' }, mb: 2 }}>
          <Typography variant="h2">{session.organisation.name}</Typography>
          <Typography variant="h3">{report.title}</Typography>
          <Typography variant="body2">
            {period} · {branchName} · printed {formatDateTime(new Date())}
          </Typography>
        </Box>

        {report.summary?.length > 0 && (
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: `repeat(${Math.min(report.summary.length, 4)}, 1fr)` }, gap: 1.5, mb: 2 }}>
            {report.summary.map((s) => (
              <Card key={s.label} sx={{ p: 2 }}>
                <Typography variant="caption" color="textSecondary">
                  {s.label}
                </Typography>
                <Typography variant="h3" sx={{ color: s.tone && s.value ? MONEY_TONE[s.tone] : 'text.primary', fontVariantNumeric: 'tabular-nums' }}>
                  {formatValue(s.type, s.value ?? 0)}
                </Typography>
              </Card>
            ))}
          </Box>
        )}

        {report.note && (
          <Alert severity="info" sx={{ mb: 2 }}>
            {report.note}
          </Alert>
        )}

        <Card>
          <Stack direction="row" sx={{ px: 2, py: 1.25, justifyContent: 'space-between', alignItems: 'center', borderBottom: 1, borderColor: 'divider' }}>
            <Typography variant="body2" color="textSecondary">
              {period}
              {f.includes('branch') ? ` · ${branchName}` : ''}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              {report.rows.length} row{report.rows.length === 1 ? '' : 's'}
            </Typography>
          </Stack>
          {report.rows.length === 0 ? (
            <EmptyState title="Nothing in this period" description="Try a wider date range or another branch." />
          ) : (
            <TableContainer>
              <Table size="small" stickyHeader sx={{ '& th, & td': { px: 1.25 }, '& th:first-of-type, & td:first-of-type': { pl: 2 }, '& th:last-of-type, & td:last-of-type': { pr: 2 }, '& th': { fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'text.secondary', whiteSpace: 'nowrap', py: 1.25 }, '& td': { fontSize: 13, py: 1 } }}>
                <TableHead>
                  <TableRow>
                    {report.columns.map((c) => (
                      <TableCell key={c.key} align={numeric(c.type) ? 'right' : 'left'}>
                        {c.label}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {report.rows.map((r, i) => (
                    <TableRow key={i} hover>
                      {report.columns.map((c) => (
                        <Cell key={c.key} column={c} row={r} value={r[c.key]} />
                      ))}
                    </TableRow>
                  ))}
                  {hasTotals && (
                    <TableRow sx={{ '& td': { borderTop: 2, borderColor: 'divider', bgcolor: 'action.hover' } }}>
                      {report.columns.map((c, i) =>
                        i === 0 ? (
                          <TableCell key={c.key} sx={{ fontWeight: 700 }}>
                            Total
                          </TableCell>
                        ) : c.key in report.totals ? (
                          <Cell key={c.key} column={c} value={report.totals[c.key]} total />
                        ) : (
                          <TableCell key={c.key} />
                        ),
                      )}
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Card>
        <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: 1 }} className="no-print">
          Generated {formatDateTime(report.generatedAt)}
        </Typography>
      </Box>
    </>
  );
}
