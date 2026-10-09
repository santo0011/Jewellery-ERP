import ApartmentOutlinedIcon from '@mui/icons-material/ApartmentOutlined';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import SellOutlinedIcon from '@mui/icons-material/SellOutlined';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import { AppBar, Box, Button, Chip, Drawer, IconButton, Toolbar, Typography, useMediaQuery } from '@mui/material';
import { useState } from 'react';
import { useDispatch } from 'react-redux';
import { Outlet } from 'react-router';
import Wordmark from '../../components/Wordmark.jsx';
import Sidebar from '../../layouts/Sidebar.jsx';
import { tokens } from '../../theme/tokens.js';
import { usePlatformLogoutMutation, usePlatformMeQuery } from './platformApi.js';
import { platformSessionEnded } from './platformSlice.js';

const SIDEBAR_WIDTH = 260;
const SIDEBAR_COLLAPSED = 72;
const COLLAPSE_KEY = 'jerp.adminSidebarCollapsed';

const NAV = [
  { label: 'Dashboard', pinned: true, items: [{ label: 'Dashboard', path: '/admin', icon: DashboardOutlinedIcon, end: true }] },
  { label: 'Platform', items: [{ label: 'Organisations', path: '/admin/organisations', icon: ApartmentOutlinedIcon }] },
  {
    label: 'Billing',
    items: [
      { label: 'Plans', path: '/admin/plans', icon: SellOutlinedIcon },
      { label: 'Payments', path: '/admin/payments', icon: ReceiptLongOutlinedIcon },
    ],
  },
];

const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
};

export default function AdminLayout() {
  const desktop = useMediaQuery((theme) => theme.breakpoints.up('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const dispatch = useDispatch();
  const { data: me } = usePlatformMeQuery();
  const [logout] = usePlatformLogoutMutation();

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        /* storage unavailable */
      }
      return !c;
    });
  };

  const signOut = async () => {
    await logout();
    dispatch(platformSessionEnded());
  };

  const width = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_WIDTH;

  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh', bgcolor: 'background.default' }}>
      {desktop ? (
        <Box component="aside" sx={{ width, flexShrink: 0, transition: 'width 160ms ease' }}>
          <Box sx={{ position: 'fixed', top: 0, bottom: 0, width, transition: 'width 160ms ease', zIndex: (t) => t.zIndex.drawer }}>
            <Sidebar groups={NAV} fixedGroups collapsed={collapsed} onToggleCollapse={toggleCollapsed} organisationName={me?.name ?? 'Super Admin'} caption="Super Admin" panelName="Super Admin Panel" />
          </Box>
        </Box>
      ) : (
        <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)} slotProps={{ paper: { sx: { width: SIDEBAR_WIDTH, border: 0, bgcolor: 'transparent', boxShadow: 'none' } } }}>
          <Sidebar groups={NAV} fixedGroups onNavigate={() => setMobileOpen(false)} organisationName={me?.name ?? 'Super Admin'} caption="Super Admin" panelName="Super Admin Panel" />
        </Drawer>
      )}

      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <AppBar position="sticky" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
          <Toolbar sx={{ gap: 1.5, minHeight: { xs: 56, md: 64 } }}>
            {!desktop && (
              <>
                <IconButton edge="start" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
                  <MenuRoundedIcon />
                </IconButton>
                <Wordmark compact size={22} />
              </>
            )}
            <Box sx={{ flex: 1 }} />
            <Chip label="Super Admin" size="small" sx={{ bgcolor: tokens.light.gold, color: '#171717', fontWeight: 700, height: 22 }} />
            <Typography variant="body2" sx={{ display: { xs: 'none', sm: 'block' }, fontWeight: 500 }}>
              {me?.name}
            </Typography>
            <Button onClick={signOut} startIcon={<LogoutRoundedIcon />} color="inherit">
              Sign out
            </Button>
          </Toolbar>
        </AppBar>

        <Box component="main" sx={{ flex: 1, px: { xs: 2, sm: 3, lg: 4 }, py: { xs: 2.5, md: 4 }, maxWidth: 1440, width: '100%', mx: 'auto' }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
