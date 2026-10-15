import { ALL_PERMISSIONS, WILDCARD_PERMISSION } from './permissions.js';

const pick = (...prefixes) =>
  ALL_PERMISSIONS.filter((p) => prefixes.some((prefix) => (prefix.endsWith('.') ? p.startsWith(prefix) : p === prefix)));

export const ORG_ADMIN_ROLE_KEY = 'org_admin';

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
    key: 'branch_manager',
    name: 'Branch Manager',
    description: 'Runs a branch: sales, stock, orders, staff, payroll, reports and approvals.',
    permissions: pick(
      'dashboard.', 'branch.view', 'user.view', 'settings.view',
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
