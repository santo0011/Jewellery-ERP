import AddRoundedIcon from "@mui/icons-material/AddRounded";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import DiamondOutlinedIcon from "@mui/icons-material/DiamondOutlined";
import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined";
import PointOfSaleOutlinedIcon from "@mui/icons-material/PointOfSaleOutlined";
import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import { stateName } from "@jerp/shared";
import { useEffect, useState } from "react";
import { useSelector } from "react-redux";
import { Link as RouterLink } from "react-router";
import { usePermissions, useSession } from "../../hooks/usePermission.js";
import { fonts, tokens } from "../../theme/tokens.js";
import BranchDashboard from "./BranchDashboard.jsx";
import { getLocale, t } from '../../i18n/index.js';

// The counter's everyday jobs, one click from home.
const QUICK_ACTIONS = [
  { to: "/billing", label: t('New bill'), icon: PointOfSaleOutlinedIcon, perm: "sales.create", primary: true },
  { to: "/orders/new", label: t('New order'), icon: AssignmentOutlinedIcon, perm: "order.create" },
  { to: "/products/new", label: t('Add product'), icon: DiamondOutlinedIcon, perm: "product.create" },
  { to: "/customers", label: t('Customers'), icon: PeopleAltOutlinedIcon, perm: "customer.view" },
];

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return t('Good morning');
  if (hour < 17) return t('Good afternoon');
  return t('Good evening');
}

/** The greeting for the time of day, kept current while the page stays open (checked once a minute). */
function useGreeting() {
  const [text, setText] = useState(greeting);
  useEffect(() => {
    const timer = setInterval(() => setText(greeting()), 60 * 1000);
    return () => clearInterval(timer);
  }, []);
  return text;
}

export default function HomePage() {
  const { data: session } = useSession();
  const permissions = usePermissions();
  const activeBranchId = useSelector((s) => s.auth.activeBranchId);
  const hello = useGreeting();
  const { user, organisation, branches } = session;
  // Dashboard → View, and something to show on it (sales figures also need View financial figures).
  const showDashboard = permissions.has("dashboard.view") && ["sales.view", "order.view", "inventory.view"].some((p) => permissions.has(p));
  const actions = QUICK_ACTIONS.filter((a) => permissions.has(a.perm));

  return (
    <>
      {/* The greeting on the dark, gold-lit band of the side menu, with the counter's everyday jobs. */}
      <Box sx={{ position: "relative", overflow: "hidden", borderRadius: 4, mb: { xs: 2, sm: 2.5 }, px: { xs: 2, sm: 3 }, py: { xs: 2.25, sm: 3 }, background: `${tokens.sidebar.glow}, ${tokens.sidebar.surface}`, color: "#F7F3E8", boxShadow: "0 18px 40px -24px rgba(0, 0, 0, 0.55)" }}>
        {/* Two faint gold rings, for depth. */}
        <Box aria-hidden sx={{ position: "absolute", width: 260, height: 260, right: -70, top: -110, borderRadius: "50%", border: "1px solid rgba(var(--brand-rgb), 0.22)" }} />
        <Box aria-hidden sx={{ position: "absolute", width: 180, height: 180, right: 40, top: -40, borderRadius: "50%", border: "1px solid rgba(var(--brand-rgb), 0.14)" }} />
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ position: "relative", justifyContent: "space-between", alignItems: { md: "center" } }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography noWrap sx={{ fontSize: { xs: "0.6875rem", sm: "0.75rem" }, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--brand-light)" }}>
              {organisation.name}
              {organisation.stateCode && ` · ${stateName(organisation.stateCode)}`}
            </Typography>
            <Typography sx={{ fontFamily: fonts.display, fontSize: { xs: 26, sm: 32, md: 38 }, fontWeight: 600, lineHeight: 1.1, mt: 0.5 }}>
              {hello}, {user.name.split(" ")[0]}
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5, color: "rgba(247, 243, 232, 0.6)" }}>
              {new Date().toLocaleDateString(getLocale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </Typography>
          </Box>
          {actions.length > 0 && (
            // Two per row on phones, one row from tablets up.
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(4, auto)" }, gap: 1 }}>
              {actions.map(({ to, label, icon: Icon, primary }) => (
                <Button
                  key={to}
                  component={RouterLink}
                  to={to}
                  variant={primary ? "contained" : "outlined"}
                  startIcon={primary ? <Icon /> : to.endsWith("/new") ? <AddRoundedIcon /> : <Icon />}
                  sx={{
                    whiteSpace: "nowrap",
                    ...(primary
                      ? { boxShadow: "0 8px 20px -8px rgba(var(--brand-rgb), 0.7)" }
                      : { color: "#F7F3E8", borderColor: "rgba(247, 243, 232, 0.28)", bgcolor: "rgba(247, 243, 232, 0.04)", "&:hover": { borderColor: "var(--brand-light)", bgcolor: "rgba(247, 243, 232, 0.1)" } }),
                  }}
                >
                  {label}
                </Button>
              ))}
            </Box>
          )}
        </Stack>
      </Box>

      {/* Only things that need action show up here. */}
      {!organisation.gstin && permissions.has("organisation.edit") && (
        <Alert
          severity="info"
          sx={{ mb: 2 }}
          action={
            <Button component={RouterLink} to="/settings/organisation" size="small">
              {t('Add now')}
            </Button>
          }
        >
          {t('Add your shop’s GSTIN and PAN so they print on tax invoices.')}
        </Alert>
      )}

      {showDashboard && <BranchDashboard branchId={activeBranchId ?? branches[0]?.id} />}
    </>
  );
}
