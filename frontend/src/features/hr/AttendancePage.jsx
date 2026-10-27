import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import DoneAllRoundedIcon from '@mui/icons-material/DoneAllRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import CelebrationOutlinedIcon from '@mui/icons-material/CelebrationOutlined';
import TodayOutlinedIcon from '@mui/icons-material/TodayOutlined';
import { Alert, Avatar, Box, Button, ButtonBase, Card, Chip, Divider, IconButton, MenuItem, Stack, TextField, Tooltip, Typography, useMediaQuery } from '@mui/material';
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
import ViewTabs from '../../components/ViewTabs.jsx';
import { t, getLocale } from '../../i18n/index.js';

const shiftDate = (iso, days) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const weekdayName = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(getLocale(), { weekday: 'long', timeZone: 'UTC' });

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
const STATUS_SHORT = { absent: t('Absent'), half_day: t('Half'), paid_leave: t('Leave'), holiday: t('Off') };
/** Word under each status button on phones and tablets. */
const SHORT_LABEL = { present: t('Present'), absent: t('Absent'), half_day: t('Half'), paid_leave: t('Leave'), holiday: t('Off') };
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
      toast.success((changed.length > 1 ? t('Attendance saved for {{count}} employees', { count: changed.length }) : t('Attendance saved for {{count}} employee', { count: changed.length })));
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const markAllPresent = () => setDraft((d) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v ?? 'present'])));
  // Phones / tablets: the arrows are bordered squares beside the date field.
  const arrowSx = compact ? { border: 1, borderColor: 'divider', borderRadius: 2, width: 40, height: 40, flexShrink: 0 } : undefined;

  return (
    <>
      {/* Phones: the day picker takes a full row and the date field fills what is left; Save sits in a bar at the bottom. */}
      <Card sx={{ mb: 2, p: { xs: 1.5, sm: 2 } }}>
        <Stack direction="row" sx={{ alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
          {branchPicker}
          <Stack direction="row" spacing={compact ? 1 : 0.5} sx={{ alignItems: 'center', flexShrink: 0, width: { xs: '100%', sm: 'auto' }, minWidth: 0 }}>
            <IconButton aria-label={t('Previous day')} onClick={() => setDate(shiftDate(date, -1))} sx={arrowSx}>
              <ChevronLeftRoundedIcon />
            </IconButton>
            <TextField
              label={date === today ? t('Today · {{weekdayName}}', { weekdayName: weekdayName(date) }) : weekdayName(date)}
              type="date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: today } }}
              sx={{ width: { xs: 'auto', sm: 190 }, flex: { xs: 1, sm: 'none' }, minWidth: 0 }}
            />
            <IconButton aria-label={t('Next day')} onClick={() => setDate(shiftDate(date, 1))} disabled={date >= today} sx={arrowSx}>
              <ChevronRightRoundedIcon />
            </IconButton>
            {date !== today && (
              <Button size="small" onClick={() => setDate(today)} sx={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                {t('Today')}
              </Button>
            )}
          </Stack>
          {editable && !compact && (
            <Stack direction="row" spacing={1} sx={{ flexShrink: 0, ml: { xs: 0, sm: 'auto' }, width: { xs: '100%', sm: 'auto' }, '& > *': { flex: { xs: 1, sm: 'none' } }, '& .MuiButton-root': { width: { xs: '100%', sm: 'auto' } } }}>
              {unmarked > 0 && (
                <Tooltip title={(unmarked > 1 ? t('Mark the {{unmarked}} unmarked employees as present', { unmarked }) : t('Mark the {{unmarked}} unmarked employee as present', { unmarked }))}>
                  <Button
                    variant="outlined"
                    color="secondary"
                    startIcon={<DoneAllRoundedIcon />}
                    onClick={markAllPresent}
                    sx={{ whiteSpace: 'nowrap' }}
                  >
                    {t('All present ({{unmarked}})', { unmarked })}
                  </Button>
                </Tooltip>
              )}
              <Button variant="contained" onClick={onSave} disabled={!changed.length || saveState.isLoading} sx={{ whiteSpace: 'nowrap', minWidth: 120 }}>
                {changed.length ? t('Save ({{count}})', { count: changed.length }) : t('Saved')}
              </Button>
            </Stack>
          )}
        </Stack>
      </Card>

      {data?.dayOff && !data.locked && (
        <Alert severity="warning" icon={<CelebrationOutlinedIcon />} sx={{ mb: 2 }}>
          <strong>{data.dayOff}</strong> {t('— the shop is closed. Staff you don’t mark are on holiday (paid). Mark anyone who came in as Present.')}
        </Alert>
      )}
      {data?.locked && (
        <Alert severity="info" icon={<LockOutlinedIcon />} sx={{ mb: 2 }}>
          {t('Payroll {{lockedBy}} for this month is finalised, so attendance is locked.', { lockedBy: data.lockedBy })}
        </Alert>
      )}
      {data && !data.locked && canMark && date !== today && !canEditPast && (
        <Alert severity="info" sx={{ mb: 2 }}>
          {t('You can mark only today’s attendance. Changing past days needs the “Edit attendance” permission.')}
        </Alert>
      )}

      {isLoading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : !data?.employees.length ? (
        <Card>
          <EmptyState title={t('No employees on this date')} description={t('Add employees under HR → Employees. Only staff who had joined by this date (and not left) appear here.')} />
        </Card>
      ) : (
        <Box sx={{ opacity: isFetching ? 0.6 : 1, transition: 'opacity 120ms' }}>
          {compact ? (
            // Phones / tablets: the day's counts as one strip — all five in a row, letter and number over a short word.
            <Card sx={{ mb: 2, display: 'grid', gridTemplateColumns: `repeat(${ATTENDANCE_STATUSES.length}, minmax(0, 1fr))` }}>
              {ATTENDANCE_STATUSES.map((s, i) => (
                <Stack key={s.value} spacing={0.5} sx={{ alignItems: 'center', py: 1.25, px: 0.5, minWidth: 0, borderLeft: i ? 1 : 0, borderColor: 'divider', borderTop: 3, borderTopColor: TONE[s.value].ring }}>
                  <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center' }}>
                    <StatusBadge status={s.value} size={20} filled />
                    <Typography sx={{ fontSize: '1.25rem', fontWeight: 800, lineHeight: 1, color: counts[s.value] ? 'text.primary' : 'text.disabled' }}>{counts[s.value]}</Typography>
                  </Stack>
                  <Typography variant="caption" color="textSecondary" noWrap sx={{ fontSize: 11, fontWeight: 600, maxWidth: '100%' }}>
                    {SHORT_LABEL[s.value]}
                  </Typography>
                </Stack>
              ))}
            </Card>
          ) : (
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 1.5, mb: 2 }}>
              {ATTENDANCE_STATUSES.map((s) => (
                <Card key={s.value} sx={{ height: '100%', p: 1.75, display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
                  <StatusBadge status={s.value} size={36} filled />
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="h3" sx={{ lineHeight: 1.1, fontSize: '1.375rem' }}>
                      {counts[s.value]}
                    </Typography>
                    <Typography variant="caption" color="textSecondary" noWrap sx={{ display: 'block' }}>
                      {s.label}
                    </Typography>
                  </Box>
                </Card>
              ))}
            </Box>
          )}
          {/* Desktop: one card with a row per person. Phones / tablets: a card per person. */}
          <Box component={compact ? Stack : Card} spacing={compact ? 1.25 : undefined}>
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
                <Box key={e.id} component={compact ? Card : 'div'}>
                  {i > 0 && !compact && <Divider />}
                  <Stack
                    direction={{ xs: 'column', md: 'row' }}
                    spacing={1.5}
                    sx={{ px: { xs: 1.5, sm: 2 }, py: compact ? 1.5 : 1.25, alignItems: { md: 'center' }, boxShadow: dirty ? (theme) => `inset 3px 0 0 ${theme.vars.palette.primary.main}` : 'none' }}
                  >
                    <Stack direction="row" spacing={1.5} sx={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
                      {e.photoFileId ? (
                        // Photo with a ring in the day's status colour (same colours as the buttons).
                        <EmployeeAvatar
                          employee={e}
                          size={36}
                          sx={{ boxShadow: 'none', outline: '2.5px solid', outlineOffset: 1.5, outlineColor: (theme) => (!value ? theme.vars.palette.divider : value === 'holiday' ? theme.vars.palette.grey[600] : theme.vars.palette[TONE_PALETTE[value]].main), transition: 'outline-color 150ms' }}
                        />
                      ) : (
                        <Avatar sx={{ width: 36, height: 36, fontSize: 13, fontWeight: 700, transition: 'background-color 150ms', ...(value ? TONE[value].filled : { bgcolor: 'action.selected', color: 'text.secondary' }) }}>
                          {initials(e.name)}
                        </Avatar>
                      )}
                      {compact ? (
                        // Phones / tablets: name over code · designation; this month's tally on its own line.
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
                            <Typography variant="subtitle2" noWrap sx={{ fontSize: '0.9375rem' }}>
                              {e.name}
                            </Typography>
                            {dirty && <Chip label={t('Unsaved')} size="small" color="primary" variant="outlined" sx={{ height: 20, fontSize: 11, flexShrink: 0 }} />}
                          </Stack>
                          <Typography variant="caption" color="textSecondary" noWrap component="div">
                            {e.code} · {e.designation}
                          </Typography>
                          <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: 'wrap', rowGap: 0.5 }}>
                            {monthMarks.length === 0 ? (
                              <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600 }} noWrap>
                                {t('Full month')}
                              </Typography>
                            ) : (
                              monthMarks.map(([st, n]) => (
                                <Box key={st} component="span" sx={{ px: 0.75, borderRadius: 1, fontSize: 11, fontWeight: 700, lineHeight: '18px', whiteSpace: 'nowrap', ...TONE[st].soft }}>
                                  {n} {STATUS_SHORT[st]}
                                </Box>
                              ))
                            )}
                          </Stack>
                        </Box>
                      ) : (
                      <Stack direction="row" spacing={1} sx={{ minWidth: 0, alignItems: 'center', flexWrap: 'wrap', rowGap: 0.25 }}>
                        <Typography variant="subtitle2" noWrap>
                          {e.name}
                        </Typography>
                        <Typography variant="body2" color="textSecondary" noWrap>
                          {e.code} · {e.designation}
                        </Typography>
                        {monthMarks.length === 0 ? (
                          <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600 }} noWrap>
                            {t('Full month')}
                          </Typography>
                        ) : (
                          monthMarks.map(([st, n]) => (
                            <Tooltip key={st} title={t('This month')}>
                              <Box component="span" sx={{ px: 0.75, borderRadius: 1, fontSize: 11, fontWeight: 700, lineHeight: '18px', whiteSpace: 'nowrap', ...TONE[st].soft }}>
                                {n} {STATUS_SHORT[st]}
                              </Box>
                            </Tooltip>
                          ))
                        )}
                        {dirty && <Chip label={t('Unsaved')} size="small" color="primary" variant="outlined" sx={{ height: 20, fontSize: 11 }} />}
                      </Stack>
                      )}
                    </Stack>
                    {/* Phones / tablets: the five buttons share the full width — bigger targets, with a short word under each. */}
                    <Box
                      role="radiogroup"
                      aria-label={t('Attendance for {{name}}', { name: e.name })}
                      sx={compact ? { display: 'grid', gridTemplateColumns: `repeat(${ATTENDANCE_STATUSES.length}, minmax(0, 1fr))`, gap: 0.75, width: '100%' } : { display: 'flex', flexWrap: 'wrap', gap: 0.5 }}
                    >
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
                              ...(compact ? { flexDirection: 'column', gap: 0.4, py: 0.75, minHeight: 52, borderRadius: 2, fontSize: 11 } :{ gap: 0.5, pl: 0.5, pr: 1, height: 28, borderRadius: 999, fontSize: 12 }),
                              fontWeight: 600,
                              border: 1,
                              transition: 'all 120ms',
                              ...(on ? { ...TONE[s.value].filled, borderColor: 'transparent', boxShadow: 1 } : { borderColor: 'divider', color: 'text.secondary', bgcolor: 'background.paper' }),
                              '&:hover': on ? {} : { borderColor: TONE[s.value].ring, color: 'text.primary' },
                              '&.Mui-disabled': { opacity: on ? 1 : 0.55 },
                            }}
                          >
                            <StatusBadge status={s.value} size={compact ? 22 : 18} filled={!on} inverse={on} />
                            {compact ? <Box component="span" sx={{ lineHeight: 1.1, whiteSpace: 'nowrap' }}>{SHORT_LABEL[s.value]}</Box> : s.value === 'holiday' ? t('Holiday') : s.label}
                          </ButtonBase>
                        );
                      })}
                    </Box>
                  </Stack>
                </Box>
              );
            })}
            {!compact && <Divider />}
            <Typography variant="caption" color="textSecondary" sx={{ display: 'block', px: compact ? 0.5 : 2, py: 1.25 }}>
              {data.dayOff ? t('Grey avatar = not marked (on holiday today).') : t('Grey avatar = not marked yet (counts as present).')} {t('Set weekly off and holidays in the Holidays & week off tab.')}
            </Typography>
          </Box>

          {/* Phones / tablets: All present and Save stay in reach in a bar above the bottom navigation. */}
          {compact && editable && (
            <Box sx={{ position: 'sticky', bottom: 'calc(84px + env(safe-area-inset-bottom))', zIndex: 2, mt: 1 }}>
              <Stack
                direction="row"
                spacing={1}
                sx={{ p: 1, borderRadius: 3, border: 1, borderColor: 'divider', bgcolor: 'background.paper', boxShadow: '0 10px 30px -8px rgba(23, 23, 23, 0.3)', '& .MuiButton-root': { flex: 1, minHeight: 44, whiteSpace: 'nowrap' } }}
              >
                {unmarked > 0 && (
                  <Button variant="outlined" color="secondary" startIcon={<DoneAllRoundedIcon />} onClick={markAllPresent}>
                    {t('All present ({{unmarked}})', { unmarked })}
                  </Button>
                )}
                <Button variant="contained" onClick={onSave} disabled={!changed.length || saveState.isLoading}>
                  {changed.length ? t('Save ({{count}})', { count: changed.length }) : t('Saved')}
                </Button>
              </Stack>
            </Box>
          )}
        </Box>
      )}
    </>
  );
}

const VIEWS = [
  // `short` is the label on phones, where the three share one row.
  { value: 'mark', label: t('Mark attendance'), short: t('Mark'), icon: TodayOutlinedIcon },
  { value: 'records', label: t('Records'), short: t('Records'), icon: CalendarMonthOutlinedIcon },
  { value: 'holidays', label: t('Holidays & week off'), short: t('Holidays'), icon: CelebrationOutlinedIcon },
];

export default function AttendancePage() {
  const { data: session } = useSession();
  const activeBranchId = useSelector((s) => s.auth.activeBranchId);
  const [branchId, setBranchId] = useState(activeBranchId ?? session.branches[0]?.id ?? '');
  const [params, setParams] = useSearchParams();
  const view = VIEWS.some((v) => v.value === params.get('view')) ? params.get('view') : 'mark';
  const openView = (v) => setParams(v === 'mark' ? {} : { view: v }, { replace: true });

  const branchPicker =
    session.branches.length > 1 ? (
      <TextField select label={t('Branch')} value={branchId} onChange={(e) => setBranchId(e.target.value)} sx={{ width: { md: 220 }, flexShrink: 0 }}>
        {session.branches.map((b) => (
          <MenuItem key={b.id} value={b.id}>
            {b.name}
          </MenuItem>
        ))}
      </TextField>
    ) : null;

  return (
    <>
      <PageHeader title={t('Attendance')} subtitle={t('Mark only who was absent, on leave or a half day — everyone else counts as present.')} />
      <ViewTabs value={view} onChange={openView} items={VIEWS} />
      {view === 'mark' && <DailyAttendance branchId={branchId} branchPicker={branchPicker} />}
      {view === 'records' && <AttendanceRecords branchId={branchId} branchPicker={branchPicker} />}
      {view === 'holidays' && <HolidaysPanel branchId={branchId} branchPicker={branchPicker} />}
    </>
  );
}
