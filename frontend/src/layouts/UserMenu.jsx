import DarkModeOutlinedIcon from '@mui/icons-material/DarkModeOutlined';
import LightModeOutlinedIcon from '@mui/icons-material/LightModeOutlined';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import { Avatar, Box, Divider, IconButton, ListItemIcon, Menu, MenuItem, Typography } from '@mui/material';
import { useColorScheme } from '@mui/material/styles';
import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useNavigate } from 'react-router';
import { useLogoutMutation } from '../features/auth/authApi.js';
import { sessionEnded } from '../store/authSlice.js';

const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

export default function UserMenu({ user }) {
  const [anchor, setAnchor] = useState(null);
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const [logout] = useLogoutMutation();
  const { mode, systemMode, setMode } = useColorScheme();
  const dark = (mode === 'system' ? systemMode : mode) === 'dark';

  const close = () => setAnchor(null);

  const signOut = async () => {
    close();
    await logout();
    dispatch(sessionEnded());
    navigate('/login', { replace: true });
  };

  return (
    <>
      <IconButton onClick={(e) => setAnchor(e.currentTarget)} aria-label="Account menu" sx={{ p: 0.5 }}>
        <Avatar sx={{ width: 34, height: 34, bgcolor: 'secondary.main', color: 'primary.main', fontSize: '0.8125rem', fontWeight: 600 }}>{initials(user.name)}</Avatar>
      </IconButton>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={close} slotProps={{ paper: { sx: { minWidth: 240, mt: 1 } } }} transformOrigin={{ horizontal: 'right', vertical: 'top' }} anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}>
        <Box sx={{ px: 2, py: 1.5 }}>
          <Typography variant="subtitle2">{user.name}</Typography>
          <Typography variant="body2" color="textSecondary" noWrap>
            {user.email}
          </Typography>
          <Typography variant="body2" color="accent" sx={{ mt: 0.5 }}>
            {user.roles.map((r) => r.name).join(', ')}
          </Typography>
        </Box>
        <Divider />
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
        <MenuItem onClick={signOut}>
          <ListItemIcon>
            <LogoutRoundedIcon fontSize="small" />
          </ListItemIcon>
          Sign out
        </MenuItem>
      </Menu>
    </>
  );
}
