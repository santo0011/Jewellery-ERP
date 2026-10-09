import AddRoundedIcon from "@mui/icons-material/AddRounded";
import AssignmentOutlinedIcon from "@mui/icons-material/AssignmentOutlined";
import DiamondOutlinedIcon from "@mui/icons-material/DiamondOutlined";
import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined";
import PointOfSaleOutlinedIcon from "@mui/icons-material/PointOfSaleOutlined";
import { Alert, Box, Button, Stack, Typography } from "@mui/material";
import { stateName } from "@jerp/shared";
import { useSelector } from "react-redux";
import { Link as RouterLink } from "react-router";
import { usePermissions, useSession } from "../../hooks/usePermission.js";
import { fonts } from "../../theme/tokens.js";
import { daysUntil } from "../../utils/format.js";
import BranchDashboard from "./BranchDashboard.jsx";

// The counter's everyday jobs, one click from home.
const QUICK_ACTIONS = [
  { to: "/billing", label: "New bill", icon: PointOfSaleOutlinedIcon, perm: "sales.create", primary: true },
  { to: "/orders/new", label: "New order", icon: AssignmentOutlinedIcon, perm: "order.create" },
  { to: "/products/new", label: "Add product", icon: DiamondOutlinedIcon, perm: "product.create" },
  { to: "/customers", label: "Customers", icon: PeopleAltOutlinedIcon, perm: "customer.view" },
];

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function HomePage() {
  const { data: session } = useSession();
  const permissions = usePermissions();
  const activeBranchId = useSelector((s) => s.auth.activeBranchId);
  const { user, organisation, subscription, branches } = session;
  const trialDays = subscription?.status === "trial" ? daysUntil(subscription.trialEndsAt) : null;
  const showDashboard = ["sales.view", "order.view", "inventory.view"].some((p) => permissions.has(p));
  const isOwner = user.allBranches && !user.branchLogin;
  const actions = QUICK_ACTIONS.filter((a) => permissions.has(a.perm));

  return (
    <>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ mb: 3, justifyContent: "space-between", alignItems: { md: "flex-end" } }}>
        <Box>
          <Typography variant="body2" color="textSecondary">
            {organisation.name}
            {organisation.stateCode && ` · ${stateName(organisation.stateCode)}`}
          </Typography>
          <Typography sx={{ fontFamily: fonts.display, fontSize: { xs: 30, md: 36 }, fontWeight: 600, lineHeight: 1.15, mt: 0.5 }}>
            {greeting()}, {user.name.split(" ")[0]}
          </Typography>
        </Box>
        {actions.length > 0 && (
          <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
            {actions.map(({ to, label, icon: Icon, primary }) => (
              <Button key={to} component={RouterLink} to={to} variant={primary ? "contained" : "outlined"} color={primary ? "primary" : "secondary"} startIcon={primary ? <Icon /> : to.endsWith("/new") ? <AddRoundedIcon /> : <Icon />}>
                {label}
              </Button>
            ))}
          </Stack>
        )}
      </Stack>

      {/* Only things that need action show up here. */}
      {isOwner && trialDays !== null && trialDays <= 7 && (
        <Alert severity={trialDays <= 3 ? "error" : "warning"} sx={{ mb: 2 }}>
          {trialDays > 0 ? `Your trial ends in ${trialDays} day${trialDays === 1 ? "" : "s"}.` : "Your trial has ended."} Contact us to continue without interruption.
        </Alert>
      )}
      {!organisation.gstin && permissions.has("organisation.edit") && (
        <Alert
          severity="info"
          sx={{ mb: 2 }}
          action={
            <Button component={RouterLink} to="/settings/organisation" size="small">
              Add now
            </Button>
          }
        >
          Add your shop’s GSTIN and PAN so they print on tax invoices.
        </Alert>
      )}

      {showDashboard && <BranchDashboard branchId={activeBranchId ?? branches[0]?.id} />}
    </>
  );
}
