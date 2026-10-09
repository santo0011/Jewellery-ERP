import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { Alert, Box, Card, IconButton, Link, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography } from '@mui/material';
import { ATTENDANCE_STATUSES } from '@jerp/shared';
import { useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router';
import { EmptyState, ErrorState, LoadingState } from '../../components/StateViews.jsx';
import { useAttendanceRegisterQuery } from './hrApi.js';
import { formatDays, monthLabel, thisMonth } from './hrUi.jsx';
import { EmployeeAvatar } from './EmployeePhoto.jsx';

const STATUS = Object.fromEntries(ATTENDANCE_STATUSES.map((s) => [s.value, s]));
export const CELL_STYLE = {
  present: { color: 'success.main', bgcolor: 'transparent' },
  absent: { color: '#fff', bgcolor: 'error.main' },
  half_day: { color: '#fff', bgcolor: 'warning.main' },
  paid_leave: { color: '#fff', bgcolor: 'info.main' },
  holiday: { color: 'text.secondary', bgcolor: 'action.selected' },
};
const CELL = 26;
const WEEKDAY = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const dateOf = (month, day) => `${month}-${String(day).padStart(2, '0')}`;
const weekday = (iso) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const shiftMonth = (month, by) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + by, 1)).toISOString().slice(0, 7);
};

function Tile({ label, value, tone }) {
  return (
    <Card sx={{ p: 1.75 }}>
      <Typography variant="caption" color="textSecondary">
        {label}
      </Typography>
      <Typography variant="h3" sx={{ color: tone ?? 'text.primary' }}>
        {value}
      </Typography>
    </Card>
  );
}

/** Read-only month view: who was present, absent, on leave or off each day, and the totals pay is based on. */
export default function AttendanceRecords({ branchId, branchPicker }) {
  const [month, setMonth] = useState(thisMonth());
  const { data, isLoading, isFetching, error, refetch } = useAttendanceRegisterQuery({ branchId, month }, { skip: !branchId });

  const rows = useMemo(() => {
    if (!data) return [];
    return data.employees.map((e) => {
      const c = { absent: 0, half_day: 0, paid_leave: 0, holiday: 0, present: 0 };
      const cells = [];
      for (let d = 1; d <= data.days; d += 1) {
        const iso = dateOf(month, d);
        const offRoll = iso < e.from || iso > e.to || (e.breaks ?? []).some((b) => iso >= b.from && iso <= b.to);
        const future = iso > data.today;
        const mark = e.marks[iso] ?? null;
        const off = data.offDays[iso] ?? null;
        // Same rule as payroll: a mark wins; an unmarked weekly off / holiday is a holiday; any other day is present.
        const effective = offRoll ? null : mark ?? (off ? 'holiday' : future ? null : 'present');
        if (effective) c[effective] += 1;
        cells.push({ iso, offRoll, future, mark, off, effective });
      }
      return { ...e, cells, c, paid: e.eligibleDays - c.absent - c.half_day * 0.5 };
    });
  }, [data, month]);

  const totals = rows.reduce((t, r) => ({ absent: t.absent + r.c.absent, half: t.half + r.c.half_day, leave: t.leave + r.c.paid_leave }), { absent: 0, half: 0, leave: 0 });
  const days = data ? Array.from({ length: data.days }, (_, i) => i + 1) : [];
  const holidays = data ? Object.entries(data.offDays).filter(([, n]) => !n.startsWith('Weekly off')) : [];

  return (
    <>
      <Card sx={{ mb: 2, p: 2 }}>
        <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
          {branchPicker}
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
            <IconButton aria-label="Previous month" onClick={() => setMonth(shiftMonth(month, -1))}>
              <ChevronLeftRoundedIcon />
            </IconButton>
            <TextField label="Month" type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: thisMonth() } }} sx={{ width: 200 }} />
            <IconButton aria-label="Next month" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= thisMonth()}>
              <ChevronRightRoundedIcon />
            </IconButton>
          </Stack>
          {holidays.length > 0 && (
            <Typography variant="body2" color="textSecondary" sx={{ ml: 'auto' }}>
              Holidays: {holidays.map(([d, n]) => `${Number(d.slice(8))} ${n}`).join(' · ')}
            </Typography>
          )}
        </Stack>
      </Card>

      {data?.locked && (
        <Alert severity="info" icon={<LockOutlinedIcon />} sx={{ mb: 2 }}>
          Payroll {data.lockedBy} for {monthLabel(month)} is finalised — this month is locked.
        </Alert>
      )}

      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !rows.length ? (
        <Card>
          <EmptyState title={`No employees in ${monthLabel(month)}`} description="Only staff on this branch’s rolls during the month appear here." />
        </Card>
      ) : (
        <Box sx={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity 120ms' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 1.5, mb: 2 }}>
            <Tile label="Staff" value={rows.length} />
            <Tile label="Absent days" value={totals.absent} tone={totals.absent ? 'error.main' : undefined} />
            <Tile label="Half days" value={totals.half} tone={totals.half ? 'warning.main' : undefined} />
            <Tile label="Paid leave days" value={totals.leave} />
          </Box>

          <Card sx={{ mb: 2 }}>
            <Box sx={{ overflowX: 'auto' }}>
              <Box component="table" sx={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%' }}>
                <thead>
                  <tr>
                    <Box component="th" sx={{ position: 'sticky', left: 0, zIndex: 2, bgcolor: 'background.paper', textAlign: 'left', px: 2, py: 1, minWidth: 140, borderBottom: 1, borderColor: 'divider' }}>
                      <Typography variant="overline" color="textSecondary">
                        {monthLabel(month)}
                      </Typography>
                    </Box>
                    {days.map((d) => {
                      const iso = dateOf(month, d);
                      const off = data.offDays[iso];
                      const today = iso === data.today;
                      return (
                        <Tooltip key={d} title={off ?? ''} disableInteractive>
                          <Box component="th" sx={{ minWidth: CELL + 1, px: 0, py: 0.75, borderBottom: 1, borderColor: 'divider', bgcolor: off ? 'action.hover' : 'transparent' }}>
                            <Typography variant="caption" sx={{ display: 'block', lineHeight: 1.2, fontWeight: today ? 800 : 600, color: today ? 'primary.main' : 'text.primary' }}>
                              {d}
                            </Typography>
                            <Typography variant="caption" sx={{ display: 'block', lineHeight: 1.2, fontSize: 10, color: off ? 'error.main' : 'text.secondary' }}>
                              {WEEKDAY[weekday(iso)]}
                            </Typography>
                          </Box>
                        </Tooltip>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <Box component="tr" key={e.id} sx={{ '&:hover td': { bgcolor: 'action.hover' } }}>
                      <Box component="td" sx={{ position: 'sticky', left: 0, zIndex: 1, bgcolor: 'background.paper', px: 2, py: 0.75, borderBottom: 1, borderColor: 'divider' }}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                          <EmployeeAvatar employee={e} size={30} />
                          <Box sx={{ minWidth: 0 }}>
                            <Link component={RouterLink} to={`/hr/employees/${e.id}`} underline="hover" color="inherit" variant="body2" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                              {e.name}
                            </Link>
                            <Typography variant="caption" color="textSecondary" sx={{ display: 'block' }}>
                              {e.code}
                            </Typography>
                          </Box>
                        </Stack>
                      </Box>
                      {e.cells.map((cell) => {
                        const label = cell.offRoll ? 'Not on rolls' : cell.mark ? STATUS[cell.mark].label : cell.off ? `${cell.off} (not marked)` : cell.future ? '' : 'Not marked — present';
                        const shown = cell.mark ?? (cell.off && !cell.offRoll ? 'holiday' : null);
                        return (
                          <Box component="td" key={cell.iso} sx={{ p: 0, textAlign: 'center', borderBottom: 1, borderColor: 'divider', bgcolor: cell.off ? 'action.hover' : 'transparent' }}>
                            <Tooltip title={label ? `${Number(cell.iso.slice(8))} · ${label}` : ''} disableInteractive enterDelay={300}>
                              <Box
                                sx={{
                                  width: CELL - 3,
                                  height: CELL,
                                  mx: 'auto',
                                  my: 0.5,
                                  borderRadius: 1,
                                  display: 'grid',
                                  placeItems: 'center',
                                  fontSize: 12,
                                  fontWeight: 700,
                                  ...(cell.offRoll
                                    ? { backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 4px, rgba(128,128,128,0.18) 4px 5px)' }
                                    : shown
                                      ? { ...CELL_STYLE[shown], ...(cell.mark ? {} : { opacity: 0.55 }) }
                                      : { color: 'text.disabled' }),
                                }}
                              >
                                {cell.offRoll ? '' : shown ? STATUS[shown].short : cell.future ? '' : '·'}
                              </Box>
                            </Tooltip>
                          </Box>
                        );
                      })}
                    </Box>
                  ))}
                </tbody>
              </Box>
            </Box>
            <Stack direction="row" spacing={2} sx={{ px: 2, py: 1.25, flexWrap: 'wrap', rowGap: 0.75, borderTop: 1, borderColor: 'divider' }}>
              {ATTENDANCE_STATUSES.map((s) => (
                <Stack key={s.value} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                  <Box sx={{ width: 18, height: 18, borderRadius: 0.75, display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, border: s.value === 'present' ? 1 : 0, borderColor: 'success.main', ...CELL_STYLE[s.value] }}>{s.short}</Box>
                  <Typography variant="caption" color="textSecondary">
                    {s.label}
                  </Typography>
                </Stack>
              ))}
              <Typography variant="caption" color="textSecondary">
                · not marked (present) · faded W = weekly off / holiday, not marked · grey column = day off
              </Typography>
            </Stack>
          </Card>

          <Card>
            <Typography variant="h4" sx={{ px: 2, pt: 2 }}>
              Month summary
            </Typography>
            <Typography variant="body2" color="textSecondary" sx={{ px: 2, pb: 1 }}>
              Paid days are what payroll uses: absent days are not paid, a half day is paid half.
            </Typography>
            <Table size="small" sx={{ '& th': { fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'text.secondary' } }}>
              <TableHead>
                <TableRow>
                  <TableCell>Employee</TableCell>
                  <TableCell align="right">Days on rolls</TableCell>
                  <TableCell align="right">Present</TableCell>
                  <TableCell align="right">Absent</TableCell>
                  <TableCell align="right">Half day</TableCell>
                  <TableCell align="right">Leave</TableCell>
                  <TableCell align="right">Holiday / off</TableCell>
                  <TableCell align="right">Paid days</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        {r.name}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        {r.designation}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">{r.eligibleDays}</TableCell>
                    <TableCell align="right" sx={{ color: 'success.main', fontWeight: 600 }}>
                      {r.c.present}
                    </TableCell>
                    <TableCell align="right" sx={{ color: r.c.absent ? 'error.main' : 'text.secondary', fontWeight: r.c.absent ? 700 : 400 }}>
                      {r.c.absent}
                    </TableCell>
                    <TableCell align="right" sx={{ color: r.c.half_day ? 'warning.dark' : 'text.secondary' }}>
                      {r.c.half_day}
                    </TableCell>
                    <TableCell align="right">{r.c.paid_leave}</TableCell>
                    <TableCell align="right">{r.c.holiday}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700 }}>
                      {formatDays(r.paid)} / {r.eligibleDays}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </Box>
      )}
    </>
  );
}
