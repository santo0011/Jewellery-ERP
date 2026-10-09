import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import { Box, Card, CardContent, IconButton, LinearProgress, Skeleton, Stack, Tooltip, Typography } from '@mui/material';
import { useMemo, useState } from 'react';
import { ErrorState } from '../../components/StateViews.jsx';
import { tokens } from '../../theme/tokens.js';
import { formatDate } from '../../utils/format.js';
import { useAttendanceRegisterQuery } from './hrApi.js';
import { formatDays, monthLabel, thisMonth } from './hrUi.jsx';

/** Colours per day: soft fill + strong text, matching the attendance page. */
const LOOK = {
  present: { label: 'Present', short: 'P', bg: 'rgba(46, 125, 50, 0.12)', fg: 'success.main', dot: 'success.main' },
  absent: { label: 'Absent', short: 'A', bg: 'rgba(198, 40, 40, 0.14)', fg: 'error.main', dot: 'error.main' },
  half_day: { label: 'Half day', short: 'H', bg: 'rgba(237, 108, 2, 0.16)', fg: 'warning.dark', dot: 'warning.main' },
  paid_leave: { label: 'Paid leave', short: 'L', bg: 'rgba(2, 136, 209, 0.13)', fg: 'info.main', dot: 'info.main' },
  holiday: { label: 'Holiday / off', short: 'O', bg: 'action.hover', fg: 'text.secondary', dot: 'text.disabled' },
};
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const shiftMonth = (month, n) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const dateOf = (month, day) => `${month}-${String(day).padStart(2, '0')}`;

function SummaryTile({ look, value }) {
  return (
    <Box sx={{ flex: '1 1 0', minWidth: 64, px: 0.75, py: 0.75, borderRadius: 1.5, bgcolor: look.bg, textAlign: 'center' }}>
      <Typography sx={{ fontSize: '1.05rem', fontWeight: 700, lineHeight: 1.15, color: value ? look.fg : 'text.disabled' }}>{formatDays(value)}</Typography>
      <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary', fontWeight: 500, whiteSpace: 'nowrap' }}>
        {look.label}
      </Typography>
    </Box>
  );
}

/** One employee's month as a calendar: what was marked, holidays, and the paid days payroll will use. */
export default function EmployeeAttendance({ employee }) {
  const latest = thisMonth();
  const earliest = (employee.joiningDate ?? '').slice(0, 7) || latest;
  const [month, setMonth] = useState(latest);
  const { data, isFetching, error, refetch } = useAttendanceRegisterQuery({ branchId: employee.branch.id, month });
  const me = data?.employees.find((x) => String(x.id) === String(employee.id));

  const view = useMemo(() => {
    if (!data || !me) return null;
    const count = { present: 0, absent: 0, half_day: 0, paid_leave: 0, holiday: 0 };
    const cells = [];
    for (let d = 1; d <= data.days; d += 1) {
      const iso = dateOf(month, d);
      const offRoll = iso < me.from || iso > me.to || (me.breaks ?? []).some((b) => iso >= b.from && iso <= b.to);
      const future = iso > data.today;
      const mark = me.marks[iso] ?? null;
      const off = data.offDays[iso] ?? null;
      // Same rule as payroll: a mark wins; an unmarked off day is a holiday; any other past day is present.
      const status = offRoll ? null : (mark ?? (off ? 'holiday' : future ? null : 'present'));
      if (status) count[status] += 1;
      cells.push({ d, iso, offRoll, future, status, marked: Boolean(mark), off, today: iso === data.today });
    }
    const paid = me.eligibleDays - count.absent - count.half_day * 0.5;
    const lead = (new Date(`${month}-01T00:00:00Z`).getUTCDay() + 6) % 7; // blanks before the 1st (Mon-first week)
    return { cells, count, paid, lead };
  }, [data, me, month]);

  return (
    <Card>
      <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
        {/* Month switcher */}
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <IconButton size="small" onClick={() => setMonth((m) => shiftMonth(m, -1))} disabled={month <= earliest} aria-label="Previous month">
            <ChevronLeftRoundedIcon />
          </IconButton>
          <Box sx={{ textAlign: 'center' }}>
            <Typography sx={{ fontWeight: 700, fontSize: '1rem' }}>{monthLabel(month)}</Typography>
            {data?.locked && (
              <Typography variant="caption" color="textSecondary">
                Locked · salary finalised ({data.lockedBy})
              </Typography>
            )}
          </Box>
          <IconButton size="small" onClick={() => setMonth((m) => shiftMonth(m, 1))} disabled={month >= latest} aria-label="Next month">
            <ChevronRightRoundedIcon />
          </IconButton>
        </Stack>
        <Box sx={{ height: 3, mb: 1 }}>{isFetching && <LinearProgress sx={{ height: 3, borderRadius: 2 }} />}</Box>

        {error ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : !data ? (
          <Skeleton variant="rounded" height={280} />
        ) : !me || !view ? (
          <Typography color="textSecondary" sx={{ textAlign: 'center', py: 6 }}>
            {employee.name} was not on {employee.branch?.name ?? 'this branch'}’s rolls in {monthLabel(month)}.
          </Typography>
        ) : (
          <>
            {/* Summary */}
            <Stack direction="row" sx={{ gap: 0.75, flexWrap: 'wrap', mb: 1.5 }}>
              <SummaryTile look={LOOK.present} value={view.count.present} />
              <SummaryTile look={LOOK.absent} value={view.count.absent} />
              <SummaryTile look={LOOK.half_day} value={view.count.half_day} />
              <SummaryTile look={LOOK.paid_leave} value={view.count.paid_leave} />
              <SummaryTile look={LOOK.holiday} value={view.count.holiday} />
              <Box sx={{ flex: '1.3 1 0', minWidth: 84, px: 0.75, py: 0.75, borderRadius: 1.5, textAlign: 'center', border: '1px solid rgba(201, 162, 39, 0.45)', background: 'linear-gradient(145deg, rgba(201, 162, 39, 0.14), rgba(201, 162, 39, 0.03))' }}>
                <Typography sx={{ fontSize: '1.05rem', fontWeight: 700, lineHeight: 1.15, color: tokens.light.goldDark }}>
                  {formatDays(view.paid)}
                  <Box component="span" sx={{ fontSize: '0.75rem', color: 'text.secondary', fontWeight: 600 }}>
                    {' '}
                    / {me.eligibleDays}
                  </Box>
                </Typography>
                <Typography sx={{ fontSize: '0.6875rem', color: 'text.secondary', fontWeight: 500 }}>
                  Paid days
                </Typography>
              </Box>
            </Stack>

            {/* Calendar */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 0.5 }}>
              {WEEKDAYS.map((w, i) => (
                <Typography key={w} sx={{ fontSize: '0.6875rem', textAlign: 'center', fontWeight: 700, color: i === 6 ? 'error.main' : 'text.secondary', pb: 0.25 }}>
                  {w}
                </Typography>
              ))}
              {Array.from({ length: view.lead }, (_, i) => (
                <Box key={`b${i}`} />
              ))}
              {view.cells.map((c) => {
                const look = c.status ? LOOK[c.status] : null;
                const tip = c.offRoll
                  ? 'Not on the rolls'
                  : c.future
                    ? 'Upcoming'
                    : `${formatDate(c.iso)} · ${look.label}${c.off ? ` · ${c.off}` : ''}${c.marked || c.status === 'holiday' ? '' : ' (not marked)'}`;
                return (
                  <Tooltip key={c.iso} title={tip} arrow>
                    <Box
                      sx={{
                        position: 'relative',
                        height: 38,
                        borderRadius: 1,
                        px: 0.625,
                        py: 0.5,
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        bgcolor: look ? look.bg : 'transparent',
                        border: 1,
                        borderColor: c.today ? tokens.light.gold : look ? 'transparent' : 'divider',
                        boxShadow: c.today ? '0 0 0 2px rgba(201, 162, 39, 0.35)' : 'none',
                        opacity: c.offRoll ? 0.35 : 1,
                        backgroundImage: c.offRoll ? 'repeating-linear-gradient(135deg, transparent 0 6px, rgba(0,0,0,0.05) 6px 7px)' : undefined,
                      }}
                    >
                      <Typography sx={{ fontSize: '0.875rem', fontWeight: c.today ? 800 : 600, color: c.future || c.offRoll ? 'text.disabled' : 'text.primary', lineHeight: 1 }}>{c.d}</Typography>
                      {look && (
                        <Typography sx={{ alignSelf: 'flex-end', fontSize: '0.875rem', fontWeight: 800, color: look.fg, lineHeight: 1, opacity: c.marked || c.status === 'holiday' ? 1 : 0.55 }}>
                          {look.short}
                        </Typography>
                      )}
                    </Box>
                  </Tooltip>
                );
              })}
            </Box>

            {/* Legend */}
            <Stack direction="row" sx={{ mt: 1.25, gap: 1.25, flexWrap: 'wrap', justifyContent: 'center' }}>
              {Object.values(LOOK).map((l) => (
                <Stack key={l.short} direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                  <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: l.dot }} />
                  <Typography variant="caption" color="textSecondary">
                    <strong>{l.short}</strong> {l.label}
                  </Typography>
                </Stack>
              ))}
            </Stack>
            <Typography color="textSecondary" sx={{ display: 'block', textAlign: 'center', mt: 0.5, fontSize: '0.6875rem' }}>
              Faded letters are days nobody marked — they count as present, the same way payroll counts them.
            </Typography>
          </>
        )}
      </CardContent>
    </Card>
  );
}
