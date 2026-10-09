import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import DoneAllRoundedIcon from '@mui/icons-material/DoneAllRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import CelebrationOutlinedIcon from '@mui/icons-material/CelebrationOutlined';
import TodayOutlinedIcon from '@mui/icons-material/TodayOutlined';
import { Alert, Avatar, Box, Button, ButtonBase, Card, Chip, Divider, IconButton, MenuItem, Stack, Tab, Tabs, TextField, Tooltip, Typography, useMediaQuery } from '@mui/material';
import { ATTENDANCE_STATUSES } from '@jerp/shared';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import { useSearchParams } from 'react-router';
import AttendanceRecords from './AttendanceRecords.jsx';
import HolidaysPanel from './HolidaysPanel.jsx';
import PageHeader from '../../components/PageHeader.jsx';
import { EmptyState, ErrorState, LoadingState } from '../../components/StateViews.jsx';
import { usePermission, useSession } from '../../hooks/usePermission.js';
import { getErrorMessage } from '../../utils/errors.js';
import { useAttendanceDayQuery, useSaveAttendanceMutation } from './hrApi.js';
import { todayIso } from './hrUi.jsx';
import { EmployeeAvatar } from './EmployeePhoto.jsx';

const shiftDate = (iso, days) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const weekdayName = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'long', timeZone: 'UTC' });

// Same colours as the monthly register.
const TONE = {
  present: { filled: { bgcolor: 'success.main', color: '#fff' }, soft: { bgcolor: 'rgba(46,125,50,0.12)', color: 'success.main' }, ring: 'success.main' },
  absent: { filled: { bgcolor: 'error.main', color: '#fff' }, soft: { bgcolor: 'rgba(198,40,40,0.12)', color: 'error.main' }, ring: 'error.main' },
  half_day: { filled: { bgcolor: 'warning.main', color: '#fff' }, soft: { bgcolor: 'rgba(237,108,2,0.14)', color: 'warning.dark' }, ring: 'warning.main' },
  paid_leave: { filled: { bgcolor: 'info.main', color: '#fff' }, soft: { bgcolor: 'rgba(2,136,209,0.12)', color: 'info.main' }, ring: 'info.main' },
  holiday: { filled: { bgcolor: 'grey.600', color: '#fff' }, soft: { bgcolor: 'action.selected', color: 'text.secondary' }, ring: 'text.secondary' },
};
/** Palette colour behind each status, for the ring around an employee photo. */
const TONE_PALETTE = { present: 'success', absent: 'error', half_day: 'warning', paid_leave: 'info', holiday: 'grey' };
const STATUS_SHORT = { absent: 'absent', half_day: 'half', paid_leave: 'leave', holiday: 'off' };
const LETTER = Object.fromEntries(ATTENDANCE_STATUSES.map((s) => [s.value, s.short]));
const initials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');

function StatusBadge({ status, size = 22, filled, inverse }) {
  return (
    <Box
      component="span"
      sx={{
        width: size,
        height: size,
        borderRadius: '50%',
        flexShrink: 0,
        display: 'grid',
        placeItems: 'center',
        fontSize: Math.round(size * 0.48),
        fontWeight: 800,
        ...(inverse ? { bgcolor: 'rgba(255,255,255,0.25)', color: '#fff' } : filled ? TONE[status].filled : TONE[status].soft),
      }}
    >
      {LETTER[status]}
    </Box>
  );
}

function DailyAttendance({ branchId, branchPicker }) {
  const today = todayIso();
  const [date, setDate] = useState(today);
  const canMark = usePermission('attendance.mark');
  const canEditPast = usePermission('attendance.edit');
  const compact = useMediaQuery((theme) => theme.breakpoints.down('md'));
  const { data, isLoading, isFetching, error, refetch } = useAttendanceDayQuery({ branchId, date }, { skip: !branchId });
  const [save, saveState] = useSaveAttendanceMutation();
  const [draft, setDraft] = useState({});

  useEffect(() => {
    if (data) setDraft(Object.fromEntries(data.employees.map((e) => [e.id, e.status])));
  }, [data]);

  const editable = canMark && !data?.locked && (date === today || canEditPast);
  const changed = useMemo(() => (data ? data.employees.filter((e) => draft[e.id] && draft[e.id] !== e.status) : []), [data, draft]);
  const unmarked = data ? data.employees.filter((e) => !draft[e.id]).length : 0;
  // Unmarked staff count as present on a working day and as on holiday on a weekly off / holiday.
  const unmarkedAs = data?.dayOff ? 'holiday' : 'present';
  const counts = Object.fromEntries(ATTENDANCE_STATUSES.map((s) => [s.value, data ? data.employees.filter((e) => (draft[e.id] ?? unmarkedAs) === s.value).length : 0]));

  const onSave = async () => {
    try {
      await save({ branchId, date, entries: changed.map((e) => ({ employeeId: e.id, status: draft[e.id] })) }).unwrap();
      toast.success(`Attendance saved for ${changed.length} employee${changed.length > 1 ? 's' : ''}`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <>
      <Card sx={{ mb: 2, p: 2 }}>
        <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
          {branchPicker}
          <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', flexShrink: 0 }}>
            <IconButton aria-label="Previous day" onClick={() => setDate(shiftDate(date, -1))}>
              <ChevronLeftRoundedIcon />
            </IconButton>
            <TextField
              label={date === today ? `Today · ${weekdayName(date)}` : weekdayName(date)}
              type="date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today } }}
              sx={{ width: 190 }}
            />
            <IconButton aria-label="Next day" onClick={() => setDate(shiftDate(date, 1))} disabled={date >= today}>
              <ChevronRightRoundedIcon />
            </IconButton>
            {date !== today && (
              <Button size="small" onClick={() => setDate(today)} sx={{ whiteSpace: 'nowrap' }}>
                Go to today
              </Button>
            )}
          </Stack>
          {editable && (
            <Stack direction="row" spacing={1} sx={{ flexShrink: 0, ml: 'auto' }}>
              {unmarked > 0 && (
                <Tooltip title={`Mark the ${unmarked} unmarked employee${unmarked > 1 ? 's' : ''} as present`}>
                  <Button
                    variant="outlined"
                    color="secondary"
                    startIcon={<DoneAllRoundedIcon />}
                    onClick={() => setDraft((d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v ?? 'present'])))}
                    sx={{ whiteSpace: 'nowrap' }}
                  >
                    All present ({unmarked})
                  </Button>
                </Tooltip>
              )}
              <Button variant="contained" onClick={onSave} disabled={!changed.length || saveState.isLoading} sx={{ whiteSpace: 'nowrap', minWidth: 120 }}>
                {changed.length ? `Save (${changed.length})` : 'Saved'}
              </Button>
            </Stack>
          )}
        </Stack>
      </Card>

      {data?.dayOff && !data.locked && (
        <Alert severity="warning" icon={<CelebrationOutlinedIcon />} sx={{ mb: 2 }}>
          <strong>{data.dayOff}</strong> — the shop is closed. Staff you don’t mark are on holiday (paid). Mark anyone who came in as Present.
        </Alert>
      )}
      {data?.locked && (
        <Alert severity="info" icon={<LockOutlinedIcon />} sx={{ mb: 2 }}>
          Payroll {data.lockedBy} for this month is finalised, so attendance is locked.
        </Alert>
      )}
      {data && !data.locked && canMark && date !== today && !canEditPast && (
        <Alert severity="info" sx={{ mb: 2 }}>
          You can mark only today’s attendance. Changing past days needs the “Edit attendance” permission.
        </Alert>
      )}

      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !data?.employees.length ? (
        <Card>
          <EmptyState title="No employees on this date" description="Add employees under HR → Employees. Only staff who had joined by this date (and not left) appear here." />
        </Card>
      ) : (
        <Box sx={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity 120ms' }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(5, 1fr)' }, gap: 1.5, mb: 2 }}>
            {ATTENDANCE_STATUSES.map((s) => (
              <Card key={s.value} sx={{ p: 1.75, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <StatusBadge status={s.value} size={36} filled />
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="h3" sx={{ lineHeight: 1.1 }}>
                    {counts[s.value]}
                  </Typography>
                  <Typography variant="caption" color="textSecondary" noWrap sx={{ display: 'block' }}>
                    {s.label}
                  </Typography>
                </Box>
              </Card>
            ))}
          </Box>
          <Card>
            {data.employees.map((e, i) => {
              const value = draft[e.id] ?? null;
              const dirty = Boolean(value && value !== e.status);
              const m = e.month;
              const monthMarks = [
                ['absent', m.absent],
                ['half_day', m.halfDay],
                ['paid_leave', m.paidLeave],
                ['holiday', m.holiday],
              ].filter(([, n]) => n);
              return (
                <Box key={e.id}>
                  {i > 0 && <Divider />}
                  <Stack
                    direction={{ xs: 'column', md: 'row' }}
                    spacing={1.5}
                    sx={{ px: 2, py: 1.25, alignItems: { md: 'center' }, boxShadow: dirty ? (t) => `inset 3px 0 0 ${t.vars.palette.primary.main}` : 'none' }}
                  >
                    <Stack direction="row" spacing={1.5} sx={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
                      {e.photoFileId ? (
                        // Photo with a ring in the day's status colour (same colours as the buttons).
                        <EmployeeAvatar
                          employee={e}
                          size={36}
                          sx={{ boxShadow: 'none', outline: '2.5px solid', outlineOffset: 1.5, outlineColor: (t) => (!value ? t.vars.palette.divider : value === 'holiday' ? t.vars.palette.grey[600] : t.vars.palette[TONE_PALETTE[value]].main), transition: 'outline-color 150ms' }}
                        />
                      ) : (
                        <Avatar sx={{ width: 36, height: 36, fontSize: 13, fontWeight: 700, transition: 'background-color 150ms', ...(value ? TONE[value].filled : { bgcolor: 'action.selected', color: 'text.secondary' }) }}>
                          {initials(e.name)}
                        </Avatar>
                      )}
                      <Stack direction="row" spacing={1} sx={{ minWidth: 0, alignItems: 'center', flexWrap: 'wrap', rowGap: 0.25 }}>
                        <Typography variant="subtitle2" noWrap>
                          {e.name}
                        </Typography>
                        <Typography variant="body2" color="textSecondary" noWrap>
                          {e.code} · {e.designation}
                        </Typography>
                        {monthMarks.length === 0 ? (
                          <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600 }} noWrap>
                            Full month
                          </Typography>
                        ) : (
                          monthMarks.map(([st, n]) => (
                            <Tooltip key={st} title="This month">
                              <Box component="span" sx={{ px: 0.75, borderRadius: 1, fontSize: 11, fontWeight: 700, lineHeight: '18px', whiteSpace: 'nowrap', ...TONE[st].soft }}>
                                {n} {STATUS_SHORT[st]}
                              </Box>
                            </Tooltip>
                          ))
                        )}
                        {dirty && <Chip label="Unsaved" size="small" color="primary" variant="outlined" sx={{ height: 20, fontSize: 11 }} />}
                      </Stack>
                    </Stack>
                    <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', rowGap: 0.5 }} role="radiogroup" aria-label={`Attendance for ${e.name}`}>
                      {ATTENDANCE_STATUSES.map((s) => {
                        const on = value === s.value;
                        return (
                          <ButtonBase
                            key={s.value}
                            role="radio"
                            aria-checked={on}
                            aria-label={s.label}
                            disabled={!editable}
                            onClick={() => setDraft((d) => ({ ...d, [e.id]: s.value }))}
                            sx={{
                              gap: 0.5,
                              pl: 0.5,
                              pr: compact ? 0.5 : 1,
                              height: 28,
                              borderRadius: 999,
                              fontSize: 12,
                              fontWeight: 600,
                              border: 1,
                              transition: 'all 120ms',
                              ...(on ? { ...TONE[s.value].filled, borderColor: 'transparent', boxShadow: 1 } : { borderColor: 'divider', color: 'text.secondary', bgcolor: 'background.paper' }),
                              '&:hover': on ? {} : { borderColor: TONE[s.value].ring, color: 'text.primary' },
                              '&.Mui-disabled': { opacity: on ? 1 : 0.55 },
                            }}
                          >
                            <StatusBadge status={s.value} size={18} filled={!on} inverse={on} />
                            {!compact && (s.value === 'holiday' ? 'Holiday' : s.label)}
                          </ButtonBase>
                        );
                      })}
                    </Stack>
                  </Stack>
                </Box>
              );
            })}
            <Divider />
            <Typography variant="caption" color="textSecondary" sx={{ display: 'block', px: 2, py: 1.25 }}>
              {data.dayOff ? 'Grey avatar = not marked (on holiday today).' : 'Grey avatar = not marked yet (counts as present).'} Set weekly off and holidays in the Holidays & week off tab.
            </Typography>
          </Card>
        </Box>
      )}
    </>
  );
}

const VIEWS = [
  { value: 'mark', label: 'Mark attendance', icon: TodayOutlinedIcon },
  { value: 'records', label: 'Records', icon: CalendarMonthOutlinedIcon },
  { value: 'holidays', label: 'Holidays & week off', icon: CelebrationOutlinedIcon },
];

export default function AttendancePage() {
  const { data: session } = useSession();
  const activeBranchId = useSelector((s) => s.auth.activeBranchId);
  const [branchId, setBranchId] = useState(activeBranchId ?? session.branches[0]?.id ?? '');
  const [params, setParams] = useSearchParams();
  const view = VIEWS.some((v) => v.value === params.get('view')) ? params.get('view') : 'mark';

  const branchPicker =
    session.branches.length > 1 ? (
      <TextField select label="Branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} sx={{ width: { md: 220 }, flexShrink: 0 }}>
        {session.branches.map((b) => (
          <MenuItem key={b.id} value={b.id}>
            {b.name}
          </MenuItem>
        ))}
      </TextField>
    ) : null;

  return (
    <>
      <PageHeader title="Attendance" subtitle="Mark only who was absent, on leave or a half day — everyone else counts as present." />
      <Tabs value={view} onChange={(e, v) => setParams(v === 'mark' ? {} : { view: v }, { replace: true })} variant="scrollable" allowScrollButtonsMobile sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
        {VIEWS.map(({ value, label, icon: Icon }) => (
          <Tab key={value} value={value} label={label} icon={<Icon fontSize="small" />} iconPosition="start" sx={{ minHeight: 48, textTransform: 'none', fontWeight: 600 }} />
        ))}
      </Tabs>
      {view === 'mark' && <DailyAttendance branchId={branchId} branchPicker={branchPicker} />}
      {view === 'records' && <AttendanceRecords branchId={branchId} branchPicker={branchPicker} />}
      {view === 'holidays' && <HolidaysPanel branchId={branchId} branchPicker={branchPicker} />}
    </>
  );
}
