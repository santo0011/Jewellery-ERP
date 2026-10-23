import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import TranslateRoundedIcon from '@mui/icons-material/TranslateRounded';
import { ButtonBase, ListItemIcon, ListItemText, Menu, MenuItem, Typography } from '@mui/material';
import { useState } from 'react';
import { changeLanguage, getLanguage, LANGUAGES, t } from '../i18n/index.js';

/**
 * Pick the app's language: English, বাংলা or हिन्दी. The choice is kept on this device and, when signed in, on the
 * account (`onSave` saves it there), then the page reloads in it.
 * `compact` shows only the icon (phones).
 */
export default function LanguageSwitcher({ onSave, compact = false, sx }) {
  const [anchor, setAnchor] = useState(null);
  const [switching, setSwitching] = useState(false);
  const current = LANGUAGES.find((l) => l.code === getLanguage()) ?? LANGUAGES[0];

  const pick = async (code) => {
    setAnchor(null);
    if (code === current.code) return;
    setSwitching(true);
    await changeLanguage(code, onSave);
  };

  return (
    <>
      <ButtonBase
        onClick={(e) => setAnchor(e.currentTarget)}
        disabled={switching}
        aria-label={t('Language')}
        aria-haspopup="menu"
        title={t('Language')}
        sx={{
          flexShrink: 0,
          height: 40,
          minWidth: 40,
          px: compact ? 0 : 1.25,
          gap: 0.75,
          borderRadius: 2.5,
          border: 1,
          borderColor: 'divider',
          bgcolor: 'background.paper',
          color: 'text.secondary',
          transition: 'border-color 160ms ease, color 160ms ease',
          '&:hover': { borderColor: 'rgba(var(--brand-rgb), 0.5)', color: 'text.primary' },
          ...sx,
        }}
      >
        <TranslateRoundedIcon sx={{ fontSize: 19 }} />
        {!compact && (
          <Typography component="span" sx={{ fontSize: '0.8125rem', fontWeight: 600, lineHeight: 1, color: 'text.primary' }}>
            {current.short}
          </Typography>
        )}
      </ButtonBase>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { mt: 1, minWidth: 180, borderRadius: 2.5 } } }}
      >
        {LANGUAGES.map((l) => {
          const selected = l.code === current.code;
          return (
            <MenuItem key={l.code} selected={selected} onClick={() => pick(l.code)} lang={l.code} sx={{ py: 1.1 }}>
              <ListItemText primary={l.name} slotProps={{ primary: { sx: { fontWeight: selected ? 700 : 500 } } }} />
              <ListItemIcon sx={{ minWidth: 0, ml: 2, color: 'primary.main', visibility: selected ? 'visible' : 'hidden' }}>
                <CheckRoundedIcon fontSize="small" />
              </ListItemIcon>
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}
