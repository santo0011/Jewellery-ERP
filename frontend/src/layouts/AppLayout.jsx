import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import MoreHorizRoundedIcon from '@mui/icons-material/MoreHorizRounded';
import { AppBar, Box, ButtonBase, Drawer, IconButton, Toolbar, Typography, useMediaQuery, useScrollTrigger } from '@mui/material';
import { ORG_ADMIN_ROLE_KEY } from '@jerp/shared';
import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { matchPath, Outlet, useLocation, useNavigate } from 'react-router';
import { ErrorState, FullScreenLoader } from '../components/StateViews.jsx';
import { useBrandTheme } from '../hooks/useBrandTheme.js';
import { useOrganisationLogo } from '../hooks/useOrganisationLogo.js';
import { usePermissions, useSession } from '../hooks/usePermission.js';
import { branchSelected } from '../store/authSlice.js';
import { tokens } from '../theme/tokens.js';
import BranchSwitcher from './BranchSwitcher.jsx';
import { branchControlFor, PROFILE_ITEM, visibleNav } from './navConfig.js';
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

/** One tab of the phone's bottom bar: icon in a soft pill (filled when it is the current page) over a short label. */
function NavTab({ icon: Icon, label, active, onClick }) {
  return (
    <ButtonBase
      onClick={onClick}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      sx={{ flex: 1, minWidth: 0, height: 58, flexDirection: 'column', gap: 0.25, borderRadius: 3, color: active ? 'var(--brand-strong)' : 'text.secondary', transition: 'color 160ms ease' }}
    >
      <Box sx={{ width: 44, height: 28, borderRadius: 999, display: 'grid', placeItems: 'center', bgcolor: active ? 'rgba(var(--brand-rgb), 0.16)' : 'transparent', transition: 'background-color 200ms ease' }}>
        <Icon sx={{ fontSize: 22 }} />
      </Box>
      <Typography noWrap sx={{ fontSize: '0.6875rem', fontWeight: active ? 700 : 500, maxWidth: '100%', px: 0.5, color: 'inherit' }}>
        {label}
      </Typography>
    </ButtonBase>
  );
}

/**
 * Phone navigation, app style: a floating bar at the bottom with the main pages and "More" (the full menu).
 * "New bill" — the counter's main job — sits in the middle as a raised gold button.
 */
function MobileBottomNav({ onMore }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: session } = useSession();
  const items = [...visibleNav(usePermissions(), { branchLogin: session?.user?.branchLogin }).flatMap((g) => g.items), PROFILE_ITEM].filter((i) => i.mobile).slice(0, 4);
  const centre = items.find((i) => i.path === '/billing');
  const side = items.filter((i) => i !== centre);
  const half = Math.ceil(side.length / 2);
  const isActive = (i) => Boolean(matchPath({ path: i.path, end: Boolean(i.end) }, location.pathname));
  const tab = (i) => <NavTab key={i.path} icon={i.icon} label={i.mobileLabel ?? i.label} active={isActive(i)} onClick={() => navigate(i.path)} />;

  return (
    <Box component="nav" aria-label="Main" sx={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: (t) => t.zIndex.appBar, px: 1.25, pb: 'calc(8px + env(safe-area-inset-bottom))', pointerEvents: 'none' }}>
      <Box
        sx={{
          pointerEvents: 'auto',
          maxWidth: 520,
          mx: 'auto',
          display: 'flex',
          alignItems: 'center',
          px: 0.5,
          borderRadius: 4,
          border: 1,
          borderColor: 'divider',
          bgcolor: 'rgba(255, 255, 255, 0.88)',
          backdropFilter: 'saturate(180%) blur(16px)',
          WebkitBackdropFilter: 'saturate(180%) blur(16px)',
          boxShadow: '0 10px 30px -8px rgba(23, 23, 23, 0.25)',
          '.dark &': { bgcolor: 'rgba(28, 27, 24, 0.88)' },
        }}
      >
        {side.slice(0, half).map(tab)}
        {centre && (
          <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <ButtonBase
              onClick={() => navigate(centre.path)}
              aria-label={centre.label}
              aria-current={isActive(centre) ? 'page' : undefined}
              sx={{ mt: -3.5, width: 58, height: 58, borderRadius: '50%', flexDirection: 'column', background: tokens.sidebar.goldGradient, color: 'var(--brand-contrast)', boxShadow: '0 10px 22px -6px rgba(var(--brand-rgb), 0.7), 0 0 0 5px var(--mui-palette-background-default)' }}
            >
              <centre.icon sx={{ fontSize: 24 }} />
              <Typography sx={{ fontSize: '0.5625rem', fontWeight: 800, letterSpacing: '0.04em', color: 'inherit' }}>BILL</Typography>
            </ButtonBase>
          </Box>
        )}
        {side.slice(half).map(tab)}
        <NavTab icon={MoreHorizRoundedIcon} label="More" active={false} onClick={onMore} />
      </Box>
    </Box>
  );
}

export default function AppLayout() {
  const desktop = useMediaQuery((theme) => theme.breakpoints.up('md'));
  const phone = useMediaQuery((theme) => theme.breakpoints.down('sm'));
  // Once the page scrolls, the top bar lifts off it with a soft shadow.
  const scrolled = useScrollTrigger({ disableHysteresis: true, threshold: 4 });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const dispatch = useDispatch();
  const activeBranchId = useSelector((s) => s.auth.activeBranchId);
  const { pathname } = useLocation();
  const { data: session, error, isLoading, refetch } = useSession();
  const logoUrl = useOrganisationLogo(); // shown at the top of the sidebar
  // The panel's colours follow the logo's main colour (gold when there is no logo or it has no clear colour).
  useBrandTheme(logoUrl, session?.organisation?.logoVersion);

  useEffect(() => {
    if (!session) return;
    const ids = session.branches.map((b) => b.id);
    if (!ids.includes(activeBranchId)) {
      // Head Office is the default (the user's own default branch if they cannot open the head office).
      const headOffice = session.branches.find((b) => b.isHeadOffice)?.id;
      dispatch(branchSelected(headOffice ?? (ids.includes(session.user.defaultBranchId) ? session.user.defaultBranchId : (ids[0] ?? null))));
    }
  }, [session, activeBranchId, dispatch]);

  // A new page starts at the top (phones keep the old scroll position otherwise).
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

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
  // The branch picker shows only when there is more than one branch to choose from.
  const branchControl = session.branches.length > 1 ? branchControlFor(pathname, session.branchModules) : null;
  const panelName = panelNameFor(session.user);

  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh', bgcolor: 'background.default' }}>
      {desktop ? (
        <Box component="aside" sx={{ width, flexShrink: 0, transition: 'width 160ms ease' }}>
          <Box sx={{ position: 'fixed', top: 0, bottom: 0, width, transition: 'width 160ms ease', zIndex: (t) => t.zIndex.drawer }}>
            <Sidebar collapsed={collapsed} onToggleCollapse={toggleCollapsed} organisationName={session.organisation.name} panelName={panelName} logoUrl={logoUrl} />
          </Box>
        </Box>
      ) : (
        <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)} slotProps={{ paper: { sx: { width: 'min(300px, 86vw)', border: 0, bgcolor: 'transparent', boxShadow: 'none', pt: 'env(safe-area-inset-top)', pb: 'env(safe-area-inset-bottom)' } } }}>
          <Sidebar onNavigate={() => setMobileOpen(false)} onClose={() => setMobileOpen(false)} organisationName={session.organisation.name} panelName={panelName} logoUrl={logoUrl} />
        </Drawer>
      )}

      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <AppBar
          position="sticky"
          color="inherit"
          elevation={0}
          sx={{
            pt: 'env(safe-area-inset-top)',
            // Frosted glass everywhere, a gold hairline underneath, and a soft shadow once the page scrolls.
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
            {!(phone && branchControl) && <RateTicker />}
            {/* Branch filter on list pages of modules shared with a branch; one-branch picker on dashboard and billing. */}
            {branchControl && <BranchSwitcher branches={session.branches} allowAll={branchControl === 'filter'} />}
            <UserMenu user={session.user} caption={panelName} />
          </Toolbar>
        </AppBar>

        <Box
          component="main"
          sx={{
            flex: 1,
            px: { xs: 1.5, sm: 3, lg: 4 },
            py: { xs: 2, md: 4 },
            // Room for the floating bottom bar (and the phone's home indicator) on phones and tablets.
            pb: { xs: 'calc(104px + env(safe-area-inset-bottom))', md: 4 },
            maxWidth: 1440,
            width: '100%',
            mx: 'auto',
          }}
        >
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
