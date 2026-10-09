import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import { Box, Button, Divider, Drawer, IconButton, Stack, Typography, useMediaQuery } from '@mui/material';

export default function FormDrawer({ open, title, subtitle, onClose, onSubmit, submitLabel = 'Save', submitting = false, children, width = 520 }) {
  const fullScreen = useMediaQuery((theme) => theme.breakpoints.down('sm'));

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={submitting ? undefined : onClose}
      slotProps={{ paper: { sx: { width: fullScreen ? '100%' : width, maxWidth: '100%' } } }}
    >
      <Box component="form" noValidate onSubmit={onSubmit} sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Stack direction="row" sx={{ px: 3, py: 2, alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Box>
            <Typography variant="h3">{title}</Typography>
            {subtitle && (
              <Typography variant="body2" color="textSecondary">
                {subtitle}
              </Typography>
            )}
          </Box>
          <IconButton onClick={onClose} disabled={submitting} aria-label="Close" edge="end">
            <CloseRoundedIcon />
          </IconButton>
        </Stack>
        <Divider />
        <Box sx={{ flex: 1, overflowY: 'auto', px: 3, py: 3 }}>{children}</Box>
        <Divider />
        <Stack direction="row" spacing={1} sx={{ px: 3, py: 2, justifyContent: 'flex-end', pb: 'max(16px, env(safe-area-inset-bottom))' }}>
          <Button color="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" loading={submitting}>
            {submitLabel}
          </Button>
        </Stack>
      </Box>
    </Drawer>
  );
}
