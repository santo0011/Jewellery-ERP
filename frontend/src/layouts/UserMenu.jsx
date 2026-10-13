import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import { Avatar, Divider, IconButton, ListItemIcon, Menu, MenuItem } from '@mui/material';
import { useColorScheme } from '@mui/material/styles';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { useSignOut } from '../features/auth/useSignOut.js';

const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

export default function UserMenu({ user }) {
  const [anchor, setAnchor] = useState(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const navigate = useNavigate();
  const [signOut, signingOut] = useSignOut();
  const { mode, systemMode, setMode } = useColorScheme();
  const dark = (mode === 'system' ? systemMode : mode) === 'dark';

  const close = () => setAnchor(null);

  return (
    <>
      <IconButton onClick={(e) => setAnchor(e.currentTarget)} aria-label="Account menu" sx={{ p: 0.5 }}>
        <Avatar sx={{ width: 34, height: 34, bgcolor: 'secondary.main', color: 'primary.main', fontSize: '0.8125rem', fontWeight: 600 }}>{initials(user.name)}</Avatar>
      </IconButton>
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
          Profile & security
        </MenuItem>
        <MenuItem
          onClick={() => {
            close();
            setMode(dark ? 'light' : 'dark');
          }}
        >
          <ListItemIcon>{dark ? <LightModeOutlinedIcon fontSize="small" /> : <DarkModeOutlinedIcon fontSize="small" />}</ListItemIcon>
          {dark ? 'Light mode' : 'Dark mode'}
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
          Sign out
        </MenuItem>
      </Menu>
      <ConfirmDialog
        open={confirmSignOut}
        title="Sign out?"
        message="You will be signed out on this device. Any unsaved changes will be lost."
        confirmLabel="Sign out"
        danger
        loading={signingOut}
        onConfirm={signOut}
        onClose={() => setConfirmSignOut(false)}
      />
    </>
  );
}
