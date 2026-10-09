import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CelebrationOutlinedIcon from '@mui/icons-material/CelebrationOutlined';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import EventRepeatOutlinedIcon from '@mui/icons-material/EventRepeatOutlined';
import { Alert, Box, Button, ButtonBase, Card, Chip, Divider, IconButton, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { EmptyState, ErrorState, LoadingState } from '../../components/StateViews.jsx';
import { usePermission } from '../../hooks/usePermission.js';
import { getErrorMessage } from '../../utils/errors.js';
import { useAttendanceCalendarQuery, useSaveAttendanceCalendarMutation } from './hrApi.js';

// Monday first, as shop rosters are written.
const DAYS = [
  { value: 1, short: 'Mon', label: 'Monday' },
  { value: 2, short: 'Tue', label: 'Tuesday' },
  { value: 3, short: 'Wed', label: 'Wednesday' },
  { value: 4, short: 'Thu', label: 'Thursday' },
  { value: 5, short: 'Fri', label: 'Friday' },
  { value: 6, short: 'Sat', label: 'Saturday' },
  { value: 0, short: 'Sun', label: 'Sunday' },
];
// Fixed-date national holidays offered as one-click adds; festivals change every year, so they are typed in.
const NATIONAL = [
  { md: '01-26', name: 'Republic Day' },
  { md: '05-01', name: 'May Day' },
  { md: '08-15', name: 'Independence Day' },
  { md: '10-02', name: 'Gandhi Jayanti' },
  { md: '12-25', name: 'Christmas' },
];
const pretty = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const monthName = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', timeZone: 'UTC' });

export default function HolidaysPanel({ branchId, branchPicker }) {
  const canEdit = usePermission('attendance.edit');
  const { data, isLoading, error, refetch } = useAttendanceCalendarQuery({ branchId }, { skip: !branchId });
  const [save, saveState] = useSaveAttendanceCalendarMutation();
  const [weeklyOff, setWeeklyOff] = useState([0]);
  const [holidays, setHolidays] = useState([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [newDate, setNewDate] = useState('');
  const [newName, setNewName] = useState('');

  useEffect(() => {
    if (data) {
      setWeeklyOff(data.weeklyOff);
      setHolidays(data.holidays);
    }
  }, [data]);

  const dirty = data && (JSON.stringify([...weeklyOff].sort()) !== JSON.stringify([...data.weeklyOff].sort()) || JSON.stringify(holidays) !== JSON.stringify(data.holidays));
  const yearHolidays = useMemo(() => holidays.filter((h) => h.date.startsWith(String(year))), [holidays, year]);
  const byMonth = useMemo(() => {
    const groups = new Map();
    for (const h of yearHolidays) groups.set(h.date.slice(0, 7), [...(groups.get(h.date.slice(0, 7)) ?? []), h]);
    return [...groups.entries()];
  }, [yearHolidays]);
  const suggestions = NATIONAL.map((n) => ({ date: `${year}-${n.md}`, name: n.name })).filter((n) => !holidays.some((h) => h.date === n.date));

  const add = (h) => {
    if (holidays.some((x) => x.date === h.date)) return toast.error(`${pretty(h.date)} is already a holiday`);
    setHolidays((list) => [...list, h].sort((a, b) => a.date.localeCompare(b.date)));
    return undefined;
  };
  const toggleDay = (v) => setWeeklyOff((w) => (w.includes(v) ? w.filter((x) => x !== v) : w.length >= 6 ? w : [...w, v]));

  const onSave = async () => {
    try {
      await save({ branchId, weeklyOff, holidays }).unwrap();
      toast.success('Holidays and weekly off saved');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  if (isLoading) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  return (
    <>
      {branchPicker && <Card sx={{ mb: 2, p: 2 }}>{branchPicker}</Card>}
      {!canEdit && (
        <Alert severity="info" sx={{ mb: 2 }}>
          You can view the holiday list. Changing it needs the “Edit attendance” permission.
        </Alert>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '5fr 7fr' }, gap: 2, alignItems: 'start' }}>
        <Card sx={{ p: 2.5 }}>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', mb: 0.5 }}>
            <EventRepeatOutlinedIcon sx={{ color: 'primary.main' }} />
            <Typography variant="h4">Weekly off</Typography>
          </Stack>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
            The shop’s closed day(s) every week. Staff not marked on these days count as on holiday (paid).
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 0.75 }}>
            {DAYS.map((d) => {
              const on = weeklyOff.includes(d.value);
              return (
                <ButtonBase
                  key={d.value}
                  disabled={!canEdit}
                  onClick={() => toggleDay(d.value)}
                  aria-pressed={on}
                  aria-label={d.label}
                  sx={{
                    flexDirection: 'column',
                    py: 1.25,
                    borderRadius: 2,
                    border: 1,
                    borderColor: on ? 'primary.main' : 'divider',
                    bgcolor: on ? 'primary.main' : 'background.paper',
                    color: on ? 'primary.contrastText' : 'text.primary',
                    fontWeight: 700,
                    transition: 'all 120ms',
                    '&:hover': on ? {} : { borderColor: 'primary.main' },
                  }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 700, color: 'inherit' }}>
                    {d.short}
                  </Typography>
                  <Typography variant="caption" sx={{ color: 'inherit', opacity: 0.8 }}>
                    {on ? 'Off' : 'Open'}
                  </Typography>
                </ButtonBase>
              );
            })}
          </Box>
          <Typography variant="body2" sx={{ mt: 2, fontWeight: 600 }}>
            {weeklyOff.length ? `Closed every ${DAYS.filter((d) => weeklyOff.includes(d.value)).map((d) => d.label).join(' & ')}` : 'Open all 7 days — no weekly off'}
          </Typography>
        </Card>

        <Card sx={{ p: 2.5 }}>
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', mb: 0.5 }}>
            <CelebrationOutlinedIcon sx={{ color: 'primary.main' }} />
            <Typography variant="h4" sx={{ flex: 1 }}>
              Holidays
            </Typography>
            <Stack direction="row" spacing={0.5}>
              {[year - 1, year, year + 1].map((y) => (
                <Chip key={y} label={y} size="small" onClick={() => setYear(y)} color={y === year ? 'primary' : 'default'} variant={y === year ? 'filled' : 'outlined'} />
              ))}
            </Stack>
          </Stack>
          <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
            Festivals and other days the shop is closed. Unmarked staff count as on holiday.
          </Typography>

          {canEdit && (
            <>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 1.5 }}>
                <TextField label="Date" type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} slotProps={{ inputLabel: { shrink: true } }} sx={{ width: { sm: 180 } }} />
                <TextField label="Holiday name" placeholder="e.g. Durga Puja" value={newName} onChange={(e) => setNewName(e.target.value)} sx={{ flex: 1 }} slotProps={{ htmlInput: { maxLength: 60 } }} />
                <Button
                  variant="outlined"
                  color="secondary"
                  startIcon={<AddRoundedIcon />}
                  disabled={!newDate || !newName.trim()}
                  onClick={() => {
                    add({ date: newDate, name: newName.trim() });
                    setYear(Number(newDate.slice(0, 4)));
                    setNewDate('');
                    setNewName('');
                  }}
                >
                  Add
                </Button>
              </Stack>
              {suggestions.length > 0 && (
                <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 0.75, mb: 2, alignItems: 'center' }}>
                  <Typography variant="caption" color="textSecondary">
                    Quick add:
                  </Typography>
                  {suggestions.map((sg) => (
                    <Chip key={sg.date} size="small" icon={<AddRoundedIcon />} label={sg.name} variant="outlined" onClick={() => add(sg)} />
                  ))}
                </Stack>
              )}
            </>
          )}

          <Divider sx={{ mb: 1 }} />
          {byMonth.length === 0 ? (
            <EmptyState title={`No holidays in ${year}`} description={canEdit ? 'Add a date above or use Quick add.' : 'None set for this year.'} />
          ) : (
            byMonth.map(([m, list]) => (
              <Box key={m} sx={{ mb: 1.5 }}>
                <Typography variant="overline" color="textSecondary">
                  {monthName(`${m}-01`)}
                </Typography>
                {list.map((h) => (
                  <Stack key={h.date} direction="row" spacing={1.5} sx={{ alignItems: 'center', py: 0.75, px: 1, borderRadius: 1.5, '&:hover': { bgcolor: 'action.hover' } }}>
                    <Box sx={{ minWidth: 92, px: 1, py: 0.25, borderRadius: 1, bgcolor: 'action.selected', textAlign: 'center' }}>
                      <Typography variant="caption" sx={{ fontWeight: 700 }}>
                        {pretty(h.date)}
                      </Typography>
                    </Box>
                    <Typography variant="body2" sx={{ flex: 1, fontWeight: 500 }}>
                      {h.name}
                    </Typography>
                    {canEdit && (
                      <IconButton size="small" aria-label={`Remove ${h.name}`} onClick={() => setHolidays((list2) => list2.filter((x) => x.date !== h.date))}>
                        <DeleteOutlineRoundedIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Stack>
                ))}
              </Box>
            ))
          )}
        </Card>
      </Box>

      {canEdit && (
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end', mt: 2 }}>
          {dirty && (
            <Button
              onClick={() => {
                setWeeklyOff(data.weeklyOff);
                setHolidays(data.holidays);
              }}
            >
              Discard
            </Button>
          )}
          <Button variant="contained" onClick={onSave} disabled={!dirty || saveState.isLoading}>
            {dirty ? 'Save changes' : 'Saved'}
          </Button>
        </Stack>
      )}
    </>
  );
}
