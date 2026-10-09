import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { Box, ButtonBase, Collapse, Typography } from '@mui/material';
import { useEffect, useState } from 'react';

/**
 * Optional fields kept out of the way: closed by default so forms show only what is needed every day.
 * Opens on its own when `defaultOpen` (e.g. editing a record that has these filled) or `forceOpen` (a hidden field has an error).
 */
export default function MoreDetails({ title = 'More details', hint, defaultOpen = false, forceOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}>
      <ButtonBase onClick={() => setOpen((o) => !o)} aria-expanded={open} sx={{ width: '100%', justifyContent: 'space-between', px: 2, py: 1.5, borderRadius: 2, textAlign: 'left' }}>
        <Box>
          <Typography variant="subtitle2">{title}</Typography>
          {hint && (
            <Typography variant="caption" color="textSecondary">
              {hint}
            </Typography>
          )}
        </Box>
        <ExpandMoreRoundedIcon sx={{ color: 'text.secondary', transition: 'transform 160ms', transform: open ? 'rotate(180deg)' : 'none' }} />
      </ButtonBase>
      <Collapse in={open} unmountOnExit={false}>
        <Box sx={{ px: 2, pb: 2, pt: 0.5 }}>{children}</Box>
      </Collapse>
    </Box>
  );
}
