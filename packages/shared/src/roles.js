import { ALL_PERMISSIONS, isOrganisationLevel, WILDCARD_PERMISSION } from './permissions.js';

const pick = (...prefixes) =>
  ALL_PERMISSIONS.filter((p) => prefixes.some((prefix) => (prefix.endsWith('.') ? p.startsWith(prefix) : p === prefix)));

export const ORG_ADMIN_ROLE_KEY = 'org_admin';

/**
 * Branch Manager is a branch role: it runs one branch (or a few), never the organisation. It cannot hold any
 * organisation-level permission, and whoever has it works in particular branches, not "all branches".
 * Branch logins get this role.
 */
export const BRANCH_MANAGER_ROLE_KEY = 'branch_manager';
export const BRANCH_ROLE_KEYS = Object.freeze([BRANCH_MANAGER_ROLE_KEY]);
export const isBranchRole = (key) => BRANCH_ROLE_KEYS.includes(key);
/** Organisation-level permissions, which a branch role may never hold. */
export const ORGANISATION_LEVEL_PERMISSIONS = Object.freeze(ALL_PERMISSIONS.filter(isOrganisationLevel));

/**
 * The roles every new organisation starts with. Except Organisation Admin (always full access), their permissions
 * can be edited; more roles can be added, or duplicated from these, on the Roles page.
 */
export const SYSTEM_ROLE_TEMPLATES = [
  {
    key: ORG_ADMIN_ROLE_KEY,
    name: 'Organisation Admin',
    description: 'Full access to everything in this organisation.',
    permissions: [WILDCARD_PERMISSION],
  },
  {
    key: BRANCH_MANAGER_ROLE_KEY,
    name: 'Branch Manager',
    description: 'Runs a branch: sales, stock, orders, staff, payroll, reports and approvals.',
    // Nothing organisation-level (branches, users, settings…): see BRANCH_ROLE_KEYS.
    permissions: pick(
      'dashboard.',
      'customer.', 'order.', 'repair.', 'loyalty.', 'sales.', 'oldgold.', 'rate.view',
      'category.view', 'product.', 'inventory.', 'supplier.view', 'purchase.view', 'purchase.approve',
      'karigar.view', 'karigar.approve', 'employee.', 'attendance.', 'leave.', 'payroll.',
      'expense.view', 'expense.create', 'expense.approve', 'accounts.view', 'accounts.receipt',
      'report.sales', 'report.inventory', 'report.customer', 'report.finance', 'report.karigar', 'report.export', 'ai.use',
    ),
  },
  {
    key: 'sales_staff',
    name: 'Sales Staff',
    description: 'Creates sales, estimates and customer records at the counter.',
    permissions: pick(
      'dashboard.view', 'customer.view', 'customer.create', 'customer.edit', 'order.view', 'order.create', 'order.print',
      'repair.view', 'repair.create', 'repair.print', 'sales.view', 'sales.create', 'sales.print',
      'oldgold.view', 'oldgold.create', 'oldgold.print', 'rate.view', 'category.view', 'product.view', 'inventory.view',
      'accounts.receipt',
    ),
  },
  {
    key: 'inventory_manager',
    name: 'Inventory Manager',
    description: 'Manages products, tagging, labels, stock adjustments and transfers.',
    permissions: pick(
      'dashboard.view', 'rate.', 'category.', 'product.', 'inventory.', 'supplier.view', 'purchase.view',
      'karigar.view', 'karigar.issue', 'karigar.receive', 'report.inventory', 'report.export',
    ),
  },
  {
    key: 'accountant',
    name: 'Accountant',
    description: 'Records receipts, payments, expenses and journals; views financial reports.',
    permissions: pick(
      'dashboard.', 'customer.view', 'supplier.view', 'karigar.view', 'karigar.pay', 'sales.view', 'sales.export',
      'purchase.view', 'purchase.export', 'product.viewCost', 'expense.', 'accounts.', 'payroll.view',
      'report.finance', 'report.sales', 'report.customer', 'report.export',
    ),
  },
];
