import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import ApartmentRoundedIcon from '@mui/icons-material/ApartmentRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded';
import HubOutlinedIcon from '@mui/icons-material/HubOutlined';
import { Box, Button, Divider, Menu, MenuItem, Typography } from '@mui/material';
import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { allBranchesSelected, branchSelected } from '../store/authSlice.js';
import { t } from '../i18n/index.js';

// Icon tile colours per kind of option: the head office in brand gold, "All branches" in blue, branches neutral.
const TILE = {
  gold: { color: 'var(--brand-strong)', bgcolor: 'rgba(var(--brand-rgb), 0.14)' },
  blue: { color: '#2F5D7C', bgcolor: 'rgba(47, 93, 124, 0.12)' },
  grey: { color: 'text.secondary', bgcolor: 'action.hover' },
};

/** Two letters for a branch tile: its code, or the first letters of its name. */
const initials = (b) => (b.code || b.name.split(/\s+/).map((w) => w[0]).join('')).slice(0, 2).toUpperCase();

function SectionLabel({ children }) {
  return <Typography sx={{ px: 1.25, pt: 0.5, pb: 0.25, fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'text.secondary' }}>{children}</Typography>;
}

/** One row: icon tile, name and a short line under it, a check on the right when it is the current choice. */
function Option({ on, onClick, tile, tone, primary, secondary }) {
  return (
    <MenuItem
      selected={on}
      onClick={onClick}
      sx={{ gap: 1, px: 1, py: 0.625, minHeight: 0, borderRadius: 1.5, '&.Mui-selected': { bgcolor: 'rgba(var(--brand-rgb), 0.10)' }, '&.Mui-selected:hover': { bgcolor: 'rgba(var(--brand-rgb), 0.14)' } }}
    >
      <Box sx={{ width: 28, height: 28, borderRadius: 1.25, flexShrink: 0, display: 'grid', placeItems: 'center', fontSize: '0.6875rem', fontWeight: 800, ...TILE[tone] }}>{tile}</Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography noWrap sx={{ fontSize: '0.8125rem', fontWeight: on ? 700 : 600, lineHeight: 1.3 }}>
          {primary}
        </Typography>
        {secondary && (
          <Typography noWrap sx={{ fontSize: '0.6875rem', color: 'text.secondary', lineHeight: 1.3 }}>
            {secondary}
          </Typography>
        )}
      </Box>
      <Box sx={{ width: 18, height: 18, flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', ...(on && { bgcolor: 'var(--brand-strong)', color: '#fff' }) }}>{on && <CheckRoundedIcon sx={{ fontSize: 12 }} />}</Box>
    </MenuItem>
  );
}

/**
 * The navbar branch filter. Options: Head Office (the default), All branches, then each branch.
 * Choosing a branch shows its data on list pages and makes it the working branch; "All branches" shows every
 * branch on list pages while the head office stays the working branch. `allowAll={false}` (dashboard, new bill)
 * offers single branches only, since those pages work on one branch. Hidden when there is only one branch to
 * work in (a branch login, or an organisation with just its head office): there is nothing to switch.
 */
export default function BranchSwitcher({ branches, allowAll = true }) {
  const dispatch = useDispatch();
  const activeId = useSelector((s) => s.auth.activeBranchId);
  const view = useSelector((s) => s.auth.branchView);
  const [anchor, setAnchor] = useState(null);

  if (branches.length < 2) return null;

  const headOffice = branches.find((b) => b.isHeadOffice);
  const others = branches.filter((b) => b !== headOffice);
  const canAll = allowAll && branches.length > 1;
  const showingAll = canAll && view === 'all';
  const active = branches.find((b) => b.id === activeId);
  const label = showingAll ? t('All branches') : (active?.name ?? t('Select branch'));
  const close = () => setAnchor(null);
  const pick = (id) => {
    dispatch(branchSelected(id));
    close();
  };
  const isOn = (b) => !showingAll && b.id === activeId;

  return (
    <>
      <Button
        color="secondary"
        variant="outlined"
        size="small"
        onClick={(e) => setAnchor(e.currentTarget)}
        startIcon={showingAll ? <HubOutlinedIcon fontSize="small" /> : <AccountTreeOutlinedIcon fontSize="small" />}
        endIcon={<ExpandMoreRoundedIcon />}
        sx={{ borderColor: 'divider', borderRadius: 999, bgcolor: 'background.paper', px: 1.5, maxWidth: { xs: 150, sm: 240 }, minHeight: 34, height: 34, fontWeight: 600, '& .MuiButton-startIcon': { color: 'var(--brand-strong)' }, '&:hover': { borderColor: 'rgba(var(--brand-rgb), 0.5)', bgcolor: 'rgba(var(--brand-rgb), 0.05)' } }}
        aria-label={t('Branch filter')}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      </Button>
      <Menu
        anchorEl={anchor}
        open={Boolean(anchor)}
        onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{ paper: { sx: { mt: 0.75, minWidth: 230, maxWidth: 290, borderRadius: 2.5, border: '1px solid', borderColor: 'divider', boxShadow: '0 12px 32px rgba(23, 23, 23, 0.12)' } }, list: { sx: { p: 0.75 } } }}
      >
        <SectionLabel>{t('Show data for')}</SectionLabel>
        {headOffice && <Option on={isOn(headOffice)} onClick={() => pick(headOffice.id)} tile={<ApartmentRoundedIcon sx={{ fontSize: 16 }} />} tone="gold" primary={headOffice.name} secondary={[t('Head office'), headOffice.code].filter(Boolean).join(' · ')} />}
        {canAll && (
          <Option
            on={showingAll}
            onClick={() => {
              dispatch(allBranchesSelected(headOffice?.id ?? activeId));
              close();
            }}
            tile={<HubOutlinedIcon sx={{ fontSize: 16 }} />}
            tone="blue"
            primary={t('All branches')}
            secondary={t('{{count}} branches together', { count: branches.length })}
          />
        )}
        {others.length > 0 && (
          <>
            <Divider sx={{ my: 0.5 }} />
            <SectionLabel>{t('Branches')}</SectionLabel>
          </>
        )}
        {others.map((b) => (
          <Option key={b.id} on={isOn(b)} onClick={() => pick(b.id)} tile={initials(b)} tone="grey" primary={b.name} secondary={b.code} />
        ))}
      </Menu>
    </>
  );
}
