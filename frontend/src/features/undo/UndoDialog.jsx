import { Alert, Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { formatDateTime } from '../../utils/format.js';
import { t } from '../../i18n/index.js';

const MIN_REASON = 5;

function Row({ label, children }) {
  return (
    <Stack direction="row" spacing={1.5} sx={{ py: 0.5 }}>
      <Typography variant="body2" color="textSecondary" sx={{ width: 96, flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 500, minWidth: 0, overflowWrap: 'anywhere' }}>
        {children}
      </Typography>
    </Stack>
  );
}

/**
 * Asks before an action is undone (or kept, when it cannot be): what it was, what undoing it will do, and why — a
 * reason is always needed and stays with the action for good, as does who undid it and when.
 *   mode 'undo'    takes the action back
 *   mode 'dismiss' keeps an action that cannot be undone safely, so older actions can be reached
 */
export default function UndoDialog({ open, entry, panel, mode = 'undo', loading = false, onConfirm, onClose }) {
  const [reason, setReason] = useState('');
  const [sure, setSure] = useState(false);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReason('');
    setSure(false);
    setTried(false);
  }, [open]);

  if (!entry) return null;
  const keep = mode === 'dismiss';
  const short = reason.trim().length < MIN_REASON;
  const submit = () => {
    setTried(true);
    if (short || !sure) return;
    onConfirm(reason.trim());
  };

  return (
    <Dialog open={open} onClose={loading ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ fontWeight: 700 }}>{keep ? t('Keep this action?') : entry.mode === 'reversal' ? t('Reverse this action?') : t('Undo this action?')}</DialogTitle>
      <DialogContent>
        <Box sx={{ p: 1.5, mb: 2, borderRadius: 2, border: 1, borderColor: 'divider', bgcolor: 'action.hover' }}>
          <Row label={t('Action')}>{t(entry.title)}</Row>
          {entry.label && <Row label={t('Record')}>{entry.label}</Row>}
          {panel && <Row label={t('Panel')}>{panel}</Row>}
          <Row label={t('Done by')}>{entry.createdBy?.name ?? t('Unknown')}</Row>
          <Row label={t('When')}>{formatDateTime(entry.createdAt)}</Row>
        </Box>

        {keep ? (
          <Alert severity="warning" variant="outlined" sx={{ mb: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
              {t('It cannot be undone safely:')}
            </Typography>
            <Typography variant="body2">{t(entry.blockedBy)}</Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              {t('Keeping it leaves it exactly as it is and moves Undo to the action before it.')}
            </Typography>
          </Alert>
        ) : (
          <Alert severity={entry.mode === 'reversal' ? 'info' : 'warning'} variant="outlined" sx={{ mb: 2 }}>
            <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
              {t('What will happen')}
            </Typography>
            <Typography variant="body2">{t(entry.effect)}</Typography>
            {entry.mode === 'reversal' && (
              <Typography variant="body2" sx={{ mt: 1 }}>
                {t('Nothing is deleted: reversing entries are made, and the original stays on record, marked.')}
              </Typography>
            )}
          </Alert>
        )}

        <TextField
          label={keep ? t('Why keep it?') : t('Why undo it?')}
          placeholder={keep ? t('e.g. The bill is correct') : t('e.g. Entered for the wrong customer')}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          multiline
          minRows={2}
          autoFocus
          required
          error={tried && short}
          helperText={tried && short ? t('Give a reason (at least 5 letters)') : ' '}
          slotProps={{ htmlInput: { maxLength: 300 } }}
        />
        {/* Its own line, so it wraps on narrow screens instead of being cut off as helper text. */}
        <Typography variant="caption" color="textSecondary" sx={{ display: 'block', mt: -1.5, mb: 1.5, px: 1.75 }}>
          {t('Saved with the action for good, with your name and the time.')}
        </Typography>
        <FormControlLabel
          sx={{
            m: 0,
            width: '100%',
            px: 1,
            py: 0.5,
            gap: 0.5,
            alignItems: 'center',
            borderRadius: 2,
            border: 1,
            borderColor: tried && !sure ? 'error.main' : sure ? 'rgba(var(--brand-rgb), 0.5)' : 'divider',
            bgcolor: sure ? 'rgba(var(--brand-rgb), 0.06)' : 'transparent',
            transition: 'background-color 150ms ease, border-color 150ms ease',
          }}
          control={<Checkbox size="small" checked={sure} onChange={(e) => setSure(e.target.checked)} />}
          label={
            <Typography variant="body2" sx={{ fontWeight: 500, lineHeight: 1.4 }} color={tried && !sure ? 'error' : 'textPrimary'}>
              {keep ? t('I understand this action stays as it is.') : t('I understand what this will change.')}
            </Typography>
          }
        />
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button color="secondary" onClick={onClose} disabled={loading}>
          {t('Cancel')}
        </Button>
        <Button variant="contained" color={keep ? 'primary' : 'error'} onClick={submit} loading={loading}>
          {keep ? t('Keep it') : entry.mode === 'reversal' ? t('Reverse') : t('Undo')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
