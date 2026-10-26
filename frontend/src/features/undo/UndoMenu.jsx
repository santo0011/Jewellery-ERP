import UndoRoundedIcon from '@mui/icons-material/UndoRounded';
import { Alert, Box, Button, CircularProgress, Divider, IconButton, Link, Popover, Stack, Tooltip, Typography } from '@mui/material';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Link as RouterLink } from 'react-router';
import { getErrorMessage } from '../../utils/errors.js';
import { formatDateTime } from '../../utils/format.js';
import UndoDialog from './UndoDialog.jsx';
import { t } from '../../i18n/index.js';

/** One panel's latest action: what it was, and Undo — or why it cannot be, with Keep to move on to the one before. */
function LatestCard({ stack, showName, onAct }) {
  const e = stack.latest;
  return (
    <Box sx={{ px: 2, py: 1.5 }}>
      {showName && <Typography sx={{ fontSize: '0.6875rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary', mb: 0.75 }}>{stack.name}</Typography>}
      {e && (
        // What it was, by whom and when, and Undo. What undoing does is shown in the dialog that follows.
        <Stack direction="row" spacing={1.5} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body2" noWrap sx={{ fontWeight: 700 }} title={e.label ?? undefined}>
              {t(e.title)}
              {e.label && (
                <Box component="span" sx={{ fontWeight: 400, color: 'text.secondary' }}>
                  {' · '}
                  {e.label}
                </Box>
              )}
            </Typography>
            <Typography variant="caption" color="textSecondary" noWrap sx={{ display: 'block' }}>
              {[e.createdBy?.name, formatDateTime(e.createdAt)].filter(Boolean).join(' · ')}
            </Typography>
            {!e.canUndo && (
              <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'warning.main' }}>
                {t(e.blockedBy)}
              </Typography>
            )}
          </Box>
          {e.canUndo ? (
            <Button size="small" variant="contained" color="error" startIcon={<UndoRoundedIcon />} onClick={() => onAct(stack, 'undo')} sx={{ flexShrink: 0 }}>
              {t('Undo')}
            </Button>
          ) : (
            // Kept only when it truly cannot be undone (not merely for lack of permission).
            !/permission/i.test(e.blockedBy ?? '') && (
              <Button size="small" variant="outlined" onClick={() => onAct(stack, 'dismiss')} sx={{ flexShrink: 0 }}>
                {t('Keep')}
              </Button>
            )
          )}
        </Stack>
      )}
    </Box>
  );
}

/**
 * The navbar's Undo: the latest action of each panel this person works in (organisation, branches — or the
 * platform's, in the Super Admin panel). Data and actions come from the panel (props), so both panels share it.
 *   stacks     [{ key, name, latest }]
 *   onUndo / onDismiss (entry, reason) => Promise
 */
export default function UndoMenu({ stacks, loading, error, onOpen, onUndo, onDismiss, historyPath }) {
  const [anchor, setAnchor] = useState(null);
  const [acting, setActing] = useState(null); // { stack, mode }
  const [busy, setBusy] = useState(false);
  // Only panels that have something to undo are listed.
  const withActions = (stacks ?? []).filter((s) => s.latest);

  const open = (e) => {
    setAnchor(e.currentTarget);
    onOpen?.();
  };
  const confirm = async (reason) => {
    setBusy(true);
    try {
      const done = acting.mode === 'undo' ? await onUndo(acting.stack.latest, reason) : await onDismiss(acting.stack.latest, reason);
      toast.success(acting.mode === 'undo' ? t('{{title}} undone', { title: t(done?.title ?? acting.stack.latest.title) }) : t('Kept. Undo moved to the action before it.'));
      setActing(null);
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Tooltip title={t('Undo')}>
        <IconButton onClick={open} aria-label={t('Undo')} sx={{ width: 34, height: 34, borderRadius: 2, border: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
          <UndoRoundedIcon sx={{ fontSize: 19 }} />
        </IconButton>
      </Tooltip>
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { mt: 0.75, width: 'min(380px, calc(100vw - 24px))', maxHeight: '75vh', borderRadius: 2.5, border: 1, borderColor: 'divider', boxShadow: '0 12px 32px rgba(23, 23, 23, 0.14)' } } }}
      >
        <Stack direction="row" sx={{ px: 2, py: 1.25, alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography sx={{ fontWeight: 700 }}>{t('Undo')}</Typography>
          {historyPath && (
            <Link component={RouterLink} to={historyPath} onClick={() => setAnchor(null)} variant="body2" sx={{ fontWeight: 600, flexShrink: 0 }}>
              {t('History')}
            </Link>
          )}
        </Stack>
        <Divider />
        {loading ? (
          <Box sx={{ p: 3, display: 'grid', placeItems: 'center' }}>
            <CircularProgress size={24} />
          </Box>
        ) : error ? (
          <Alert severity="error" sx={{ m: 2 }}>
            {getErrorMessage(error)}
          </Alert>
        ) : withActions.length ? (
          withActions.map((s, i) => (
            <Box key={s.key}>
              {i > 0 && <Divider />}
              <LatestCard stack={s} showName={withActions.length > 1 || (stacks?.length ?? 0) > 1} onAct={(stack, mode) => setActing({ stack, mode })} />
            </Box>
          ))
        ) : (
          <Typography variant="body2" color="textSecondary" sx={{ px: 2, py: 2.5, textAlign: 'center' }}>
            {t('Nothing to undo.')}
          </Typography>
        )}
      </Popover>
      <UndoDialog open={Boolean(acting)} entry={acting?.stack.latest} panel={acting?.stack.name} mode={acting?.mode} loading={busy} onConfirm={confirm} onClose={() => setActing(null)} />
    </>
  );
}
