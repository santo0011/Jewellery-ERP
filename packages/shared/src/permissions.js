export const PERMISSION_MODULES = [
  { key: 'dashboard', label: 'Dashboard', group: 'Overview', actions: { view: 'View dashboard', viewFinancials: 'View financial figures' } },
  { key: 'organisation', label: 'Organisation', group: 'Administration', actions: { view: 'View', edit: 'Edit' } },
  { key: 'branch', label: 'Branches', group: 'Administration', actions: { view: 'View', create: 'Create', edit: 'Edit', delete: 'Deactivate', viewAll: 'View all branches' } },
  { key: 'user', label: 'Users', group: 'Administration', actions: { view: 'View', create: 'Create', edit: 'Edit', delete: 'Deactivate' } },
  { key: 'role', label: 'Roles', group: 'Administration', actions: { view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete' } },
  { key: 'settings', label: 'Settings', group: 'Administration', actions: { view: 'View', edit: 'Edit' } },
  { key: 'audit', label: 'Audit log', group: 'Administration', actions: { view: 'View' } },
  { key: 'subscription', label: 'Subscription', group: 'Administration', actions: { view: 'View', manage: 'Manage' } },
  { key: 'customer', label: 'Customers', group: 'Customers', actions: { view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete', export: 'Export', viewKyc: 'View KYC details' } },
  { key: 'order', label: 'Customer orders', group: 'Customers', actions: { view: 'View', create: 'Create', edit: 'Edit', cancel: 'Cancel', approve: 'Approve', print: 'Print' } },
  { key: 'repair', label: 'Repairs', group: 'Customers', actions: { view: 'View', create: 'Create', edit: 'Edit', cancel: 'Cancel', print: 'Print' } },
  { key: 'loyalty', label: 'Loyalty', group: 'Customers', actions: { view: 'View', manage: 'Manage' } },
  { key: 'sales', label: 'Sales', group: 'Sales', actions: { view: 'View', create: 'Create', edit: 'Edit draft', cancel: 'Cancel', return: 'Return', print: 'Print', discount: 'Give discount', approve: 'Approve', export: 'Export' } },
  { key: 'oldgold', label: 'Old gold', group: 'Sales', actions: { view: 'View', create: 'Create', approve: 'Approve', print: 'Print' } },
  { key: 'rate', label: 'Metal rates', group: 'Inventory', actions: { view: 'View', create: 'Update rates' } },
  { key: 'category', label: 'Categories', group: 'Inventory', actions: { view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete' } },
  { key: 'product', label: 'Products', group: 'Inventory', actions: { view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete', export: 'Export', print: 'Print labels', viewCost: 'View cost price' } },
  { key: 'inventory', label: 'Inventory', group: 'Inventory', actions: { view: 'View', adjust: 'Adjust stock', transfer: 'Transfer stock', approve: 'Approve', export: 'Export' } },
  { key: 'supplier', label: 'Suppliers', group: 'Purchase', actions: { view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete', export: 'Export' } },
  { key: 'purchase', label: 'Purchases', group: 'Purchase', actions: { view: 'View', create: 'Create', edit: 'Edit', cancel: 'Cancel', return: 'Return', approve: 'Approve', export: 'Export' } },
  { key: 'karigar', label: 'Karigars', group: 'Karigar', actions: { view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete', issue: 'Issue metal', receive: 'Receive work', approve: 'Approve', pay: 'Pay' } },
  { key: 'employee', label: 'Employees', group: 'Staff', actions: { view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete' } },
  { key: 'attendance', label: 'Attendance', group: 'Staff', actions: { view: 'View', mark: 'Mark', edit: 'Edit' } },
  { key: 'leave', label: 'Leave', group: 'Staff', actions: { view: 'View', apply: 'Apply', approve: 'Approve' } },
  { key: 'payroll', label: 'Payroll', group: 'Staff', actions: { view: 'View', process: 'Process', approve: 'Approve' } },
  { key: 'expense', label: 'Expenses', group: 'Accounts', actions: { view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete', approve: 'Approve' } },
  { key: 'accounts', label: 'Accounts', group: 'Accounts', actions: { view: 'View', receipt: 'Record receipts', payment: 'Record payments', journal: 'Journal entries', export: 'Export' } },
  { key: 'report', label: 'Reports', group: 'Reports', actions: { sales: 'Sales reports', inventory: 'Inventory reports', customer: 'Customer reports', karigar: 'Karigar reports', finance: 'Finance reports', export: 'Export' } },
  { key: 'ai', label: 'AI assistant', group: 'Reports', actions: { use: 'Use assistant' } },
];

export const ALL_PERMISSIONS = Object.freeze(
  PERMISSION_MODULES.flatMap((m) => Object.keys(m.actions).map((a) => `${m.key}.${a}`)),
);

const PERMISSION_SET = new Set(ALL_PERMISSIONS);

/**
 * Permissions for features that are not built yet. They stay valid (a role may already hold them, and they will
 * matter once the feature arrives) but the role editor does not offer them: ticking them would change nothing today.
 */
const UPCOMING = new Set([
  ...['repair', 'loyalty', 'oldgold', 'karigar', 'leave', 'ai'].flatMap((mod) => ALL_PERMISSIONS.filter((p) => p.startsWith(`${mod}.`))),
  'branch.viewAll',
  'expense.approve',
  'customer.export',
  'order.approve', 'order.print',
  'sales.edit', 'sales.approve', 'sales.export',
  'product.export', 'product.print',
  'inventory.export',
  'supplier.export',
  'purchase.return', 'purchase.approve', 'purchase.export',
  'accounts.view', 'accounts.payment', 'accounts.journal', 'accounts.export',
  'report.karigar',
]);

export const isUpcomingPermission = (key) => UPCOMING.has(key);

/** What the role editor offers: every permission that does something in the app today. */
export const AVAILABLE_PERMISSIONS = Object.freeze(ALL_PERMISSIONS.filter((p) => !UPCOMING.has(p)));

export const WILDCARD_PERMISSION = '*';

export const isValidPermission = (key) => key === WILDCARD_PERMISSION || PERMISSION_SET.has(key);

export function hasPermission(granted, required) {
  if (!granted) return false;
  const set = granted instanceof Set ? granted : new Set(granted);
  return set.has(WILDCARD_PERMISSION) || set.has(required);
}

export const hasAnyPermission = (granted, required) => required.some((p) => hasPermission(granted, p));

/**
 * Who may read a module's records as a lookup (search and pick). Pages use other modules' records: a bill picks a
 * customer and products at today's rates, a purchase picks a supplier and pieces, an order picks a customer and a
 * category, an advance picks an employee. Holding the page's permission is enough — the role does not also need
 * the other module's View. Changing or deleting those records still needs that module's own permissions.
 */
export const LOOKUP_ACCESS = Object.freeze({
  customer: ['customer.view', 'sales.create', 'order.create', 'order.edit'],
  customerDues: ['customer.view', 'sales.create', 'accounts.receipt'],
  product: ['product.view', 'sales.create', 'inventory.view', 'inventory.adjust', 'inventory.transfer', 'purchase.create'],
  rate: ['rate.view', 'sales.create'],
  supplier: ['supplier.view', 'purchase.view', 'purchase.create', 'product.create', 'product.edit'],
  category: ['category.view', 'product.view', 'order.create', 'order.edit', 'inventory.adjust', 'purchase.create'],
  order: ['order.view', 'order.edit', 'sales.create'],
  employee: ['employee.view', 'payroll.process'],
});

export function expandPermissions(granted) {
  const set = new Set(granted);
  return set.has(WILDCARD_PERMISSION) ? [...ALL_PERMISSIONS] : ALL_PERMISSIONS.filter((p) => set.has(p));
}

/** Modules an organisation can switch on or off per branch. Everything else is organisation-level. */
export const BRANCH_SCOPED_MODULES = Object.freeze([
  'customer', 'order', 'repair', 'loyalty', 'sales', 'oldgold', 'product', 'inventory',
  'supplier', 'purchase', 'karigar', 'employee', 'attendance', 'leave', 'payroll', 'expense', 'accounts', 'report',
]);

const BRANCH_SCOPED = new Set(BRANCH_SCOPED_MODULES);

export const isBranchScoped = (permission) => BRANCH_SCOPED.has(permission.split('.')[0]);

/**
 * Organisation-level permissions: running the organisation itself (its details, branches, users, roles, settings,
 * audit log, subscription) and changing what every branch shares (categories, metal rates). Only people with access
 * to all branches get them — someone who works in particular branches (a branch login included) never does, whatever
 * their role says. The server drops them from such a user's permissions, so menus, pages and APIs all follow.
 */
export const ORGANISATION_MODULES = Object.freeze(['organisation', 'branch', 'user', 'role', 'settings', 'audit', 'subscription']);
const ORG_ONLY_ACTIONS = new Set(['category.create', 'category.edit', 'category.delete', 'rate.create']);
const ORG_MODULE_SET = new Set(ORGANISATION_MODULES);

export const isOrganisationLevel = (permission) => ORG_MODULE_SET.has(permission.split('.')[0]) || ORG_ONLY_ACTIONS.has(permission);

/** A user's permissions as they apply: branch-limited users lose the organisation-level ones. */
export const withinBranchAccess = (permissions, allBranches) => (allBranches ? permissions : permissions.filter((p) => !isOrganisationLevel(p)));

export const BRANCH_PERMISSIONS = Object.freeze(ALL_PERMISSIONS.filter(isBranchScoped));

/**
 * Effective permissions = role permissions, with branch-scoped ones limited to what the active branch allows.
 * branchAllowed null/undefined means the branch allows everything.
 */
export function effectivePermissions(rolePermissions, branchAllowed) {
  const granted = expandPermissions(rolePermissions);
  if (!branchAllowed) return granted;
  const allowed = new Set(branchAllowed);
  return granted.filter((p) => !isBranchScoped(p) || allowed.has(p));
}
