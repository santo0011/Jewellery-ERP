import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import { Box, ButtonBase, Collapse, IconButton, List, ListItemButton, ListItemText, Tooltip, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { matchPath, NavLink, useLocation } from 'react-router';
import { DiamondMark } from '../components/Wordmark.jsx';
import { APP_NAME } from '../config.js';
import { usePendingApprovalsQuery } from '../features/approvals/approvalApi.js';
import { usePermissions, useSession } from '../hooks/usePermission.js';
import { fonts, tokens } from '../theme/tokens.js';
import { visibleNav } from './navConfig.js';

const s = tokens.sidebar;

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
        right: 8,
        minWidth: 20,
        height: 20,
        px: 0.75,
        borderRadius: 10,
        background: s.goldGradient,
        color: '#171717',
        fontSize: '0.6875rem',
        fontWeight: 700,
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

function NavItem({ item, collapsed, onNavigate }) {
  const Icon = item.icon;
  const button = (
    <ListItemButton
      component={NavLink}
      to={item.path}
      end={item.end}
      onClick={onNavigate}
      sx={{
        position: 'relative',
        mx: 1.5,
        mb: 0.5,
        px: collapsed ? 0 : 1,
        minHeight: 44,
        gap: 1.5,
        borderRadius: 2.5,
        color: s.text,
        justifyContent: collapsed ? 'center' : 'flex-start',
        transition: 'background-color 160ms ease, color 160ms ease',
        '& .nav-tile': { transition: 'background 160ms ease, color 160ms ease, box-shadow 160ms ease' },
        '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.04)', color: '#fff' },
        '&:hover .nav-tile': { color: s.active, bgcolor: 'rgba(201, 162, 39, 0.10)' },
        '&.active': { background: s.activeFill, color: '#F7F3E8' },
        '&.active .nav-tile': { background: s.goldGradient, color: '#171717', boxShadow: '0 4px 14px rgba(201, 162, 39, 0.35)' },
        '&.active::before': {
          content: '""',
          position: 'absolute',
          left: -12,
          top: 10,
          bottom: 10,
          width: 3,
          borderRadius: '0 3px 3px 0',
          background: s.goldGradient,
          boxShadow: '0 0 12px rgba(201, 162, 39, 0.6)',
        },
      }}
    >
      <Box className="nav-tile" sx={{ width: 32, height: 32, borderRadius: 2, flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: s.tile, color: s.muted }}>
        <Icon sx={{ fontSize: 18 }} />
      </Box>
      {!collapsed && <ListItemText primary={item.label} sx={{ my: 0 }} slotProps={{ primary: { noWrap: true, sx: { fontSize: '0.875rem', fontWeight: 500, letterSpacing: '0.005em' } } }} />}
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

function NavGroup({ group, open, onToggle, onNavigate, fixed = false }) {
  if (fixed && !group.pinned) {
    return (
      <Box sx={{ mb: 1 }}>
        <Box sx={{ mx: 1.5, px: 1, py: 0.75, display: 'flex', alignItems: 'center', gap: 1, color: s.muted }}>
          <Box component="span" sx={{ width: 12, height: '1.5px', background: s.goldGradient, opacity: 0.8 }} />
          <Typography variant="overline" sx={{ color: 'inherit', lineHeight: 1.8, fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.1em' }}>
            {group.label}
          </Typography>
        </Box>
        <List disablePadding sx={{ pt: 0.5 }}>
          {group.items.map((item) => (
            <NavItem key={item.path} item={item} collapsed={false} onNavigate={onNavigate} />
          ))}
        </List>
      </Box>
    );
  }
  if (group.pinned) {
    return (
      <List disablePadding sx={{ mb: 1 }}>
        {group.items.map((item) => (
          <NavItem key={item.path} item={item} collapsed={false} onNavigate={onNavigate} />
        ))}
      </List>
    );
  }
  const id = `nav-group-${group.label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <Box sx={{ mb: 1 }}>
      <ButtonBase
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={id}
        sx={{
          width: 'calc(100% - 24px)',
          mx: 1.5,
          px: 1,
          py: 0.75,
          gap: 1,
          borderRadius: 1.5,
          justifyContent: 'flex-start',
          color: s.muted,
          '&:hover': { color: s.text },
        }}
      >
        <Box component="span" sx={{ width: 12, height: '1.5px', background: s.goldGradient, opacity: 0.8 }} />
        <Typography variant="overline" sx={{ color: 'inherit', lineHeight: 1.8, fontSize: '0.8rem', fontWeight: 600, letterSpacing: '0.1em', flex: 1, textAlign: 'left' }}>
          {group.label}
        </Typography>
        <ExpandMoreRoundedIcon sx={{ fontSize: 20, transition: 'transform 160ms ease', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }} />
      </ButtonBase>
      <Collapse in={open} timeout={160} unmountOnExit={false}>
        <List disablePadding id={id} sx={{ pt: 0.5 }}>
          {group.items.map((item) => (
            <NavItem key={item.path} item={item} collapsed={false} onNavigate={onNavigate} />
          ))}
        </List>
      </Collapse>
    </Box>
  );
}

function Brand({ collapsed, panelName }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
      <Box
        sx={{
          width: 40,
          height: 40,
          borderRadius: 2.5,
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
          border: '1px solid rgba(201, 162, 39, 0.35)',
          background: 'linear-gradient(145deg, rgba(201, 162, 39, 0.14), rgba(201, 162, 39, 0.02))',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 6px 18px rgba(0, 0, 0, 0.35)',
        }}
      >
        <DiamondMark size={24} />
      </Box>
      {!collapsed && (
        <Box sx={{ minWidth: 0 }}>
          <Typography noWrap sx={{ fontFamily: fonts.display, fontWeight: 600, fontSize: 22, lineHeight: 1, letterSpacing: '0.02em', color: '#F7F3E8' }}>
            {APP_NAME}
          </Typography>
          {panelName && (
            <Typography noWrap sx={{ mt: 0.5, fontSize: '0.625rem', fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: s.active, lineHeight: 1.2 }}>
              {panelName}
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}

function WorkspaceCard({ name, caption, collapsed }) {
  const monogram = (
    <Box sx={{ width: 34, height: 34, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center', background: s.goldGradient, color: '#171717', fontFamily: fonts.display, fontWeight: 700, fontSize: 17, boxShadow: '0 4px 14px rgba(201, 162, 39, 0.3)' }}>
      {name.trim().charAt(0).toUpperCase()}
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
    <Box sx={{ m: 1.5, p: 1.25, display: 'flex', alignItems: 'center', gap: 1.25, borderRadius: 2.5, border: '1px solid rgba(201, 162, 39, 0.18)', background: 'linear-gradient(145deg, rgba(201, 162, 39, 0.08), rgba(255, 255, 255, 0.01))' }}>
      {monogram}
      <Box sx={{ minWidth: 0 }}>
        <Typography noWrap sx={{ fontSize: '0.8125rem', fontWeight: 600, color: '#F7F3E8', lineHeight: 1.3 }}>
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
 * `groups` overrides the store navigation (used by the Super Admin panel); `fixedGroups` shows every group open, without folding;
 * `panelName` sits under the logo; `organisationName` and `caption` fill the footer card.
 */
export default function Sidebar({ collapsed = false, onToggleCollapse, onNavigate, organisationName, caption = 'Organisation', panelName = 'Organisation Panel', groups: groupsProp, fixedGroups = false }) {
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

  useEffect(() => {
    const active = foldable.find(containsActive);
    if (active) setOpenGroup(active.label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  const toggleGroup = (label) => setOpenGroup((current) => (current === label ? null : label));

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
        borderTopRightRadius: 10,
        borderBottomRightRadius: 10,
        boxShadow: '4px 0 24px rgba(23, 23, 23, 0.12)',
        '&::after': { content: '""', position: 'absolute', top: 0, right: 0, bottom: 0, width: '1px', background: s.edge, pointerEvents: 'none' },
        [theme.getColorSchemeSelector('dark')]: { background: `${s.glow}, ${s.backgroundDark}` },
      })}
    >
      <Box
        sx={{
          pl: collapsed ? 0 : 2.25,
          pr: collapsed ? 0 : 1.5,
          pt: collapsed ? 2 : 2.5,
          pb: collapsed ? 1.5 : 2.25,
          display: 'flex',
          flexDirection: collapsed ? 'column' : 'row',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          gap: collapsed ? 1.25 : 1,
        }}
      >
        <Brand collapsed={collapsed} panelName={panelName} />
        {onToggleCollapse && (
          <Tooltip title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} placement="right">
            <IconButton
              size="small"
              onClick={onToggleCollapse}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              sx={{ width: 28, height: 28, borderRadius: 2, color: s.muted, border: `1px solid ${s.divider}`, bgcolor: s.tile, '&:hover': { color: s.active, borderColor: 'rgba(201, 162, 39, 0.4)', bgcolor: 'rgba(201, 162, 39, 0.08)' } }}
            >
              {collapsed ? <ChevronRightRoundedIcon sx={{ fontSize: 18 }} /> : <ChevronLeftRoundedIcon sx={{ fontSize: 18 }} />}
            </IconButton>
          </Tooltip>
        )}
      </Box>
      <Box sx={{ height: '1px', mx: 2, mb: 1, background: 'linear-gradient(90deg, rgba(201, 162, 39, 0.35), rgba(255, 255, 255, 0.04))' }} />

      <Box
        component="nav"
        sx={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          py: 1.5,
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(201, 162, 39, 0.25) transparent',
          '&::-webkit-scrollbar': { width: 6 },
          '&::-webkit-scrollbar-thumb': { borderRadius: 3, bgcolor: 'rgba(201, 162, 39, 0.25)' },
        }}
      >
        {groups.map((group, index) =>
          collapsed ? (
            <Box key={group.label}>
              {index > 0 && <Box sx={{ height: '1px', bgcolor: s.divider, mx: 2.5, my: 1.25 }} />}
              <List disablePadding>
                {group.items.map((item) => (
                  <NavItem key={item.path} item={item} collapsed onNavigate={onNavigate} />
                ))}
              </List>
            </Box>
          ) : (
            <NavGroup key={group.label} group={group} fixed={fixedGroups} open={isOpen(group)} onToggle={() => toggleGroup(group.label)} onNavigate={onNavigate} />
          ),
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
