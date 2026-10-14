import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import FolderOutlinedIcon from '@mui/icons-material/FolderOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import PointOfSaleOutlinedIcon from '@mui/icons-material/PointOfSaleOutlined';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import ShoppingBagOutlinedIcon from '@mui/icons-material/ShoppingBagOutlined';
import { Box, ButtonBase, Collapse, IconButton, InputBase, List, ListItemButton, Tooltip, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { matchPath, NavLink, useLocation } from 'react-router';
import { DiamondMark } from '../components/Wordmark.jsx';
import { APP_NAME } from '../config.js';
import { usePendingApprovalsQuery } from '../features/approvals/approvalApi.js';
import { usePermissions, useSession } from '../hooks/usePermission.js';
import { fonts, tokens } from '../theme/tokens.js';
import { visibleNav } from './navConfig.js';

const s = tokens.sidebar;
const INK = '#F7F3E8';

/** An icon for each menu group's header (any other group falls back to a folder). */
const GROUP_ICON = {
  Overview: InsightsOutlinedIcon,
  Sales: PointOfSaleOutlinedIcon,
  Stock: Inventory2OutlinedIcon,
  Purchase: ShoppingBagOutlinedIcon,
  'HR & Payroll': BadgeOutlinedIcon,
  Settings: SettingsOutlinedIcon,
  'Users & access': AdminPanelSettingsOutlinedIcon,
};

function NavBadge({ collapsed }) {
  const { data: count = 0 } = usePendingApprovalsQuery(undefined, { pollingInterval: 60000 });
  if (!count) return null;
  return (
    <Box
      component="span"
      sx={{
        ml: collapsed ? 0 : 'auto',
        position: collapsed ? 'absolute' : 'static',
        top: 2,
        right: 6,
        minWidth: 18,
        height: 18,
        px: 0.6,
        borderRadius: 9,
        background: s.goldGradient,
        color: 'var(--brand-contrast)',
        fontSize: '0.625rem',
        fontWeight: 800,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 0 0 2px #141412',
      }}
    >
      {count > 99 ? '99+' : count}
    </Box>
  );
}

/**
 * One page link. `nested` items sit on the group's tree line (small dot instead of an icon tile when the sidebar
 * is open); the active page is a soft gold pill with a glowing icon.
 */
function NavItem({ item, collapsed, nested = false, onNavigate }) {
  const Icon = item.icon;
  const button = (
    <ListItemButton
      component={NavLink}
      to={item.path}
      end={item.end}
      onClick={onNavigate}
      sx={{
        position: 'relative',
        mx: collapsed ? 1.25 : 1.5,
        ml: !collapsed && nested ? '46px' : undefined,
        mb: 0.25,
        px: collapsed ? 0 : 1,
        minHeight: collapsed ? 44 : nested ? 36 : 42,
        gap: 1.25,
        borderRadius: 2,
        color: s.text,
        justifyContent: collapsed ? 'center' : 'flex-start',
        transition: 'background-color 160ms ease, color 160ms ease',
        '& .nav-icon': { transition: 'color 160ms ease, background 160ms ease, box-shadow 160ms ease' },
        '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.045)', color: '#fff' },
        '&:hover .nav-icon': { color: s.active },
        '&.active': { background: s.activeFill, color: INK, boxShadow: 'inset 0 0 0 1px rgba(var(--brand-rgb), 0.22)' },
        '&.active .nav-icon': { color: 'var(--brand-light)' },
        '&.active .nav-label': { fontWeight: 600 },
        // On the tree line, the active page's dot lights up.
        ...(nested &&
          !collapsed && {
            '&::before': { content: '""', position: 'absolute', left: -13, top: '50%', width: 7, height: 7, mt: '-3.5px', borderRadius: '50%', bgcolor: '#2A2925', border: '1px solid rgba(var(--brand-rgb), 0.35)', transition: 'all 160ms ease' },
            '&.active::before': { background: s.goldGradient, borderColor: 'transparent', boxShadow: '0 0 10px rgba(var(--brand-rgb), 0.75)' },
          }),
        ...((!nested || collapsed) && {
          '&.active .nav-icon': { background: s.goldGradient, color: 'var(--brand-contrast)', boxShadow: '0 4px 14px rgba(var(--brand-rgb), 0.35)' },
        }),
      }}
    >
      <Box
        className="nav-icon"
        sx={{
          width: nested && !collapsed ? 22 : 32,
          height: nested && !collapsed ? 22 : 32,
          borderRadius: 1.75,
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
          bgcolor: nested && !collapsed ? 'transparent' : s.tile,
          color: s.muted,
        }}
      >
        <Icon sx={{ fontSize: nested && !collapsed ? 17 : 18 }} />
      </Box>
      {!collapsed && (
        <Typography className="nav-label" noWrap sx={{ flex: 1, minWidth: 0, fontSize: nested ? '0.8375rem' : '0.875rem', fontWeight: 500, letterSpacing: '0.005em', color: 'inherit' }}>
          {item.label}
        </Typography>
      )}
      {item.badge === 'approvals' && <NavBadge collapsed={collapsed} />}
    </ListItemButton>
  );
  return collapsed ? (
    <Tooltip title={item.label} placement="right">
      {button}
    </Tooltip>
  ) : (
    button
  );
}

/** Items of a group hanging from a thin vertical line, like a tree. */
function TreeList({ items, onNavigate, id }) {
  return (
    <Box sx={{ position: 'relative', pt: 0.25, pb: 0.5, '&::before': { content: '""', position: 'absolute', left: 36, top: 0, bottom: 18, width: '1px', background: 'linear-gradient(180deg, rgba(var(--brand-rgb), 0.35), rgba(255, 255, 255, 0.06))' } }}>
      <List disablePadding id={id}>
        {items.map((item) => (
          <NavItem key={item.path} item={item} nested collapsed={false} onNavigate={onNavigate} />
        ))}
      </List>
    </Box>
  );
}

/** A group header: icon tile, name, and (when closed) how many pages it holds, or a gold dot when you are inside it. */
function GroupHeader({ group, open, active, onClick, fixed }) {
  const Icon = GROUP_ICON[group.label] ?? FolderOutlinedIcon;
  return (
    <ButtonBase
      onClick={onClick}
      disabled={fixed}
      aria-expanded={fixed ? undefined : open}
      sx={{
        width: 'calc(100% - 24px)',
        mx: 1.5,
        px: 1,
        py: 0.75,
        gap: 1.25,
        borderRadius: 2,
        justifyContent: 'flex-start',
        color: open || active ? INK : s.text,
        transition: 'background-color 160ms ease, color 160ms ease',
        '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.04)', color: '#fff' },
        '&.Mui-disabled': { color: s.muted },
      }}
    >
      <Box
        sx={{
          width: 32,
          height: 32,
          borderRadius: 1.75,
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
          color: open || active ? 'var(--brand-light)' : s.muted,
          bgcolor: open || active ? 'rgba(var(--brand-rgb), 0.12)' : s.tile,
          border: '1px solid',
          borderColor: open || active ? 'rgba(var(--brand-rgb), 0.28)' : 'transparent',
          transition: 'all 160ms ease',
        }}
      >
        <Icon sx={{ fontSize: 18 }} />
      </Box>
      <Typography noWrap sx={{ flex: 1, textAlign: 'left', fontSize: '0.875rem', fontWeight: open || active ? 600 : 500, color: 'inherit' }}>
        {group.label}
      </Typography>
      {!fixed && !open && active && <Box sx={{ width: 6, height: 6, borderRadius: '50%', background: s.goldGradient, boxShadow: '0 0 8px rgba(var(--brand-rgb), 0.8)' }} />}
      {!fixed && !open && !active && (
        <Typography component="span" sx={{ fontSize: '0.6875rem', fontWeight: 600, color: s.muted, px: 0.75, py: 0.1, borderRadius: 1, bgcolor: s.tile }}>
          {group.items.length}
        </Typography>
      )}
      {!fixed && <ExpandMoreRoundedIcon sx={{ fontSize: 18, color: s.muted, transition: 'transform 180ms ease', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }} />}
    </ButtonBase>
  );
}

function NavGroup({ group, open, active, onToggle, onNavigate, fixed = false }) {
  if (group.pinned) {
    return (
      <List disablePadding sx={{ mb: 1, mx: 0.75 }}>
        {group.items.map((item) => (
          <NavItem key={item.path} item={item} collapsed={false} onNavigate={onNavigate} />
        ))}
      </List>
    );
  }
  const id = `nav-group-${group.label.toLowerCase().replace(/\W+/g, '-')}`;
  // The open group sits on a faint card so it reads as one block.
  return (
    <Box sx={{ mb: 0.5, mx: 0.75, py: 0.25, borderRadius: 2.5, transition: 'background-color 200ms ease', bgcolor: open || fixed ? 'rgba(255, 255, 255, 0.022)' : 'transparent' }}>
      <GroupHeader group={group} open={open || fixed} active={active} fixed={fixed} onClick={onToggle} />
      {fixed ? (
        <TreeList items={group.items} onNavigate={onNavigate} id={id} />
      ) : (
        <Collapse in={open} timeout={180} unmountOnExit={false}>
          <TreeList items={group.items} onNavigate={onNavigate} id={id} />
        </Collapse>
      )}
    </Box>
  );
}

/** Top of the sidebar: the organisation's logo and name when it has uploaded a logo, else the app's mark and name. */
function Brand({ collapsed, panelName, logoUrl, brandName }) {
  const name = logoUrl && brandName ? brandName : APP_NAME;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
      <Box
        sx={{
          position: 'relative',
          width: 44,
          height: 44,
          borderRadius: 2.75,
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
          overflow: 'hidden',
          border: '1px solid rgba(var(--brand-rgb), 0.4)',
          // A logo sits on white so dark or transparent artwork stays visible on the dark sidebar.
          background: logoUrl ? '#FFFFFF' : 'linear-gradient(145deg, rgba(var(--brand-rgb), 0.18), rgba(var(--brand-rgb), 0.03))',
          boxShadow: '0 0 0 3px rgba(var(--brand-rgb), 0.08), 0 8px 22px rgba(0, 0, 0, 0.4)',
        }}
      >
        {logoUrl ? <Box component="img" src={logoUrl} alt={`${name} logo`} sx={{ width: '100%', height: '100%', objectFit: 'contain', p: 0.5 }} /> : <DiamondMark size={24} />}
      </Box>
      {!collapsed && (
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap title={name} sx={{ fontFamily: fonts.display, fontWeight: 600, fontSize: logoUrl ? 18 : 21, lineHeight: 1.1, letterSpacing: '0.015em', color: INK }}>
            {name}
          </Typography>
          {panelName && (
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mt: 0.5, px: 0.75, py: 0.15, borderRadius: 1, bgcolor: 'rgba(var(--brand-rgb), 0.12)', border: '1px solid rgba(var(--brand-rgb), 0.22)' }}>
              <Box component="span" sx={{ width: 5, height: 5, borderRadius: '50%', background: s.goldGradient }} />
              <Typography component="span" noWrap sx={{ fontSize: '0.5625rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--brand-light)', lineHeight: 1.4 }}>
                {panelName}
              </Typography>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

/** "Find a page": filters every menu the user can see, so a page is two keystrokes away. */
function NavSearch({ value, onChange }) {
  return (
    <Box
      sx={{
        mx: 1.5,
        mb: 1.25,
        px: 1.25,
        height: 36,
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        borderRadius: 2,
        bgcolor: 'rgba(255, 255, 255, 0.04)',
        border: '1px solid rgba(255, 255, 255, 0.07)',
        transition: 'border-color 160ms ease, background-color 160ms ease',
        '&:focus-within': { borderColor: 'rgba(var(--brand-rgb), 0.5)', bgcolor: 'rgba(var(--brand-rgb), 0.06)' },
      }}
    >
      <SearchRoundedIcon sx={{ fontSize: 17, color: s.muted }} />
      <InputBase
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onChange('')}
        placeholder="Find a page…"
        inputProps={{ 'aria-label': 'Find a page' }}
        sx={{ flex: 1, fontSize: '0.8125rem', color: INK, '& input::placeholder': { color: s.muted, opacity: 1 } }}
      />
      {value && (
        <IconButton size="small" onClick={() => onChange('')} aria-label="Clear search" sx={{ p: 0.25, color: s.muted, '&:hover': { color: INK } }}>
          <CloseRoundedIcon sx={{ fontSize: 15 }} />
        </IconButton>
      )}
    </Box>
  );
}

function WorkspaceCard({ name, caption, collapsed }) {
  const monogram = (
    <Box sx={{ position: 'relative', width: 34, height: 34, borderRadius: 2, flexShrink: 0, display: 'grid', placeItems: 'center', background: s.goldGradient, color: 'var(--brand-contrast)', fontFamily: fonts.display, fontWeight: 700, fontSize: 17, boxShadow: '0 4px 14px rgba(var(--brand-rgb), 0.3)' }}>
      {name.trim().charAt(0).toUpperCase()}
      {/* online dot */}
      <Box sx={{ position: 'absolute', right: -2, bottom: -2, width: 10, height: 10, borderRadius: '50%', bgcolor: '#4CAF7D', border: '2px solid #141412' }} />
    </Box>
  );
  if (collapsed) {
    return (
      <Tooltip title={`${name} · ${caption}`} placement="right">
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 1.5 }}>{monogram}</Box>
      </Tooltip>
    );
  }
  return (
    <Box sx={{ m: 1.5, p: 1.25, display: 'flex', alignItems: 'center', gap: 1.25, borderRadius: 2.5, border: '1px solid rgba(var(--brand-rgb), 0.18)', background: 'linear-gradient(145deg, rgba(var(--brand-rgb), 0.10), rgba(255, 255, 255, 0.01))' }}>
      {monogram}
      <Box sx={{ minWidth: 0 }}>
        <Typography noWrap title={name} sx={{ fontSize: '0.8125rem', fontWeight: 600, color: INK, lineHeight: 1.3 }}>
          {name}
        </Typography>
        <Typography noWrap sx={{ fontSize: '0.6875rem', color: s.muted, letterSpacing: '0.04em' }}>
          {caption}
        </Typography>
      </Box>
    </Box>
  );
}

/**
 * `groups` overrides the store navigation (used by the Super Admin panel); `fixedGroups` shows every group open, without folding; `searchable` forces the Find-a-page box on or off (default: shown past 8 pages);
 * `panelName` sits under the logo; `organisationName` and `caption` fill the footer card.
 */
export default function Sidebar({ collapsed = false, onToggleCollapse, onClose, onNavigate, organisationName, caption = 'Organisation', panelName = 'Organisation Panel', logoUrl = null, groups: groupsProp, fixedGroups = false, searchable }) {
  const { data: session } = useSession();
  const storeGroups = visibleNav(usePermissions(), { branchLogin: session?.user?.branchLogin });
  const groups = groupsProp ?? storeGroups;
  const location = useLocation();
  const containsActive = (group) => group.items.some((i) => matchPath({ path: i.path, end: Boolean(i.end) }, location.pathname));
  // Accordion: only one group is open at a time. It starts as the group of the current page (so you can see where
  // you are); clicking another group opens it and closes the rest, clicking the open one closes it.
  // Pinned groups (Dashboard) are always visible and take no part in this.
  const foldable = groups.filter((g) => !g.pinned);
  const [openGroup, setOpenGroup] = useState(() => foldable.find(containsActive)?.label ?? null);
  const isOpen = (group) => openGroup === group.label;
  const [query, setQuery] = useState('');

  useEffect(() => {
    const active = foldable.find(containsActive);
    if (active) setOpenGroup(active.label);
    setQuery('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const toggleGroup = (label) => setOpenGroup((current) => (current === label ? null : label));

  // Search: pages whose name (or group name) matches, grouped as in the menu.
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return groups
      .map((g) => ({ ...g, pinned: false, items: g.items.filter((i) => i.label.toLowerCase().includes(q) || g.label.toLowerCase().includes(q)) }))
      .filter((g) => g.items.length);
  }, [groups, query]);
  const totalPages = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <Box
      sx={(theme) => ({
        position: 'relative',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: `${s.glow}, ${s.surface}`,
        color: s.text,
        overflow: 'hidden',
        borderTopRightRadius: 14,
        borderBottomRightRadius: 14,
        boxShadow: '6px 0 28px rgba(23, 23, 23, 0.14)',
        '&::after': { content: '""', position: 'absolute', top: 0, right: 0, bottom: 0, width: '1px', background: s.edge, pointerEvents: 'none' },
        [theme.getColorSchemeSelector('dark')]: { background: `${s.glow}, ${s.backgroundDark}` },
      })}
    >
      <Box
        sx={{
          pl: collapsed ? 0 : 2,
          pr: collapsed ? 0 : 1.5,
          pt: collapsed ? 2 : 2.5,
          pb: collapsed ? 1.5 : 2,
          display: 'flex',
          flexDirection: collapsed ? 'column' : 'row',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: collapsed ? 1.25 : 1,
        }}
      >
        <Brand collapsed={collapsed} panelName={panelName} logoUrl={logoUrl} brandName={organisationName} />
        {/* Desktop: fold the sidebar. Phone / tablet menu: the same button closes it. */}
        {(onToggleCollapse || onClose) && (
          <Tooltip title={onClose ? 'Close menu' : collapsed ? 'Expand sidebar' : 'Collapse sidebar'} placement="right">
            <IconButton
              size="small"
              onClick={onClose ?? onToggleCollapse}
              aria-label={onClose ? 'Close menu' : collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              sx={{ width: onClose ? 34 : 28, height: onClose ? 34 : 28, flexShrink: 0, borderRadius: '50%', color: s.muted, border: `1px solid ${s.divider}`, bgcolor: s.tile, '&:hover': { color: s.active, borderColor: 'rgba(var(--brand-rgb), 0.4)', bgcolor: 'rgba(var(--brand-rgb), 0.08)' } }}
            >
              {collapsed ? <ChevronRightRoundedIcon sx={{ fontSize: 18 }} /> : <ChevronLeftRoundedIcon sx={{ fontSize: 18 }} />}
            </IconButton>
          </Tooltip>
        )}
      </Box>

      {!collapsed && (searchable ?? totalPages > 8) && <NavSearch value={query} onChange={setQuery} />}
      <Box sx={{ height: '1px', mx: 2, background: 'linear-gradient(90deg, rgba(var(--brand-rgb), 0.35), rgba(255, 255, 255, 0.04))' }} />

      <Box
        component="nav"
        aria-label="Main menu"
        sx={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          py: 1.5,
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(var(--brand-rgb), 0.25) transparent',
          '&::-webkit-scrollbar': { width: 6 },
          '&::-webkit-scrollbar-thumb': { borderRadius: 3, bgcolor: 'rgba(var(--brand-rgb), 0.25)' },
        }}
      >
        {collapsed ? (
          groups.map((group, index) => (
            <Box key={group.label}>
              {index > 0 && <Box sx={{ height: '1px', bgcolor: s.divider, mx: 2.5, my: 1 }} />}
              <List disablePadding>
                {group.items.map((item) => (
                  <NavItem key={item.path} item={item} collapsed onNavigate={onNavigate} />
                ))}
              </List>
            </Box>
          ))
        ) : results ? (
          results.length ? (
            results.map((group) => <NavGroup key={group.label} group={group} fixed active={containsActive(group)} onNavigate={onNavigate} />)
          ) : (
            <Typography sx={{ px: 3, py: 2, fontSize: '0.8125rem', color: s.muted, textAlign: 'center' }}>No page called “{query.trim()}”.</Typography>
          )
        ) : (
          groups.map((group) => <NavGroup key={group.label} group={group} fixed={fixedGroups} open={isOpen(group)} active={containsActive(group)} onToggle={() => toggleGroup(group.label)} onNavigate={onNavigate} />)
        )}
      </Box>

      {organisationName && (
        <Box sx={{ borderTop: `1px solid ${s.divider}` }}>
          <WorkspaceCard name={organisationName} caption={caption} collapsed={collapsed} />
        </Box>
      )}
    </Box>
  );
}
