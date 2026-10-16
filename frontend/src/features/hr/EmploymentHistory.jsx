import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import PersonAddAlt1OutlinedIcon from '@mui/icons-material/PersonAddAlt1Outlined';
import ReplayRoundedIcon from '@mui/icons-material/ReplayRounded';
import { Box, Card, CardContent, Chip, Stack, Typography } from '@mui/material';
import { formatINR } from '@jerp/shared';
import DataTable from '../../components/DataTable.jsx';
import { formatDate, formatDateTime } from '../../utils/format.js';

const EVENT = {
  joined: { label: 'Joined', icon: PersonAddAlt1OutlinedIcon, color: 'success.main', soft: 'rgba(46, 125, 50, 0.12)' },
  left: { label: 'Left', icon: LogoutRoundedIcon, color: 'error.main', soft: 'rgba(198, 40, 40, 0.12)' },
  rejoined: { label: 'Rejoined', icon: ReplayRoundedIcon, color: 'info.main', soft: 'rgba(2, 136, 209, 0.12)' },
};

const dayNumber = (iso) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86400000);
const todayIso = () => new Date().toISOString().slice(0, 10);

/** "1 year 3 months", "4 months", "12 days" */
function span(days) {
  if (days < 31) return `${days} day${days === 1 ? '' : 's'}`;
  const months = Math.floor(days / 30.44);
  const y = Math.floor(months / 12);
  const m = months % 12;
  return [y && `${y} year${y > 1 ? 's' : ''}`, m && `${m} month${m > 1 ? 's' : ''}`].filter(Boolean).join(' ');
}

/** Joined / left / rejoined as a timeline, with the time away between leaving and coming back. */
export default function EmploymentHistory({ employee }) {
  const events = employee.history ?? [];

  // Days on the rolls: each stint from join/rejoin to the next exit (or today).
  let served = 0;
  let since = null;
  for (const h of events) {
    if (h.event === 'joined' || h.event === 'rejoined') since = h.date;
    else if (h.event === 'left' && since) {
      served += dayNumber(h.date) - dayNumber(since) + 1;
      since = null;
    }
  }
  if (since) served += Math.max(0, dayNumber(todayIso()) - dayNumber(since) + 1);
  const exits = events.filter((h) => h.event === 'left').length;

  return (
    <Card>
      <CardContent>
        <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', mb: 2.5 }}>
          <Chip label={`With you ${span(served)}`} sx={{ fontWeight: 600 }} />
          <Chip label={exits ? `Left ${exits} time${exits > 1 ? 's' : ''}` : 'Never left'} variant="outlined" />
          <Chip label={employee.status === 'left' ? 'Currently not working' : 'Currently working'} color={employee.status === 'left' ? 'default' : 'success'} variant="outlined" />
        </Stack>

        <Box component="ol" sx={{ listStyle: 'none', m: 0, p: 0 }}>
          {events.map((h, i) => {
            const ev = EVENT[h.event] ?? EVENT.joined;
            const Icon = ev.icon;
            const next = events[i + 1];
            const away = h.event === 'left' && next?.event === 'rejoined' ? dayNumber(next.date) - dayNumber(h.date) - 1 : null;
            const last = i === events.length - 1;
            return (
              <Box component="li" key={`${h.event}-${h.date}-${i}`} sx={{ display: 'flex', gap: 2 }}>
                {/* Dot and connecting line */}
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                  <Box sx={{ width: 36, height: 36, borderRadius: '50%', display: 'grid', placeItems: 'center', bgcolor: ev.soft, color: ev.color }}>
                    <Icon sx={{ fontSize: 18 }} />
                  </Box>
                  {!last && <Box sx={{ width: 2, flex: 1, minHeight: 24, bgcolor: 'divider', my: 0.5 }} />}
                </Box>
                <Box sx={{ pb: last ? 0 : 2.5, pt: 0.5, minWidth: 0, flex: 1 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <Typography sx={{ fontWeight: 700, color: ev.color }}>{ev.label}</Typography>
                    <Typography sx={{ fontWeight: 600 }}>{formatDate(h.date)}</Typography>
                  </Stack>
                  {h.note && (
                    <Typography variant="body2" sx={{ mt: 0.25 }}>
                      “{h.note}”
                    </Typography>
                  )}
                  {(h.by || h.at) && (
                    <Typography variant="caption" color="textSecondary">
                      Recorded{h.by ? ` by ${h.by.name}` : ''}
                      {h.at ? ` · ${formatDateTime(h.at)}` : ''}
                    </Typography>
                  )}
                  {away !== null && (
                    <Box sx={{ mt: 1 }}>
                      <Chip size="small" label={`Away ${span(Math.max(0, away))} · not paid`} sx={{ height: 22, bgcolor: 'action.hover' }} />
                    </Box>
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
      </CardContent>
    </Card>
  );
}

const money = (paise) => formatINR(paise, { decimals: 0 });

/** Starting salary and each increment / cut after it, newest first. */
export function SalaryHistory({ rows }) {
  const increments = rows.filter((r) => r.event === 'increment' && r.changePaise > 0).length;
  const first = rows[0];
  const current = rows.at(-1);
  const growth = first && first.grossPaise > 0 ? Math.round(((current.grossPaise - first.grossPaise) / first.grossPaise) * 100) : null;
  return (
    <Card>
      <CardContent>
        <Stack direction="row" sx={{ gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mr: 1 }}>
            Salary history
          </Typography>
          <Chip size="small" label={increments ? `${increments} increment${increments > 1 ? 's' : ''}` : 'No increments yet'} />
          {first && <Chip size="small" variant="outlined" label={`Started at ${money(first.grossPaise)}`} />}
          {growth !== null && current !== first && <Chip size="small" variant="outlined" color={growth >= 0 ? 'success' : 'error'} label={`${growth >= 0 ? '+' : ''}${growth}% since joining`} />}
        </Stack>
        <DataTable
          columns={[
            {
              key: 'when',
              label: 'Date',
              render: (r) => (
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {r.date ? formatDate(r.date) : formatDateTime(r.at)}
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    {r.event === 'joined' ? 'Starting salary' : r.by ? `by ${r.by.name}` : 'Salary changed'}
                  </Typography>
                </Box>
              ),
            },
            { key: 'basic', label: 'Basic', align: 'right', render: (r) => money(r.basicPaise) },
            { key: 'allowance', label: 'Allowance', align: 'right', render: (r) => money(r.allowancePaise) },
            { key: 'gross', label: 'Salary / month', align: 'right', render: (r) => <Typography variant="body2" sx={{ fontWeight: 700 }}>{money(r.grossPaise)}</Typography> },
            {
              key: 'change',
              label: 'Change',
              align: 'right',
              render: (r) =>
                r.changePaise === null ? (
                  '—'
                ) : (
                  <Typography variant="body2" sx={{ fontWeight: 600, color: r.changePaise > 0 ? 'success.main' : r.changePaise < 0 ? 'error.main' : 'text.secondary' }}>
                    {r.changePaise > 0 ? '+' : r.changePaise < 0 ? '−' : ''}
                    {money(Math.abs(r.changePaise))}
                  </Typography>
                ),
            },
          ]}
          rows={[...rows].reverse()}
          getRowId={(r) => `${r.event}-${r.at ?? r.date}`}
          empty={{ title: 'No salary record', description: 'Salary changes appear here when the employee is edited.' }}
        />
      </CardContent>
    </Card>
  );
}
