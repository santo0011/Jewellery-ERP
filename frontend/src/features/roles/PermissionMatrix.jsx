import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import PointOfSaleOutlinedIcon from '@mui/icons-material/PointOfSaleOutlined';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import ShoppingBagOutlinedIcon from '@mui/icons-material/ShoppingBagOutlined';
import { Box, Button, ButtonBase, Card, Checkbox, Stack, Tooltip, Typography } from '@mui/material';
import { isOrganisationLevel, isUpcomingPermission, PERMISSION_MODULES } from '@jerp/shared';
import { useMemo } from 'react';
import { EmptyState } from '../../components/StateViews.jsx';

const GROUP_ICONS = {
  Overview: DashboardOutlinedIcon,
  Administration: AdminPanelSettingsOutlinedIcon,
  Customers: PeopleAltOutlinedIcon,
  Sales: PointOfSaleOutlinedIcon,
  Inventory: Inventory2OutlinedIcon,
  Purchase: ShoppingBagOutlinedIcon,
  Staff: BadgeOutlinedIcon,
  Accounts: AccountBalanceOutlinedIcon,
  Reports: AssessmentOutlinedIcon,
};

/** What each area covers, under its name. */
const MODULE_HINTS = {
  dashboard: 'The home page figures and charts',
  organisation: 'Shop name, GSTIN, address and logo',
  branch: 'Branches, their logins and access',
  user: 'Staff accounts that sign in',
  role: 'These roles and what they allow',
  settings: 'Invoice, tax, jewellery, barcode and print',
  audit: 'Who changed what, and when',
  subscription: 'Plan, renewal and payments',
  customer: 'Customer records, KYC and dues',
  order: 'Custom orders and their advances',
  sales: 'Billing, invoices, returns and discounts',
  rate: 'Daily gold, silver and platinum rates',
  category: 'Product categories',
  product: 'Tagged items, weights and prices',
  inventory: 'Stock, adjustments and transfers',
  supplier: 'Suppliers and what is owed to them',
  purchase: 'Purchase bills, purchase orders and the item list',
  employee: 'Staff records and salary details',
  attendance: 'Daily attendance and holidays',
  payroll: 'Salary runs and advances',
  accounts: 'Money received against dues',
  report: 'Reports, by area',
};

/**
 * Organisation-level permissions (see isOrganisationLevel): running the organisation and changing what all branches
 * share. They apply only to people with access to all branches; a branch login never gets them, even when turned on.
 * Marked with a globe (a whole area: "Organisation only").
 */
export const ALL_BRANCHES_NOTE = 'Organisation-level — only for users with access to all branches. A branch login never gets these, even when turned on here.';

const OrgOnlyBadge = () => (
  <Tooltip title={ALL_BRANCHES_NOTE} arrow enterTouchDelay={0}>
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.375, px: 0.75, py: 0.125, borderRadius: 999, fontSize: '0.625rem', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap', color: '#2F5D7C', bgcolor: 'rgba(47, 93, 124, 0.10)', border: '1px solid rgba(47, 93, 124, 0.25)' }}>
      <PublicOutlinedIcon sx={{ fontSize: 12 }} /> Organisation only
    </Box>
  </Tooltip>
);

/** Areas and their actions, grouped — only what does something in the app today (see isUpcomingPermission). */
export function permissionGroups(only, branchRole = false) {
  const groups = [];
  for (const m of PERMISSION_MODULES) {
    if (only && !only.includes(m.key)) continue;
    const actions = Object.entries(m.actions)
      .map(([action, label]) => ({ key: `${m.key}.${action}`, label }))
      // A branch role (Branch Manager) is never offered organisation-level permissions.
      .filter((a) => !isUpcomingPermission(a.key) && !(branchRole && isOrganisationLevel(a.key)));
    if (!actions.length) continue;
    let group = groups.find((g) => g.name === m.group);
    if (!group) groups.push((group = { name: m.group, modules: [] }));
    group.modules.push({ key: m.key, label: m.label, hint: MODULE_HINTS[m.key], actions });
  }
  return groups;
}

const keysOf = (modules) => modules.flatMap((m) => m.actions.map((a) => a.key));

/** One action as a pill: gold with a tick when allowed. */
function ActionPill({ label, on, disabled, onToggle, allBranchesOnly }) {
  const pill = (
    <ButtonBase
      role="checkbox"
      aria-checked={on}
      disabled={disabled}
      onClick={onToggle}
      sx={{
        gap: 0.5,
        pl: on ? 0.75 : 1.25,
        pr: 1.25,
        py: 0.5,
        borderRadius: 999,
        border: '1px solid',
        borderColor: on ? 'rgba(var(--brand-rgb), 0.55)' : 'divider',
        bgcolor: on ? 'rgba(var(--brand-rgb), 0.14)' : 'background.paper',
        color: on ? 'var(--brand-strong)' : 'text.secondary',
        fontSize: '0.8125rem',
        fontWeight: on ? 600 : 500,
        lineHeight: 1.3,
        transition: 'background-color 140ms, border-color 140ms, color 140ms',
        '&:hover': { borderColor: disabled ? undefined : 'var(--brand)' },
        '&.Mui-disabled': { opacity: on ? 0.85 : 0.6 },
        '&:focus-visible': { outline: '2px solid var(--brand)', outlineOffset: 2 },
      }}
    >
      {on && <CheckRoundedIcon sx={{ fontSize: 15 }} />}
      {label}
      {allBranchesOnly && <PublicOutlinedIcon aria-label="All branches only" sx={{ fontSize: 14, opacity: 0.7 }} />}
    </ButtonBase>
  );
  return allBranchesOnly ? (
    <Tooltip title={ALL_BRANCHES_NOTE} arrow enterTouchDelay={0}>
      <span>{pill}</span>
    </Tooltip>
  ) : (
    pill
  );
}

const CountChip = ({ on, total }) => (
  <Box
    component="span"
    sx={{
      px: 0.875,
      py: 0.125,
      borderRadius: 999,
      fontSize: '0.6875rem',
      fontWeight: 700,
      fontVariantNumeric: 'tabular-nums',
      whiteSpace: 'nowrap',
      bgcolor: on === total ? 'rgba(var(--brand-rgb), 0.16)' : on ? 'rgba(var(--brand-rgb), 0.08)' : 'action.hover',
      color: on ? 'var(--brand-strong)' : 'text.secondary',
    }}
  >
    {on}/{total}
  </Box>
);

/**
 * Who may do what: each group a card, each area a row with a master tick and its actions as pills. `search` narrows
 * to the areas or actions that match; `compact` keeps one column (narrow drawers). Permissions not offered (upcoming
 * features) are kept as they are in `value`.
 */
export default function PermissionMatrix({ value, onChange, disabled = false, modules: only, search = '', compact = false, branchRole = false }) {
  const selected = useMemo(() => new Set(value), [value]);
  const groups = useMemo(() => permissionGroups(only, branchRole), [only, branchRole]);

  const q = search.trim().toLowerCase();
  const shown = q
    ? groups
        .map((g) => ({
          ...g,
          modules: g.modules
            .map((m) => (m.label.toLowerCase().includes(q) || g.name.toLowerCase().includes(q) ? m : { ...m, actions: m.actions.filter((a) => a.label.toLowerCase().includes(q)) }))
            .filter((m) => m.actions.length),
        }))
        .filter((g) => g.modules.length)
    : groups;

  const toggle = (keys, on) => {
    const next = new Set(selected);
    keys.forEach((k) => (on ? next.add(k) : next.delete(k)));
    onChange([...next]);
  };

  if (!shown.length) return <EmptyState title="No permission matches" description={`Nothing found for “${search.trim()}”.`} />;

  return (
    <Stack spacing={2}>
      {shown.map((g) => {
        const Icon = GROUP_ICONS[g.name] ?? AdminPanelSettingsOutlinedIcon;
        const keys = keysOf(g.modules);
        const on = keys.filter((k) => selected.has(k)).length;
        return (
          <Card key={g.name} sx={{ overflow: 'hidden' }}>
            <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', px: { xs: 1.5, sm: 2 }, py: 1.25, bgcolor: 'rgba(var(--brand-rgb), 0.05)', borderBottom: 1, borderColor: 'divider' }}>
              <Box sx={{ width: 32, height: 32, borderRadius: 2, flexShrink: 0, display: 'grid', placeItems: 'center', bgcolor: 'rgba(var(--brand-rgb), 0.14)', color: 'var(--brand-strong)' }}>
                <Icon sx={{ fontSize: 18 }} />
              </Box>
              <Typography sx={{ fontWeight: 700, fontSize: '0.9375rem', flex: 1, minWidth: 0 }} noWrap>
                {g.name}
              </Typography>
              <CountChip on={on} total={keys.length} />
              {!disabled && (
                <Button size="small" onClick={() => toggle(keys, on < keys.length)} sx={{ minHeight: 0, py: 0.25, px: 1, fontSize: '0.75rem', whiteSpace: 'nowrap' }}>
                  {on < keys.length ? 'Allow all' : 'Clear'}
                </Button>
              )}
            </Stack>
            {g.modules.map((m, i) => {
              const mk = m.actions.map((a) => a.key);
              const count = mk.filter((k) => selected.has(k)).length;
              return (
                <Box
                  key={m.key}
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: compact ? '1fr' : { xs: '1fr', md: 'minmax(190px, 240px) 1fr' },
                    gap: { xs: 1, md: 2 },
                    px: { xs: 1.5, sm: 2 },
                    py: 1.5,
                    alignItems: 'start',
                    borderTop: i ? 1 : 0,
                    borderColor: 'divider',
                  }}
                >
                  <Stack direction="row" spacing={0.5} sx={{ alignItems: 'flex-start', minWidth: 0 }}>
                    <Checkbox
                      size="small"
                      disabled={disabled}
                      checked={count === mk.length}
                      indeterminate={count > 0 && count < mk.length}
                      onChange={(e) => toggle(mk, e.target.checked)}
                      slotProps={{ input: { 'aria-label': `All of ${m.label}` } }}
                      sx={{ p: 0.5, mt: -0.25, ml: -0.5 }}
                    />
                    <Box sx={{ minWidth: 0, flex: 1 }}>
                      <Stack direction="row" spacing={0.75} sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}>
                        <Typography sx={{ fontWeight: 600, fontSize: '0.875rem' }}>{m.label}</Typography>
                        <CountChip on={count} total={mk.length} />
                        {mk.every(isOrganisationLevel) && <OrgOnlyBadge />}
                      </Stack>
                      {m.hint && (
                        <Typography variant="caption" color="textSecondary" sx={{ display: 'block', lineHeight: 1.35, mt: 0.125 }}>
                          {m.hint}
                        </Typography>
                      )}
                    </Box>
                  </Stack>
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, pl: compact ? 3.5 : { xs: 3.5, md: 0 } }}>
                    {m.actions.map((a) => (
                      <ActionPill key={a.key} label={a.label} on={selected.has(a.key)} disabled={disabled} allBranchesOnly={isOrganisationLevel(a.key) && !mk.every(isOrganisationLevel)} onToggle={() => toggle([a.key], !selected.has(a.key))} />
                    ))}
                  </Box>
                </Box>
              );
            })}
          </Card>
        );
      })}
    </Stack>
  );
}
