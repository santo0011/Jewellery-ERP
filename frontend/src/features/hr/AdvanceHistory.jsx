import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { Badge, Box, Dialog, DialogContent, DialogTitle, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { formatINR } from '@jerp/shared';
import { useState } from 'react';
import { formatDate, formatDateTime } from '../../utils/format.js';
import { monthLabel, payModeLabel } from './hrUi.jsx';
import { t } from '../../i18n/index.js';

/** Shows a changed value the way people read it: rupees, dates, months, payment modes. */
function show(field, v) {
  if (v === null || v === undefined || v === '') return '—';
  if (field === 'Amount' || field === 'Cut each month') return formatINR(v, { decimals: 0 });
  if (field === 'Given on') return formatDate(v);
  if (field === 'Cut from salary of') return monthLabel(v);
  if (field === 'Paid by') return payModeLabel(v);
  return String(v);
}

function HistoryDialog({ advance, onClose }) {
  const edits = [...(advance.edits ?? [])].reverse();
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 600, pr: 6 }}>
        {t('Edit history · {{advanceNo}}', { advanceNo: advance.advanceNo })}
        <IconButton onClick={onClose} aria-label={t('Close')} sx={{ position: 'absolute', right: 12, top: 12 }}>
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="textSecondary" sx={{ mb: 2 }}>
          {(advance.edits?.length === 1 ? t('Entered on {{recordedOn}} · {{value}} change', { recordedOn: formatDate(advance.recordedOn), value: advance.edits?.length ?? 0 }) : t('Entered on {{recordedOn}} · {{value}} changes', { recordedOn: formatDate(advance.recordedOn), value: advance.edits?.length ?? 0 }))}
        </Typography>
        <Stack spacing={1.5}>
          {edits.map((e, i) => (
            <Box key={`${e.at}-${i}`} sx={{ p: 1.75, borderRadius: 2, border: 1, borderColor: 'divider' }}>
              <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'baseline', gap: 1, mb: 0.75, flexWrap: 'wrap' }}>
                <Typography variant="subtitle2">“{e.reason}”</Typography>
                <Typography variant="caption" color="textSecondary">
                  {e.by ?? t('Someone')} · {formatDateTime(e.at)}
                </Typography>
              </Stack>
              <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem', '& td': { py: 0.5, borderTop: '1px dashed', borderColor: 'divider' } }}>
                <tbody>
                  {e.changes.map((c) => (
                    <tr key={c.field}>
                      <Box component="td" sx={{ color: 'text.secondary', width: '36%' }}>
                        {t(c.field)}
                      </Box>
                      <Box component="td" sx={{ color: 'error.main', textDecoration: 'line-through' }}>
                        {show(c.field, c.from)}
                      </Box>
                      <Box component="td" sx={{ color: 'success.main', fontWeight: 600 }}>
                        → {show(c.field, c.to)}
                      </Box>
                    </tr>
                  ))}
                </tbody>
              </Box>
            </Box>
          ))}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}

/** Row actions for an advance: edit (same day only) and its edit history. */
export function AdvanceActions({ advance, canEdit, onEdit }) {
  const [open, setOpen] = useState(false);
  const count = advance.edits?.length ?? 0;
  return (
    <Stack direction="row" spacing={0.25} sx={{ justifyContent: 'flex-end' }}>
      {canEdit &&
        (advance.editable ? (
          <Tooltip title={t('Edit — allowed today only')}>
            <IconButton size="small" onClick={() => onEdit(advance)} aria-label={t('Edit {{advanceNo}}', { advanceNo: advance.advanceNo })}>
              <EditOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        ) : (
          <Tooltip title={advance.lockedReason ?? t('Locked')}>
            <Box component="span" sx={{ display: 'inline-flex', p: 0.625, color: 'text.disabled' }} aria-label={t('Locked')}>
              <LockOutlinedIcon fontSize="small" />
            </Box>
          </Tooltip>
        ))}
      <Tooltip title={count ? t('Edit history ({{count}})', { count }) : t('Never edited')}>
        <span>
          <IconButton size="small" onClick={() => setOpen(true)} disabled={!count} aria-label={t('Edit history of {{advanceNo}}', { advanceNo: advance.advanceNo })}>
            <Badge badgeContent={count} color="warning" invisible={!count}>
              <HistoryRoundedIcon fontSize="small" />
            </Badge>
          </IconButton>
        </span>
      </Tooltip>
      {open && <HistoryDialog advance={advance} onClose={() => setOpen(false)} />}
    </Stack>
  );
}
