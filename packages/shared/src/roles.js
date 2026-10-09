import { ALL_PERMISSIONS, WILDCARD_PERMISSION } from './permissions.js';

const pick = (...prefixes) =>
  ALL_PERMISSIONS.filter((p) => prefixes.some((prefix) => (prefix.endsWith('.') ? p.startsWith(prefix) : p === prefix)));

const viewOnly = ALL_PERMISSIONS.filter((p) => p.endsWith('.view') && !p.startsWith('audit.') && !p.startsWith('subscription.'));

export const ORG_ADMIN_ROLE_KEY = 'org_admin';

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
      'customer.', 'order.', 'repair.', 'loyalty.', 'sales.', 'oldgold.', 'rate.',
      'category.view', 'product.', 'inventory.', 'supplier.view', 'purchase.view', 'purchase.approve',
      'karigar.view', 'karigar.approve', 'employee.', 'attendance.', 'leave.', 'payroll.',
      'expense.view', 'expense.create', 'expense.approve', 'accounts.view', 'accounts.receipt',
      'report.sales', 'report.inventory', 'report.customer', 'report.finance', 'report.karigar', 'report.export', 'ai.use',
    ),
  },
  {
    key: 'sales_manager',
    name: 'Sales Manager',
    description: 'Manages counter sales, discounts, returns, orders and old gold.',
    permissions: pick(
      'dashboard.view', 'customer.', 'order.', 'repair.view', 'repair.create', 'repair.print', 'loyalty.view',
      'sales.', 'oldgold.', 'rate.view', 'category.view', 'product.view', 'product.print', 'inventory.view',
      'accounts.receipt', 'report.sales', 'report.customer', 'report.export',
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
    key: 'purchase_manager',
    name: 'Purchase Manager',
    description: 'Manages suppliers, purchase orders, invoices and returns.',
    permissions: pick(
      'dashboard.view', 'rate.view', 'category.view', 'product.view', 'product.create', 'product.edit', 'product.viewCost',
      'inventory.view', 'supplier.', 'purchase.view', 'purchase.create', 'purchase.edit', 'purchase.cancel', 'purchase.return',
      'purchase.export', 'accounts.payment', 'report.inventory',
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
  {
    key: 'hr_manager',
    name: 'HR Manager',
    description: 'Manages employees, attendance, leave and payroll.',
    permissions: pick('dashboard.view', 'employee.', 'attendance.', 'leave.', 'payroll.'),
  },
  {
    key: 'karigar_manager',
    name: 'Karigar Manager',
    description: 'Manages artisans, job work, metal issue/receipt and repairs.',
    permissions: pick(
      'dashboard.view', 'karigar.view', 'karigar.create', 'karigar.edit', 'karigar.issue', 'karigar.receive', 'karigar.approve',
      'order.view', 'order.edit', 'repair.view', 'repair.edit', 'rate.view', 'product.view', 'inventory.view', 'report.karigar',
    ),
  },
  {
    key: 'staff',
    name: 'Staff',
    description: 'Basic access: view products and rates, mark own attendance, apply for leave.',
    permissions: pick('dashboard.view', 'rate.view', 'product.view', 'customer.view', 'leave.apply'),
  },
  {
    key: 'viewer',
    name: 'Viewer',
    description: 'Read-only access to operational screens.',
    permissions: viewOnly,
  },
];
