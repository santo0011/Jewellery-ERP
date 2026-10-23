import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { Avatar, Box, ButtonBase, Divider, ListItemIcon, Menu, MenuItem, Typography } from '@mui/material';
import { useColorScheme } from '@mui/material/styles';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { useSignOut } from '../features/auth/useSignOut.js';
import { t } from '../i18n/index.js';

const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

/** The account button: avatar in a gold ring; on large screens also the name and the panel (role) beside it. */
export default function UserMenu({ user, caption }) {
  const [anchor, setAnchor] = useState(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const navigate = useNavigate();
  const [signOut, signingOut] = useSignOut();
  const { mode, systemMode, setMode } = useColorScheme();
  const dark = (mode === 'system' ? systemMode : mode) === 'dark';

  const close = () => setAnchor(null);

  return (
    <>
      <ButtonBase
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-label={t('Account menu')}
        sx={{ flexShrink: 0, gap: 1, p: { xs: 0.25, lg: 0.5 }, pr: { lg: 1 }, borderRadius: 999, border: { lg: 1 }, borderColor: { lg: 'divider' }, bgcolor: { lg: 'background.paper' }, transition: 'border-color 160ms ease', '&:hover': { borderColor: 'rgba(var(--brand-rgb), 0.5)' } }}
      >
        <Box sx={{ p: '2px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--brand-light), var(--brand) 55%, var(--brand-deep))' }}>
          <Avatar sx={{ width: 34, height: 34, bgcolor: 'secondary.main', color: 'primary.main', fontSize: '0.8125rem', fontWeight: 700, border: '2px solid', borderColor: 'background.paper' }}>{initials(user.name)}</Avatar>
        </Box>
        <Box sx={{ display: { xs: 'none', lg: 'block' }, textAlign: 'left', maxWidth: 160 }}>
          <Typography noWrap sx={{ fontSize: '0.8125rem', fontWeight: 700, lineHeight: 1.25 }}>
            {user.name}
          </Typography>
          {caption && (
            <Typography noWrap sx={{ fontSize: '0.6875rem', color: 'text.secondary', lineHeight: 1.3 }}>
              {caption}
            </Typography>
          )}
        </Box>
        <ExpandMoreRoundedIcon sx={{ display: { xs: 'none', lg: 'block' }, fontSize: 18, color: 'text.secondary' }} />
      </ButtonBase>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close} slotProps={{ paper: { sx: { minWidth: 240, mt: 1 } } }} transformOrigin={{ horizontal: 'right', vertical: 'top' }} anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}>
        <MenuItem
          onClick={() => {
            close();
            navigate('/profile');
          }}
        >
          <ListItemIcon>
            <PersonOutlineRoundedIcon fontSize="small" />
          </ListItemIcon>
          {t('Profile & security')}
        </MenuItem>
        <MenuItem
          onClick={() => {
            close();
            setMode(dark ? 'light' : 'dark');
          }}
        >
          <ListItemIcon>{dark ? <LightModeOutlinedIcon fontSize="small" /> : <DarkModeOutlinedIcon fontSize="small" />}</ListItemIcon>
          {dark ? t('Light mode') : t('Dark mode')}
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            close();
            setConfirmSignOut(true);
          }}
        >
          <ListItemIcon>
            <LogoutRoundedIcon fontSize="small" />
          </ListItemIcon>
          {t('Sign out')}
        </MenuItem>
      </Menu>
      <ConfirmDialog
        open={confirmSignOut}
        title={t('Sign out?')}
        message={t('You will be signed out on this device. Any unsaved changes will be lost.')}
        confirmLabel={t('Sign out')}
        danger
        loading={signingOut}
        onConfirm={signOut}
        onClose={() => setConfirmSignOut(false)}
      />
    </>
  );
}
