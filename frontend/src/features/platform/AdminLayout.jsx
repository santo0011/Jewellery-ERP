import AlternateEmailOutlinedIcon from '@mui/icons-material/AlternateEmailOutlined';
import AnalyticsOutlinedIcon from '@mui/icons-material/AnalyticsOutlined';
import CorporateFareOutlinedIcon from '@mui/icons-material/CorporateFareOutlined';
import CurrencyRupeeOutlinedIcon from '@mui/icons-material/CurrencyRupeeOutlined';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import QueryStatsOutlinedIcon from '@mui/icons-material/QueryStatsOutlined';
import SpaceDashboardOutlinedIcon from '@mui/icons-material/SpaceDashboardOutlined';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import ManageAccountsOutlinedIcon from '@mui/icons-material/ManageAccountsOutlined';
import { AppBar, Avatar, Box, ButtonBase, Drawer, IconButton, ListItemIcon, Menu, MenuItem, Toolbar, Typography, useMediaQuery, useScrollTrigger } from '@mui/material';
import { useEffect, useState } from 'react';
import { useDispatch } from 'react-redux';
import { Outlet, useNavigate } from 'react-router';
import ConfirmDialog from '../../components/ConfirmDialog.jsx';
import { applyDefaultBrand, applyRememberedBrand } from '../../theme/brandMemory.js';
import Sidebar from '../../layouts/Sidebar.jsx';
import { usePlatformLogoutMutation, usePlatformMeQuery } from './platformApi.js';
import { platformSessionEnded } from './platformSlice.js';

const SIDEBAR_WIDTH = 260;
const SIDEBAR_COLLAPSED = 72;
const COLLAPSE_KEY = 'jerp.adminSidebarCollapsed';

const NAV = [
  { label: 'Dashboard', pinned: true, items: [{ label: 'Dashboard', path: '/admin', icon: SpaceDashboardOutlinedIcon, end: true }] },
  { label: 'Platform', icon: HubOutlinedIcon, items: [{ label: 'Organisations', path: '/admin/organisations', icon: CorporateFareOutlinedIcon }] },
  {
    label: 'Billing',
    icon: CurrencyRupeeOutlinedIcon,
    items: [
      { label: 'Plans', path: '/admin/plans', icon: WorkspacePremiumOutlinedIcon },
      { label: 'Payments', path: '/admin/payments', icon: PaymentsOutlinedIcon },
    ],
  },
  { label: 'Reports', icon: AnalyticsOutlinedIcon, items: [{ label: 'Reports', path: '/admin/reports', icon: QueryStatsOutlinedIcon }] },
  { label: 'Settings', items: [{ label: 'Email (SMTP)', path: '/admin/settings/email', icon: AlternateEmailOutlinedIcon }] },
];

const initialsOf = (name = '') =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('') || 'SA';

/** The account button: avatar in a gold ring (with name and role on large screens); the menu holds Sign out. */
function AdminAccountMenu({ me, onSignOut }) {
  const navigate = useNavigate();
  const [anchor, setAnchor] = useState(null);
  const name = me?.name ?? 'Super Admin';
  return (
    <>
      <ButtonBase
        onClick={(e) => setAnchor(e.currentTarget)}
        aria-label="Account menu"
        sx={{ flexShrink: 0, gap: 1, p: { xs: 0.25, lg: 0.5 }, pr: { lg: 1 }, borderRadius: 999, border: { lg: 1 }, borderColor: { lg: 'divider' }, bgcolor: { lg: 'background.paper' }, transition: 'border-color 160ms ease', '&:hover': { borderColor: 'rgba(var(--brand-rgb), 0.5)' } }}
      >
        <Box sx={{ p: '2px', borderRadius: '50%', background: 'linear-gradient(135deg, var(--brand-light), var(--brand) 55%, var(--brand-deep))' }}>
          <Avatar sx={{ width: 34, height: 34, bgcolor: 'secondary.main', color: 'primary.main', fontSize: '0.8125rem', fontWeight: 700, border: '2px solid', borderColor: 'background.paper' }}>{initialsOf(name)}</Avatar>
        </Box>
        <Box sx={{ display: { xs: 'none', lg: 'block' }, textAlign: 'left', maxWidth: 170 }}>
          <Typography noWrap sx={{ fontSize: '0.8125rem', fontWeight: 700, lineHeight: 1.25 }}>
            {name}
          </Typography>
          <Typography noWrap sx={{ fontSize: '0.6875rem', color: 'text.secondary', lineHeight: 1.3 }}>
            Super Admin
          </Typography>
        </Box>
        <ExpandMoreRoundedIcon sx={{ display: { xs: 'none', lg: 'block' }, fontSize: 18, color: 'text.secondary' }} />
      </ButtonBase>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }} slotProps={{ paper: { sx: { mt: 1, minWidth: 200, borderRadius: 2.5 } } }}>
        <MenuItem
          onClick={() => {
            setAnchor(null);
            navigate('/admin/profile');
          }}
          sx={{ py: 1.25 }}
        >
          <ListItemIcon>
            <ManageAccountsOutlinedIcon fontSize="small" />
          </ListItemIcon>
          My profile
        </MenuItem>
        <MenuItem
          onClick={() => {
            setAnchor(null);
            onSignOut();
          }}
          sx={{ color: 'error.main', py: 1.25 }}
        >
          <ListItemIcon sx={{ color: 'inherit' }}>
            <LogoutRoundedIcon fontSize="small" />
          </ListItemIcon>
          Sign out
        </MenuItem>
      </Menu>
    </>
  );
}

const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
};

export default function AdminLayout() {
  const desktop = useMediaQuery((theme) => theme.breakpoints.up('md'));
  // The Super Admin panel keeps the default colours and icon (not the last organisation's).
  useEffect(() => {
    applyDefaultBrand();
    return () => applyRememberedBrand();
  }, []);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const dispatch = useDispatch();
  const { data: me } = usePlatformMeQuery();
  const [logout, { isLoading: signingOut }] = usePlatformLogoutMutation();
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  // Once the page scrolls, the top bar lifts off it with a soft shadow.
  const scrolled = useScrollTrigger({ disableHysteresis: true, threshold: 4 });

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
            <Sidebar groups={NAV} searchable collapsed={collapsed} onToggleCollapse={toggleCollapsed} organisationName={me?.name ?? 'Super Admin'} caption="Super Admin" panelName="Super Admin Panel" />
          </Box>
        </Box>
      ) : (
        <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)} slotProps={{ paper: { sx: { width: SIDEBAR_WIDTH, border: 0, bgcolor: 'transparent', boxShadow: 'none' } } }}>
          <Sidebar groups={NAV} searchable onNavigate={() => setMobileOpen(false)} onClose={() => setMobileOpen(false)} organisationName={me?.name ?? 'Super Admin'} caption="Super Admin" panelName="Super Admin Panel" />
        </Drawer>
      )}

      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <AppBar
          position="sticky"
          color="inherit"
          elevation={0}
          sx={{
            pt: 'env(safe-area-inset-top)',
            // Frosted glass, a gold hairline underneath, and a soft shadow once the page scrolls.
            bgcolor: 'rgba(255, 253, 248, 0.82)',
            backdropFilter: 'saturate(180%) blur(16px)',
            WebkitBackdropFilter: 'saturate(180%) blur(16px)',
            boxShadow: scrolled ? '0 8px 24px -14px rgba(23, 23, 23, 0.35)' : 'none',
            transition: 'box-shadow 200ms ease',
            '&::after': { content: '""', position: 'absolute', left: 0, right: 0, bottom: 0, height: '1px', background: 'linear-gradient(90deg, rgba(var(--brand-rgb), 0) 0%, rgba(var(--brand-rgb), 0.45) 30%, rgba(var(--brand-rgb), 0.45) 70%, rgba(var(--brand-rgb), 0) 100%)' },
            '.dark &': { bgcolor: 'rgba(28, 27, 24, 0.82)' },
          }}
        >
          <Toolbar sx={{ gap: { xs: 1, sm: 1.5 }, minHeight: { xs: 60, md: 72 }, px: { xs: 1.25, sm: 2, md: 3 } }}>
            {!desktop && (
              <IconButton onClick={() => setMobileOpen(true)} aria-label="Open navigation" sx={{ ml: -0.25, width: 40, height: 40, borderRadius: 2.5, border: 1, borderColor: 'divider', bgcolor: 'background.paper' }}>
                <MenuRoundedIcon sx={{ fontSize: 21 }} />
              </IconButton>
            )}
            <Box sx={{ flex: 1, minWidth: 0 }} />
            <AdminAccountMenu me={me} onSignOut={() => setConfirmSignOut(true)} />
            <ConfirmDialog
              open={confirmSignOut}
              title="Sign out?"
              message="You will be signed out of the Super Admin panel on this device."
              confirmLabel="Sign out"
              danger
              loading={signingOut}
              onConfirm={signOut}
              onClose={() => setConfirmSignOut(false)}
            />
          </Toolbar>
        </AppBar>

        <Box component="main" sx={{ flex: 1, px: { xs: 2, sm: 3, lg: 4 }, py: { xs: 2.5, md: 4 }, maxWidth: 1440, width: '100%', mx: 'auto' }}>
          <Outlet />
        </Box>
      </Box>
    </Box>
  );
}
