import ErrorOutlineRoundedIcon from '@mui/icons-material/ErrorOutlineRounded';
import InboxOutlinedIcon from '@mui/icons-material/InboxOutlined';
import { Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { getErrorMessage } from '../utils/errors.js';
import { DiamondMark } from './Wordmark.jsx';

export function EmptyState({ title = 'Nothing here yet', description, action, icon: Icon = InboxOutlinedIcon }) {
  return (
    <Stack spacing={1} sx={{ py: 6, px: 2, alignItems: 'center', textAlign: 'center' }}>
      <Icon sx={{ fontSize: 40, color: 'primary.main', opacity: 0.8 }} />
      <Typography variant="h5">{title}</Typography>
      {description && (
        <Typography variant="body2" color="textSecondary" sx={{ maxWidth: 380 }}>
          {description}
        </Typography>
      )}
      {action && <Box sx={{ pt: 1 }}>{action}</Box>}
    </Stack>
  );
}

export function ErrorState({ error, onRetry, title = 'Could not load data' }) {
  return (
    <Stack spacing={1} sx={{ py: 6, px: 2, alignItems: 'center', textAlign: 'center' }}>
      <ErrorOutlineRoundedIcon sx={{ fontSize: 40, color: 'error.main' }} />
      <Typography variant="h5">{title}</Typography>
      <Typography variant="body2" color="textSecondary" sx={{ maxWidth: 420 }}>
        {getErrorMessage(error)}
      </Typography>
      {onRetry && (
        <Button variant="outlined" color="secondary" onClick={onRetry} sx={{ mt: 1 }}>
          Try again
        </Button>
      )}
    </Stack>
  );
}

export function LoadingState({ label }) {
  return (
    <Stack spacing={1.5} sx={{ py: 8, alignItems: 'center' }}>
      <CircularProgress size={28} />
      {label && (
        <Typography variant="body2" color="textSecondary">
          {label}
        </Typography>
      )}
    </Stack>
  );
}

export function FullScreenLoader() {
  return (
    <Stack spacing={2} sx={{ minHeight: '100dvh', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default' }}>
      <DiamondMark size={44} />
      <CircularProgress size={22} />
    </Stack>
  );
}
