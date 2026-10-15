import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import DiamondOutlinedIcon from '@mui/icons-material/DiamondOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined';
import ShoppingBagOutlinedIcon from '@mui/icons-material/ShoppingBagOutlined';
import PersonOutlineRoundedIcon from '@mui/icons-material/PersonOutlineRounded';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import PlaylistAddRoundedIcon from '@mui/icons-material/PlaylistAddRounded';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import RuleRoundedIcon from '@mui/icons-material/RuleRounded';
import ShowChartRoundedIcon from '@mui/icons-material/ShowChartRounded';
import SyncAltRoundedIcon from '@mui/icons-material/SyncAltRounded';
import PointOfSaleOutlinedIcon from '@mui/icons-material/PointOfSaleOutlined';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import ReceiptOutlinedIcon from '@mui/icons-material/ReceiptOutlined';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import RequestQuoteOutlinedIcon from '@mui/icons-material/RequestQuoteOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import GroupOutlinedIcon from '@mui/icons-material/GroupOutlined';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';

/** Anyone with at least one of these sees Reports (each report checks its own permission). */
export const REPORT_PERMISSIONS = ['report.sales', 'report.inventory', 'report.customer', 'report.finance', 'payroll.view', 'attendance.view'];

/** Always first and never folded away: a `pinned` group renders without a collapsible header. */
export const DASHBOARD_GROUP = { label: 'Dashboard', pinned: true, items: [{ label: 'Dashboard', mobileLabel: 'Home', path: '/', icon: DashboardOutlinedIcon, end: true, mobile: true }] };

export const NAV_GROUPS = [
  DASHBOARD_GROUP,
  {
    label: 'Overview',
    items: [
      { label: 'Reports', path: '/reports', icon: AssessmentOutlinedIcon, permission: REPORT_PERMISSIONS },
      { label: 'Metal rates', path: '/rates', icon: ShowChartRoundedIcon, permission: 'rate.view' },
      { label: 'Approvals', path: '/approvals', icon: FactCheckOutlinedIcon, permission: 'inventory.approve', badge: 'approvals' },
    ],
  },
  {
    label: 'Sales',
    items: [
      { label: 'New bill', path: '/billing', icon: PointOfSaleOutlinedIcon, permission: 'sales.create', mobile: true },
      { label: 'Orders', path: '/orders', icon: AssignmentOutlinedIcon, permission: 'order.view', mobile: true },
      { label: 'Invoices', path: '/sales', icon: ReceiptOutlinedIcon, permission: 'sales.view' },
      { label: 'Customers', path: '/customers', icon: PeopleAltOutlinedIcon, permission: 'customer.view', mobile: true },
    ],
  },
  {
    // What is in the shop and how it moves.
    label: 'Stock',
    items: [
      { label: 'Stock summary', path: '/inventory', icon: Inventory2OutlinedIcon, permission: 'inventory.view', end: true },
      { label: 'Products', path: '/products', icon: DiamondOutlinedIcon, permission: 'product.view', mobile: true },
      { label: 'Opening stock', path: '/inventory/opening', icon: PlaylistAddRoundedIcon, permission: 'inventory.view' },
      { label: 'Adjustments', path: '/inventory/adjustments', icon: RuleRoundedIcon, permission: 'inventory.view' },
      { label: 'Transfers', path: '/inventory/transfers', icon: SyncAltRoundedIcon, permission: 'inventory.view' },
      { label: 'Stock ledger', path: '/inventory/ledger', icon: ReceiptLongOutlinedIcon, permission: 'inventory.view' },
    ],
  },
  {
    // Buying: who from, what was ordered, what was billed.
    label: 'Purchase',
    items: [
      { label: 'Purchases', path: '/purchases', icon: ShoppingBagOutlinedIcon, permission: 'purchase.view', end: true },
      { label: 'Items', path: '/items', icon: CategoryOutlinedIcon, permission: 'purchase.view' },
      { label: 'Purchase orders', path: '/purchases/orders', icon: PendingActionsOutlinedIcon, permission: 'purchase.view' },
      { label: 'Suppliers', path: '/suppliers', icon: LocalShippingOutlinedIcon, permission: 'supplier.view' },
    ],
  },
  {
    label: 'HR & Payroll',
    items: [
      { label: 'Employees', path: '/hr/employees', icon: BadgeOutlinedIcon, permission: 'employee.view' },
      { label: 'Attendance', path: '/hr/attendance', icon: EventAvailableOutlinedIcon, permission: 'attendance.view' },
      { label: 'Salary advances', path: '/hr/advances', icon: RequestQuoteOutlinedIcon, permission: 'payroll.view' },
      { label: 'Payroll', path: '/hr/payroll', icon: PaymentsOutlinedIcon, permission: 'payroll.view' },
    ],
  },
  {
    // The business itself and how it is set up.
    label: 'Settings',
    items: [
      { label: 'Organisation', path: '/settings/organisation', icon: StorefrontOutlinedIcon, permission: 'organisation.view' },
      { label: 'Branches', path: '/settings/branches', icon: AccountTreeOutlinedIcon, permission: 'branch.view' },
      { label: 'Business settings', path: '/settings/business', icon: TuneRoundedIcon, permission: 'settings.view' },
      // A branch's own invoice print design — for people who work in particular branches (the organisation sets its own under Business settings → Print).
      { label: 'Print settings', path: '/settings/print', icon: PrintOutlinedIcon, permission: 'settings.view', ownBranchesOnly: true },
      { label: 'Product categories', path: '/settings/categories', icon: CategoryOutlinedIcon, permission: 'category.view' },
      { label: 'Subscription', path: '/settings/subscription', icon: WorkspacePremiumOutlinedIcon, permission: 'subscription.view' },
    ],
  },
  {
    // The people who use it and what they may do.
    label: 'Users & access',
    items: [
      { label: 'Users', path: '/settings/users', icon: GroupOutlinedIcon, permission: 'user.view' },
      { label: 'Roles & permissions', path: '/settings/roles', icon: AdminPanelSettingsOutlinedIcon, permission: 'role.view' },
      { label: 'Audit log', path: '/settings/audit-log', icon: HistoryRoundedIcon, permission: 'audit.view' },
    ],
  },
];

export const PROFILE_ITEM = { label: 'Profile', path: '/profile', icon: PersonOutlineRoundedIcon, mobile: true };

/**
 * The menu for these permissions: every page the role allows, for an organisation user and a branch login alike.
 * `ownBranchesOnly` items show only to people who work in particular branches (`allBranches` false).
 */
export function visibleNav(permissions, { allBranches = true } = {}) {
  const allowed = (i) => (!i.permission || [].concat(i.permission).some((p) => permissions.has(p))) && !(i.ownBranchesOnly && allBranches);
  return NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter(allowed) })).filter((g) => g.items.length);
}

/**
 * List pages whose data follows the navbar branch filter, and the module each belongs to. The filter shows on a page
 * only while its module is opened to at least one other branch (session.branchModules, from Branch access); otherwise
 * the page shows the head office's data. A new list page that filters by branch is one more line here.
 */
export const BRANCH_FILTER_PAGES = [
  { path: '/sales', module: 'sales' },
  { path: '/orders', module: 'order' },
  { path: '/products', module: 'product' },
  { path: '/inventory', module: 'inventory' },
  { path: '/inventory/opening', module: 'inventory' },
  { path: '/inventory/adjustments', module: 'inventory' },
  { path: '/inventory/transfers', module: 'inventory' },
  { path: '/inventory/ledger', module: 'inventory' },
  { path: '/purchases', module: 'purchase' },
  { path: '/purchases/orders', module: 'purchase' },
  { path: '/hr/employees', module: 'employee' },
];

/** Pages that work in one branch at a time (they keep the switcher, without "All branches"). */
export const WORKING_BRANCH_PAGES = [
  { path: '/', module: null },
  { path: '/billing', module: 'sales' },
];

/** How the navbar branch control behaves on a page: 'filter' (with All), 'working' (one branch), or null (hidden). */
export function branchControlFor(pathname, sharedModules) {
  const shared = new Set(sharedModules ?? []);
  const exact = (list) => list.find((p) => p.path === pathname.replace(/\/+$/, '') || (p.path === '/' && pathname === '/'));
  const filterPage = exact(BRANCH_FILTER_PAGES);
  if (filterPage) return shared.has(filterPage.module) ? 'filter' : null;
  const workingPage = exact(WORKING_BRANCH_PAGES);
  if (workingPage) return !workingPage.module || shared.has(workingPage.module) ? 'working' : null;
  return null;
}
