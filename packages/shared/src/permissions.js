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

export const WILDCARD_PERMISSION = '*';

export const isValidPermission = (key) => key === WILDCARD_PERMISSION || PERMISSION_SET.has(key);

export function hasPermission(granted, required) {
  if (!granted) return false;
  const set = granted instanceof Set ? granted : new Set(granted);
  return set.has(WILDCARD_PERMISSION) || set.has(required);
}

export const hasAnyPermission = (granted, required) => required.some((p) => hasPermission(granted, p));

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
