import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import { Box, Button, Stack, Typography } from '@mui/material';
import { readBrand } from '../theme/brandMemory.js';
import PulseLoader from './PulseLoader.jsx';
import { getErrorMessage } from '../utils/errors.js';
import { DiamondMark } from './Wordmark.jsx';
import { t } from '../i18n/index.js';

export function EmptyState({ title = t('Nothing here yet'), description, action, icon: Icon = InboxOutlinedIcon }) {
  return (
    // Phones: the title says it; the longer description is left out.
    <Stack spacing={1} sx={{ py: { xs: 3.5, sm: 6 }, px: 2, alignItems: 'center', textAlign: 'center' }}>
      <Icon sx={{ fontSize: { xs: 32, sm: 40 }, color: 'primary.main', opacity: 0.8 }} />
      <Typography variant="h5">{title}</Typography>
      {description && (
        <Typography variant="body2" color="textSecondary" sx={{ maxWidth: 380, display: { xs: 'none', sm: 'block' } }}>
          {description}
        </Typography>
      )}
      {action && <Box sx={{ pt: 1 }}>{action}</Box>}
    </Stack>
  );
}

export function ErrorState({ error, onRetry, title = t('Could not load data') }) {
  return (
    <Stack spacing={1} sx={{ py: 6, px: 2, alignItems: 'center', textAlign: 'center' }}>
      <ErrorOutlineRoundedIcon sx={{ fontSize: 40, color: 'error.main' }} />
      <Typography variant="h5">{title}</Typography>
      <Typography variant="body2" color="textSecondary" sx={{ maxWidth: 420 }}>
        {getErrorMessage(error)}
      </Typography>
      {onRetry && (
        <Button variant="outlined" color="secondary" onClick={onRetry} sx={{ mt: 1 }}>
          {t('Try again')}
        </Button>
      )}
    </Stack>
  );
}

export function LoadingState({ label }) {
  return (
    <Stack spacing={1.5} sx={{ py: 8, alignItems: 'center' }}>
      <PulseLoader size={18} label={label ?? t('Loading')} />
      {label && (
        <Typography variant="body2" color="textSecondary">
          {label}
        </Typography>
      )}
    </Stack>
  );
}

/** While the app starts: the logo of the organisation last signed in here (else the diamond), and the breathing dot. */
export function FullScreenLoader() {
  const logo = readBrand()?.icon;
  return (
    <Stack spacing={2.5} sx={{ minHeight: '100dvh', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default' }}>
      {logo ? <Box component="img" src={logo} alt="" sx={{ width: 56, height: 56, objectFit: 'contain', borderRadius: 2 }} /> : <DiamondMark size={44} />}
      <PulseLoader size={16} />
    </Stack>
  );
}
