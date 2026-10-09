import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import { Alert, Box, Button, Card, Chip, Skeleton, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { tokens } from '../theme/tokens.js';
import { getErrorMessage } from '../utils/errors.js';
import { formatDate, formatDateTime } from '../utils/format.js';

const FIRST = 6;

/** Who made a change: the platform's Super Admin (gold) or someone inside the organisation (blue). */
const WHO = {
  admin: { label: 'Super Admin', Icon: AdminPanelSettingsOutlinedIcon, dot: tokens.sidebar.goldGradient, ink: '#171717', chipBg: 'rgba(201, 162, 39, 0.14)', chipInk: '#7A5E0F' },
  user: { label: 'Organisation', Icon: PersonOutlineRoundedIcon, dot: 'linear-gradient(135deg, #7FA8C9, #2F5D7C)', ink: '#fff', chipBg: 'rgba(47, 93, 124, 0.12)', chipInk: '#2F5D7C' },
};

function ChangeRow({ c }) {
  // Secrets (password) and files (logo) have no values to show, only that they changed.
  const valueless = c.from == null && c.to == null;
  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '140px 1fr' }, columnGap: 1.5, rowGap: 0.25, py: 0.75, '&:not(:last-of-type)': { borderBottom: 1, borderColor: 'divider' } }}>
      <Typography variant="caption" color="textSecondary" sx={{ fontWeight: 600, pt: 0.25 }}>
        {c.label}
      </Typography>
      {valueless ? (
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {c.field === 'password' ? 'Reset' : 'Changed'}
        </Typography>
      ) : (
        <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.25, minWidth: 0 }}>
          {c.from != null && (
            <>
              <Typography variant="body2" sx={{ color: 'text.secondary', textDecoration: 'line-through', textDecorationColor: 'rgba(155, 44, 44, 0.5)', wordBreak: 'break-word' }}>
                {c.from}
              </Typography>
              <ArrowForwardRoundedIcon sx={{ fontSize: 15, color: 'text.disabled' }} />
            </>
          )}
          <Typography variant="body2" sx={{ fontWeight: 700, wordBreak: 'break-word' }}>
            {c.to ?? 'Removed'}
          </Typography>
        </Stack>
      )}
    </Box>
  );
}

function Entry({ e, last }) {
  const who = WHO[e.by.kind] ?? WHO.user;
  return (
    <Box sx={{ display: 'flex', gap: 1.75 }}>
      {/* the timeline: an icon per entry joined by a line */}
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <Box sx={{ width: 34, height: 34, borderRadius: '50%', display: 'grid', placeItems: 'center', background: who.dot, color: who.ink, boxShadow: '0 0 0 4px var(--mui-palette-background-paper, #fff)' }}>
          <who.Icon sx={{ fontSize: 18 }} />
        </Box>
        {!last && <Box sx={{ flex: 1, width: 2, my: 0.5, borderRadius: 1, bgcolor: 'divider' }} />}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0, pb: last ? 0 : 2.5 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5, minHeight: 34 }}>
          <Typography sx={{ fontWeight: 700, fontSize: '0.9375rem' }}>{e.title}</Typography>
          <Chip size="small" label={who.label} sx={{ height: 20, fontSize: '0.6875rem', fontWeight: 700, bgcolor: who.chipBg, color: who.chipInk }} />
          <Typography variant="caption" color="textSecondary" sx={{ ml: { sm: 'auto !important' } }}>
            {formatDateTime(e.at)}
          </Typography>
        </Stack>
        <Typography variant="caption" color="textSecondary">
          by <b>{e.by.name}</b>
        </Typography>
        {e.note && (
          <Typography variant="body2" sx={{ mt: 0.75 }}>
            {e.note}
          </Typography>
        )}
        {e.changes.length > 0 && (
          <Box sx={{ mt: 1, px: 1.5, py: 0.25, borderRadius: 2, bgcolor: 'soft.main', border: 1, borderColor: 'divider' }}>
            {e.changes.map((c) => (
              <ChangeRow key={c.field} c={c} />
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
}

/** Timeline of every change to the organisation, who made it and old → new. Shared by the Super Admin and Organisation panels. */
export default function EditHistory({ entries, isLoading, error, title = 'Edit history' }) {
  const [all, setAll] = useState(false);
  const shown = all ? entries : entries?.slice(0, FIRST);
  return (
    <Card sx={{ overflow: 'hidden' }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', px: { xs: 2, sm: 2.5 }, py: 2, borderBottom: 1, borderColor: 'divider' }}>
        <Box sx={{ width: 36, height: 36, borderRadius: 2, display: 'grid', placeItems: 'center', background: tokens.sidebar.goldGradient, color: '#171717' }}>
          <HistoryRoundedIcon sx={{ fontSize: 20 }} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="h4">{title}</Typography>
          <Typography variant="caption" color="textSecondary">
            {entries?.length ? `${entries.length} change${entries.length === 1 ? '' : 's'} · last on ${formatDate(entries[0].at)}` : 'Every change, who made it and when'}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5} sx={{ display: { xs: 'none', sm: 'flex' } }}>
          {Object.values(WHO).map((w) => (
            <Stack key={w.label} direction="row" spacing={0.5} sx={{ alignItems: 'center' }}>
              <Box sx={{ width: 10, height: 10, borderRadius: '50%', background: w.dot }} />
              <Typography variant="caption" color="textSecondary">
                {w.label}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Stack>
      <Box sx={{ px: { xs: 2, sm: 2.5 }, py: 2.5 }}>
        {isLoading ? (
          <Stack spacing={2}>
            {[0, 1, 2].map((i) => (
              <Stack key={i} direction="row" spacing={1.75}>
                <Skeleton variant="circular" width={34} height={34} />
                <Box sx={{ flex: 1 }}>
                  <Skeleton width="40%" />
                  <Skeleton width="70%" />
                </Box>
              </Stack>
            ))}
          </Stack>
        ) : error ? (
          <Alert severity="error">{getErrorMessage(error)}</Alert>
        ) : !entries.length ? (
          <Typography color="textSecondary" sx={{ textAlign: 'center', py: 2 }}>
            No changes yet.
          </Typography>
        ) : (
          <>
            {shown.map((e, i) => (
              <Entry key={e.id} e={e} last={i === shown.length - 1} />
            ))}
            {entries.length > FIRST && (
              <Box sx={{ textAlign: 'center', mt: 2 }}>
                <Button size="small" color="secondary" variant="outlined" onClick={() => setAll((x) => !x)}>
                  {all ? 'Show fewer' : `Show all ${entries.length} changes`}
                </Button>
              </Box>
            )}
          </>
        )}
      </Box>
    </Card>
  );
}
