import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import MoreHorizRoundedIcon from '@mui/icons-material/MoreHorizRounded';
import { AppBar, BottomNavigation, BottomNavigationAction, Box, Drawer, IconButton, Paper, Toolbar, useMediaQuery } from '@mui/material';
import { ORG_ADMIN_ROLE_KEY } from '@jerp/shared';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { matchPath, Outlet, useLocation, useNavigate } from 'react-router';
import { ErrorState, FullScreenLoader } from '../components/StateViews.jsx';
import Wordmark from '../components/Wordmark.jsx';
import { usePermissions, useSession } from '../hooks/usePermission.js';
import { branchSelected } from '../store/authSlice.js';
import BranchSwitcher from './BranchSwitcher.jsx';
import { PROFILE_ITEM, visibleNav } from './navConfig.js';
import Sidebar from './Sidebar.jsx';
import UserMenu from './UserMenu.jsx';
import ForcePasswordChange from '../features/profile/ForcePasswordChange.jsx';
import SubscriptionGate from '../features/billing/SubscriptionGate.jsx';
import RateTicker from '../features/rates/RateTicker.jsx';

const SIDEBAR_WIDTH = 260;
const SIDEBAR_COLLAPSED = 72;
const COLLAPSE_KEY = 'jerp.sidebarCollapsed';

/** Owners and organisation admins run the whole business; everyone else works in their role's panel. */
const panelNameFor = ({ isOwner, roles = [] }) =>
  isOwner || roles.some((r) => r.key === ORG_ADMIN_ROLE_KEY) ? 'Organisation Panel' : `${roles[0]?.name ?? 'Staff'} Panel`;

const readCollapsed = () => {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
};

function MobileBottomNav({ onMore }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const items = [...visibleNav(usePermissions(), { branchLogin: session?.user?.branchLogin }).flatMap((g) => g.items), PROFILE_ITEM].filter((i) => i.mobile).slice(0, 4);
  const current = items.find((i) => matchPath({ path: i.path, end: Boolean(i.end) }, location.pathname))?.path ?? false;

  return (
    <Paper square sx={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: (t) => t.zIndex.appBar, borderTop: 1, borderColor: 'divider', pb: 'env(safe-area-inset-bottom)' }}>
      <BottomNavigation
        showLabels
        value={current}
        onChange={(e, value) => (value === 'more' ? onMore() : navigate(value))}
        sx={{ '& .Mui-selected': { color: 'primary.dark' } }}
      >
        {items.map((i) => (
          <BottomNavigationAction key={i.path} value={i.path} label={i.label} icon={<i.icon />} />
        ))}
        <BottomNavigationAction value="more" label="More" icon={<MoreHorizRoundedIcon />} />
      </BottomNavigation>
    </Paper>
  );
}

export default function AppLayout() {
  const desktop = useMediaQuery((theme) => theme.breakpoints.up('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const dispatch = useDispatch();
  const activeBranchId = useSelector((s) => s.auth.activeBranchId);
  const { data: session, error, isLoading, refetch } = useSession();

  useEffect(() => {
    if (!session) return;
    const ids = session.branches.map((b) => b.id);
    if (!ids.includes(activeBranchId)) {
      dispatch(branchSelected(ids.includes(session.user.defaultBranchId) ? session.user.defaultBranchId : (ids[0] ?? null)));
    }
  }, [session, activeBranchId, dispatch]);

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

  if (isLoading) return <FullScreenLoader />;
  if (error || !session) return <ErrorState error={error} onRetry={refetch} title="Could not load your account" />;

  const width = collapsed ? SIDEBAR_COLLAPSED : SIDEBAR_WIDTH;
  const panelName = panelNameFor(session.user);

  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh', bgcolor: 'background.default' }}>
      {desktop ? (
        <Box component="aside" sx={{ width, flexShrink: 0, transition: 'width 160ms ease' }}>
          <Box sx={{ position: 'fixed', top: 0, bottom: 0, width, transition: 'width 160ms ease', zIndex: (t) => t.zIndex.drawer }}>
            <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapsed} organisationName={session.organisation.name} panelName={panelName} />
          </Box>
        </Box>
      ) : (
        <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)} slotProps={{ paper: { sx: { width: SIDEBAR_WIDTH, border: 0, bgcolor: 'transparent', boxShadow: 'none' } } }}>
          <Sidebar onNavigate={() => setMobileOpen(false)} organisationName={session.organisation.name} panelName={panelName} />
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
            <RateTicker />
            <BranchSwitcher branches={session.branches} />
            <UserMenu user={session.user} />
          </Toolbar>
        </AppBar>

        <Box component="main" sx={{ flex: 1, px: { xs: 2, sm: 3, lg: 4 }, py: { xs: 2.5, md: 4 }, pb: { xs: 12, md: 4 }, maxWidth: 1440, width: '100%', mx: 'auto' }}>
          {session.user.mustChangePassword ? (
            <ForcePasswordChange user={session.user} />
          ) : (
            <SubscriptionGate subscription={session.subscription}>
              <Outlet />
            </SubscriptionGate>
          )}
        </Box>
      </Box>

      {!desktop && <MobileBottomNav onMore={() => setMobileOpen(true)} />}
    </Box>
  );
}
