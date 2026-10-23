import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { Box, Button, Divider, Drawer, IconButton, Stack, Typography, useMediaQuery } from '@mui/material';
import { t } from '../i18n/index.js';

/**
 * A form that slides in from the right on tablets and desktops. On a phone it fills the screen like an app page:
 * a compact header, the form scrolling in between, and full-width Cancel / Save buttons always within thumb reach.
 */
export default function FormDrawer({ open, title, subtitle, onClose, onSubmit, submitLabel = t('Save'), submitting = false, children, width = 520 }) {
  const fullScreen = useMediaQuery((theme) => theme.breakpoints.down('sm'));

  return (
    <Drawer
      anchor={fullScreen ? 'bottom' : 'right'}
      open={open}
      onClose={submitting ? undefined : onClose}
      slotProps={{
        paper: {
          sx: fullScreen
            ? { width: '100%', height: '100dvh', maxHeight: '100dvh', pt: 'env(safe-area-inset-top)' }
            : { width, maxWidth: '100%' },
        },
      }}
    >
      <Box component="form" noValidate onSubmit={onSubmit} sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Stack direction="row" spacing={1} sx={{ px: { xs: 2, sm: 3 }, py: { xs: 1.5, sm: 2 }, alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="h3" noWrap={fullScreen}>
              {title}
            </Typography>
            {subtitle && (
              <Typography variant="body2" color="textSecondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
                {subtitle}
              </Typography>
            )}
          </Box>
          <IconButton onClick={onClose} disabled={submitting} aria-label={t('Close')} edge="end" sx={{ flexShrink: 0, bgcolor: fullScreen ? 'action.hover' : 'transparent' }}>
            <CloseRoundedIcon />
          </IconButton>
        </Stack>
        <Divider />
        <Box sx={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', px: { xs: 2, sm: 3 }, py: { xs: 2.5, sm: 3 } }}>{children}</Box>
        <Divider />
        <Stack direction="row" spacing={1} sx={{ px: { xs: 2, sm: 3 }, py: { xs: 1.5, sm: 2 }, justifyContent: 'flex-end', pb: 'max(16px, env(safe-area-inset-bottom))', bgcolor: 'background.paper' }}>
          <Button color="secondary" onClick={onClose} disabled={submitting} sx={{ flex: { xs: 1, sm: 'none' } }} variant={fullScreen ? 'outlined' : 'text'}>
            {t('Cancel')}
          </Button>
          <Button type="submit" variant="contained" loading={submitting} sx={{ flex: { xs: 2, sm: 'none' } }}>
            {submitLabel}
          </Button>
        </Stack>
      </Box>
    </Drawer>
  );
}
