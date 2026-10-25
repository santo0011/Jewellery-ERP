import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import ZoomInRoundedIcon from '@mui/icons-material/ZoomInRounded';
import ZoomOutRoundedIcon from '@mui/icons-material/ZoomOutRounded';
import { Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Link, Stack, Typography, useMediaQuery } from '@mui/material';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router';
import { usePermission } from '../../hooks/usePermission.js';
import { PaperPreview } from './PrintSheet.jsx';
import { layoutLabel } from './printLayouts.js';
import { t } from '../../i18n/index.js';

/**
 * The invoice exactly as it will print, in this branch's saved paper size and design, before the print dialog
 * opens. The size and design are changed only in Business settings → Print.
 */
export default function PrintPreviewDialog({ open, onClose, sale, layout, logo }) {
  const phone = useMediaQuery((theme) => theme.breakpoints.down('sm'));
  const canSeeSettings = usePermission('settings.view');
  const copies = layout.copies ?? 1;
  // On a phone the whole A4 page is small: zoom to full size and scroll to read it.
  const [fit, setFit] = useState(true);
  const canZoom = phone && layout.size === 'a4';

  const print = () => {
    // Let the dialog's close finish first, so the print preview of the browser does not open over it.
    onClose();
    setTimeout(() => window.print(), 150);
  };

  return (
    <Dialog open={open} onClose={onClose} fullScreen={phone} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pr: 1.5 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h4" component="span" sx={{ display: 'block' }}>
            {t('Print preview')}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ mt: 0.75, alignItems: 'center', flexWrap: 'wrap', rowGap: 0.75 }}>
            <Chip size="small" icon={<PrintOutlinedIcon />} label={layoutLabel(layout)} sx={{ fontWeight: 600 }} />
            {copies > 1 && <Chip size="small" variant="outlined" label={t('{{copies}} copies', { copies })} />}
            {canSeeSettings && (
              <Link component={RouterLink} to="/settings/business?tab=print" variant="body2" underline="hover" onClick={onClose}>
                {t('Change design')}
              </Link>
            )}
          </Stack>
        </Box>
        {canZoom && (
          <IconButton onClick={() => setFit((f) => !f)} aria-label={fit ? t('Zoom in') : t('Fit to screen')}>
            {fit ? <ZoomInRoundedIcon /> : <ZoomOutRoundedIcon />}
          </IconButton>
        )}
        <IconButton onClick={onClose} aria-label={t('Close preview')}>
          <CloseRoundedIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ bgcolor: '#E9E6DF', p: { xs: 1.5, sm: 3 } }}>
        <PaperPreview sale={sale} layout={layout} logo={logo} fit={!canZoom || fit} />
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button color="secondary" onClick={onClose}>
          {t('Close')}
        </Button>
        <Button variant="contained" startIcon={<PrintOutlinedIcon />} onClick={print}>
          {t('Print')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
