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
import RecyclingRoundedIcon from '@mui/icons-material/RecyclingRounded';
import BadgeOutlinedIcon from '@mui/icons-material/BadgeOutlined';
import EventAvailableOutlinedIcon from '@mui/icons-material/EventAvailableOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import RequestQuoteOutlinedIcon from '@mui/icons-material/RequestQuoteOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import AccountTreeOutlinedIcon from '@mui/icons-material/AccountTreeOutlined';
import AdminPanelSettingsOutlinedIcon from '@mui/icons-material/AdminPanelSettingsOutlined';
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import AccountBalanceWalletOutlinedIcon from '@mui/icons-material/AccountBalanceWalletOutlined';
import ScaleOutlinedIcon from '@mui/icons-material/ScaleOutlined';
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded';
import { t } from '../i18n/index.js';

/** Anyone with at least one of these sees Reports (each report checks its own permission). */
export const REPORT_PERMISSIONS = ['report.sales', 'report.inventory', 'report.customer', 'report.finance', 'purchase.view', 'payroll.view', 'attendance.view'];

/** Always first and never folded away: a `pinned` group renders without a collapsible header. */
export const DASHBOARD_GROUP = { label: t('Dashboard'), pinned: true, items: [{ label: t('Dashboard'), mobileLabel: t('Home'), path: '/', icon: DashboardOutlinedIcon, end: true, mobile: true }] };

export const NAV_GROUPS = [
  DASHBOARD_GROUP,
  {
    label: t('Overview'),
    items: [
      { label: t('Reports'), path: '/reports', icon: AssessmentOutlinedIcon, permission: REPORT_PERMISSIONS },
      { label: t('Metal rates'), path: '/rates', icon: ShowChartRoundedIcon, permission: 'rate.view' },
      { label: t('Approvals'), path: '/approvals', icon: FactCheckOutlinedIcon, permission: 'inventory.approve', badge: 'approvals' },
    ],
  },
  {
    label: t('Sales'),
    items: [
      { label: t('New bill'), path: '/billing', icon: PointOfSaleOutlinedIcon, permission: 'sales.create', mobile: true },
      { label: t('Orders'), path: '/orders', icon: AssignmentOutlinedIcon, permission: 'order.view', mobile: true },
      { label: t('Invoices'), path: '/sales', icon: ReceiptOutlinedIcon, permission: 'sales.view' },
      // Old gold taken in exchange on bills, or bought for money.
      { label: t('Old gold'), path: '/old-gold', icon: RecyclingRoundedIcon, permission: 'oldgold.view' },
      { label: t('Customers'), path: '/customers', icon: PeopleAltOutlinedIcon, permission: 'customer.view', mobile: true },
    ],
  },
  {
    // What is in the shop and how it moves.
    label: t('Stock'),
    items: [
      { label: t('Stock summary'), path: '/inventory', icon: Inventory2OutlinedIcon, permission: 'inventory.view', end: true },
      { label: t('Products'), path: '/products', icon: DiamondOutlinedIcon, permission: 'product.view', mobile: true },
      // Metal held by weight (bullion, old gold, scrap) — apart from Products until made into jewellery.
      { label: t('Raw materials'), path: '/inventory/raw-materials', icon: ScaleOutlinedIcon, permission: 'inventory.view' },
      { label: t('Opening stock'), path: '/inventory/opening', icon: PlaylistAddRoundedIcon, permission: 'inventory.view' },
      { label: t('Adjustments'), path: '/inventory/adjustments', icon: RuleRoundedIcon, permission: 'inventory.view' },
      { label: t('Transfers'), path: '/inventory/transfers', icon: SyncAltRoundedIcon, permission: 'inventory.view' },
      { label: t('Stock ledger'), path: '/inventory/ledger', icon: ReceiptLongOutlinedIcon, permission: 'inventory.view' },
    ],
  },
  {
    // Buying: who from, what was ordered, what was billed.
    label: t('Purchase'),
    items: [
      { label: t('Purchases'), path: '/purchases', icon: ShoppingBagOutlinedIcon, permission: 'purchase.view', end: true },
      { label: t('Items'), path: '/items', icon: CategoryOutlinedIcon, permission: 'purchase.view' },
      { label: t('Purchase orders'), path: '/purchases/orders', icon: PendingActionsOutlinedIcon, permission: 'purchase.view' },
      { label: t('Suppliers'), path: '/suppliers', icon: LocalShippingOutlinedIcon, permission: 'supplier.view' },
    ],
  },
  {
    // Money: what the shop spends, and what is left after everything.
    label: t('Accounts'),
    items: [
      { label: t('Profit & loss'), path: '/finance', icon: TrendingUpRoundedIcon, permission: 'report.finance' },
      { label: t('Expenses'), path: '/expenses', icon: AccountBalanceWalletOutlinedIcon, permission: 'expense.view' },
    ],
  },
  {
    label: t('HR & Payroll'),
    items: [
      { label: t('Employees'), path: '/hr/employees', icon: BadgeOutlinedIcon, permission: 'employee.view' },
      { label: t('Attendance'), path: '/hr/attendance', icon: EventAvailableOutlinedIcon, permission: 'attendance.view' },
      { label: t('Salary advances'), path: '/hr/advances', icon: RequestQuoteOutlinedIcon, permission: 'payroll.view' },
      { label: t('Payroll'), path: '/hr/payroll', icon: PaymentsOutlinedIcon, permission: 'payroll.view' },
    ],
  },
  {
    // The business itself and how it is set up.
    label: t('Settings'),
    items: [
      { label: t('Organisation'), path: '/settings/organisation', icon: StorefrontOutlinedIcon, permission: 'organisation.view' },
      { label: t('Branches'), path: '/settings/branches', icon: AccountTreeOutlinedIcon, permission: 'branch.view' },
      { label: t('Business settings'), path: '/settings/business', icon: TuneRoundedIcon, permission: 'settings.view' },
      // A branch's own invoice print design — for people who work in particular branches (the organisation sets its own under Business settings → Print).
      { label: t('Print settings'), path: '/settings/print', icon: PrintOutlinedIcon, permission: 'sales.print', ownBranchesOnly: true },
      { label: t('Product categories'), path: '/settings/categories', icon: CategoryOutlinedIcon, permission: 'category.view' },
      { label: t('Subscription'), path: '/settings/subscription', icon: WorkspacePremiumOutlinedIcon, permission: 'subscription.view' },
    ],
  },
  {
    // The people who use it and what they may do.
    label: t('Users & access'),
    items: [
      { label: t('Roles & permissions'), path: '/settings/roles', icon: AdminPanelSettingsOutlinedIcon, permission: 'role.view' },
      // Activity and Undo history, as two tabs.
      { label: t('Audit log'), path: '/settings/audit-log', icon: HistoryRoundedIcon, permission: ['audit.view', 'undo.view'] },
    ],
  },
];

export const PROFILE_ITEM = { label: t('Profile'), path: '/profile', icon: PersonOutlineRoundedIcon, mobile: true };

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
  { path: '/old-gold', module: 'oldgold' },
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
