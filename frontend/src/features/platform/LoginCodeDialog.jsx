import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import MarkEmailReadOutlinedIcon from '@mui/icons-material/MarkEmailReadOutlined';
import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Link, Stack, Typography } from '@mui/material';
import toast from 'react-hot-toast';
import { Link as RouterLink } from 'react-router';
import { t } from '../../i18n/index.js';

/** The code as digit tiles, the way the email shows it. */
function CodeTiles({ code }) {
  return (
    <Stack direction="row" spacing={1} sx={{ justifyContent: 'center', my: 2 }}>
      {code.split('').map((d, i) => (
        <Box key={i} sx={{ width: 44, height: 54, display: 'grid', placeItems: 'center', borderRadius: 2, border: 1, borderColor: 'divider', bgcolor: 'rgba(var(--brand-rgb), 0.08)', fontFamily: 'monospace', fontSize: 26, fontWeight: 700 }}>
          {d}
        </Box>
      ))}
    </Stack>
  );
}

/**
 * After a sign-in code is issued: confirms it was emailed, or — when it could not be (no SMTP, or the server
 * refused) — shows the code once so the Super Admin can pass it on, with a way to fix email.
 */
export default function LoginCodeDialog({ result, title = t('Sign-in code'), onClose }) {
  if (!result) return null;
  const sent = result.status === 'sent';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.otp);
      toast.success(t('Code copied'));
    } catch {
      toast.error(t('Could not copy — select the code instead'));
    }
  };

  return (
    <Dialog open onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
        {sent ? <MarkEmailReadOutlinedIcon color="success" /> : <WarningAmberRoundedIcon color="warning" />}
        {title}
      </DialogTitle>
      <DialogContent>
        {sent ? (
          <Stack spacing={1.5}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <CheckCircleRoundedIcon color="success" fontSize="small" />
              <Typography variant="body2">
                {t('A 6-digit sign-in code was emailed to {{email}}.', { email: <strong>{result.sentTo}</strong> })}
              </Typography>
            </Stack>
            <Typography variant="body2" color="textSecondary">
              {t('They sign in with their email and this code, then choose their own password.')}
            </Typography>
          </Stack>
        ) : (
          <>
            <Alert severity="warning" sx={{ mb: 1 }}>
              {result.status === 'failed' ? (
                <>
                  {t('The email to')} <strong>{result.sentTo}</strong> {t('could not be sent')}{result.error ? `: ${result.error}` : '.'}
                </>
              ) : (
                <>{t('Email is not set up yet, so the code was not sent.')}</>
              )}{' '}
              <Link component={RouterLink} to="/admin/settings/email" onClick={onClose}>
                {t('Email settings')}
              </Link>
            </Alert>
            <Typography variant="body2" color="textSecondary">
              {t('Share this code with the organisation yourself. It is their password for {{email}}, and it is shown only now.', { email: <strong>{result.sentTo}</strong> })}
            </Typography>
            <CodeTiles code={result.otp} />
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {!sent && (
          <Button startIcon={<ContentCopyRoundedIcon />} onClick={copy}>
            {t('Copy code')}
          </Button>
        )}
        <Button variant="contained" onClick={onClose}>
          {t('Done')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
