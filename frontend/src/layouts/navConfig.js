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
import TuneRoundedIcon from '@mui/icons-material/TuneRounded';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';

/** Anyone with at least one of these sees Reports (each report checks its own permission). */
export const REPORT_PERMISSIONS = ['report.sales', 'report.inventory', 'report.customer', 'report.finance', 'payroll.view', 'attendance.view'];

/** Always first and never folded away: a `pinned` group renders without a collapsible header. */
export const DASHBOARD_GROUP = { label: 'Dashboard', pinned: true, items: [{ label: 'Dashboard', path: '/', icon: DashboardOutlinedIcon, end: true, mobile: true }] };

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
      { label: 'Items', path: '/items', icon: CategoryOutlinedIcon, permission: ['purchase.view', 'product.view'] },
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

const item = (path) => NAV_GROUPS.flatMap((g) => g.items).find((i) => i.path === path);

/** A branch's own login runs the counter, its stock, its staff and payroll, and its reports — nothing organisation-wide. */
export const BRANCH_NAV_GROUPS = [
  DASHBOARD_GROUP,
  { label: 'Overview', items: [item('/reports'), item('/rates')] },
  { label: 'Sales', items: [item('/billing'), item('/orders'), item('/sales'), item('/customers')] },
  { label: 'Stock', items: [item('/inventory'), item('/products'), item('/inventory/transfers')] },
  { label: 'HR & Payroll', items: [item('/hr/employees'), item('/hr/attendance'), item('/hr/advances'), item('/hr/payroll')] },
];

export function visibleNav(permissions, { branchLogin = false } = {}) {
  return (branchLogin ? BRANCH_NAV_GROUPS : NAV_GROUPS).map((g) => ({ ...g, items: g.items.filter((i) => !i.permission || [].concat(i.permission).some((p) => permissions.has(p))) })).filter((g) => g.items.length);
}
