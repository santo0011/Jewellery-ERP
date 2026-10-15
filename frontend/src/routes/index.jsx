import { Button } from '@mui/material';
import { createBrowserRouter, Navigate, Link as RouterLink } from 'react-router';
import { EmptyState } from '../components/StateViews.jsx';
import LoginPage from '../features/auth/LoginPage.jsx';
import HomePage from '../features/home/HomePage.jsx';
import { REPORT_PERMISSIONS } from '../layouts/navConfig.js';
import { RequireAdmin } from '../features/platform/adminGuards.jsx';
import AppLayout from '../layouts/AppLayout.jsx';
import AuthLayout from '../layouts/AuthLayout.jsx';
import { GuestOnly, RequireAuth, RequirePermission } from './guards.jsx';
import { lazyPage } from './lazyPage.jsx';

// Pages load when first opened (smaller first load, faster start — on a phone too).
const ForgotPasswordPage = lazyPage(() => import('../features/auth/ForgotPasswordPage.jsx'));
const RegisterPage = lazyPage(() => import('../features/auth/RegisterPage.jsx'));
const ResetPasswordPage = lazyPage(() => import('../features/auth/ResetPasswordPage.jsx'));
const BranchesPage = lazyPage(() => import('../features/branches/BranchesPage.jsx'));
const ProfilePage = lazyPage(() => import('../features/profile/ProfilePage.jsx'));
const RoleEditorPage = lazyPage(() => import('../features/roles/RoleEditorPage.jsx'));
const RolesPage = lazyPage(() => import('../features/roles/RolesPage.jsx'));
const OrganisationPage = lazyPage(() => import('../features/settings/OrganisationPage.jsx'));
const AuditLogPage = lazyPage(() => import('../features/audit/AuditLogPage.jsx'));
const BusinessSettingsPage = lazyPage(() => import('../features/settings/BusinessSettingsPage.jsx'));
const PrintSettingsPage = lazyPage(() => import('../features/settings/PrintSettingsPage.jsx'));
const UsersPage = lazyPage(() => import('../features/users/UsersPage.jsx'));
const CategoriesPage = lazyPage(() => import('../features/categories/CategoriesPage.jsx'));
const CustomerDetailPage = lazyPage(() => import('../features/customers/CustomerDetailPage.jsx'));
const CustomersPage = lazyPage(() => import('../features/customers/CustomersPage.jsx'));
const ProductDetailPage = lazyPage(() => import('../features/products/ProductDetailPage.jsx'));
const ProductFormPage = lazyPage(() => import('../features/products/ProductFormPage.jsx'));
const ProductsPage = lazyPage(() => import('../features/products/ProductsPage.jsx'));
const SupplierDetailPage = lazyPage(() => import('../features/suppliers/SupplierDetailPage.jsx'));
const SuppliersPage = lazyPage(() => import('../features/suppliers/SuppliersPage.jsx'));
const ApprovalsPage = lazyPage(() => import('../features/approvals/ApprovalsPage.jsx'));
const StockEntriesPage = lazyPage(() => import('../features/inventory/StockEntriesPage.jsx'));
const StockLedgerPage = lazyPage(() => import('../features/inventory/StockLedgerPage.jsx'));
const StockSummaryPage = lazyPage(() => import('../features/inventory/StockSummaryPage.jsx'));
const TransfersPage = lazyPage(() => import('../features/inventory/TransfersPage.jsx'));
const PurchaseDetailPage = lazyPage(() => import('../features/purchases/PurchaseDetailPage.jsx'));
const PurchaseFormPage = lazyPage(() => import('../features/purchases/PurchaseFormPage.jsx'));
const PurchaseOrderDetailPage = lazyPage(() => import('../features/purchases/PurchaseOrderDetailPage.jsx'));
const PurchaseOrdersPage = lazyPage(() => import('../features/purchases/PurchaseOrdersPage.jsx'));
const PurchasesPage = lazyPage(() => import('../features/purchases/PurchasesPage.jsx'));
const ItemsPage = lazyPage(() => import('../features/items/ItemsPage.jsx'));
const SubscriptionPage = lazyPage(() => import('../features/billing/SubscriptionPage.jsx'));
const RatesPage = lazyPage(() => import('../features/rates/RatesPage.jsx'));
const OrderDetailPage = lazyPage(() => import('../features/orders/OrderDetailPage.jsx'));
const OrderFormPage = lazyPage(() => import('../features/orders/OrderFormPage.jsx'));
const OrdersPage = lazyPage(() => import('../features/orders/OrdersPage.jsx'));
const BillingPage = lazyPage(() => import('../features/sales/BillingPage.jsx'));
const AdvancesPage = lazyPage(() => import('../features/hr/AdvancesPage.jsx'));
const AttendancePage = lazyPage(() => import('../features/hr/AttendancePage.jsx'));
const EmployeeDetailPage = lazyPage(() => import('../features/hr/EmployeeDetailPage.jsx'));
const EmployeesPage = lazyPage(() => import('../features/hr/EmployeesPage.jsx'));
const PayrollPage = lazyPage(() => import('../features/hr/PayrollPage.jsx'));
const PayrollRunPage = lazyPage(() => import('../features/hr/PayrollRunPage.jsx'));
const PayslipPage = lazyPage(() => import('../features/hr/PayslipPage.jsx'));
const ReportsPage = lazyPage(() => import('../features/reports/ReportsPage.jsx'));
const ReportViewPage = lazyPage(() => import('../features/reports/ReportViewPage.jsx'));
const InvoicePage = lazyPage(() => import('../features/sales/InvoicePage.jsx'));
const InvoicesPage = lazyPage(() => import('../features/sales/InvoicesPage.jsx'));
const EmailSettingsPage = lazyPage(() => import('../features/platform/EmailSettingsPage.jsx'));
const AdminLayout = lazyPage(() => import('../features/platform/AdminLayout.jsx'));
const AdminOrganisationDetailPage = lazyPage(() => import('../features/platform/AdminOrganisationDetailPage.jsx'));
const AdminOrganisationsPage = lazyPage(() => import('../features/platform/AdminOrganisationsPage.jsx'));
const AdminDashboardPage = lazyPage(() => import('../features/platform/AdminDashboardPage.jsx'));
const PlansPage = lazyPage(() => import('../features/platform/PlansPage.jsx'));
const PaymentsPage = lazyPage(() => import('../features/platform/PaymentsPage.jsx'));
const AdminProfilePage = lazyPage(() => import('../features/platform/AdminProfilePage.jsx'));
const AdminReportsPage = lazyPage(() => import('../features/platform/AdminReportsPage.jsx'));
const AdminReportViewPage = lazyPage(() => import('../features/platform/AdminReportViewPage.jsx'));

const guard = (perm, element) => <RequirePermission perm={perm}>{element}</RequirePermission>;

function NotFound() {
  return (
    <EmptyState
      title="Page not found"
      description="The page you are looking for does not exist or has moved."
      action={
        <Button component={RouterLink} to="/" variant="contained">
          Go home
        </Button>
      }
    />
  );
}

export const router = createBrowserRouter([
  {
    element: <GuestOnly />,
    children: [
      {
        element: <AuthLayout />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
          { path: '/forgot-password', element: <ForgotPasswordPage /> },
        ],
      },
    ],
  },
  { element: <AuthLayout />, children: [{ path: '/reset-password', element: <ResetPasswordPage /> }] },
  { path: '/admin/login', element: <Navigate to="/login" replace /> },
  {
    path: '/admin',
    element: <RequireAdmin />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          { index: true, element: <AdminDashboardPage /> },
          { path: 'organisations', element: <AdminOrganisationsPage /> },
          { path: 'organisations/:id', element: <AdminOrganisationDetailPage /> },
          { path: 'plans', element: <PlansPage /> },
          { path: 'payments', element: <PaymentsPage /> },
          { path: 'reports', element: <AdminReportsPage /> },
          { path: 'profile', element: <AdminProfilePage /> },
          { path: 'reports/:key', element: <AdminReportViewPage /> },
          { path: 'settings/email', element: <EmailSettingsPage /> },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'profile', element: <ProfilePage /> },
          { path: 'settings/organisation', element: guard('organisation.view', <OrganisationPage />) },
          { path: 'settings/branches', element: guard('branch.view', <BranchesPage />) },
          { path: 'settings/business', element: guard('settings.view', <BusinessSettingsPage />) },
          { path: 'settings/print', element: guard('settings.view', <PrintSettingsPage />) },
          { path: 'settings/categories', element: guard('category.view', <CategoriesPage />) },
          { path: 'settings/subscription', element: guard('subscription.view', <SubscriptionPage />) },
          { path: 'settings/users', element: guard('user.view', <UsersPage />) },
          { path: 'settings/roles', element: guard('role.view', <RolesPage />) },
          { path: 'settings/roles/new', element: guard('role.create', <RoleEditorPage />) },
          { path: 'settings/roles/:id', element: guard('role.view', <RoleEditorPage />) },
          { path: 'settings/audit-log', element: guard('audit.view', <AuditLogPage />) },
          { path: 'categories', element: <Navigate to="/settings/categories" replace /> },
          { path: 'customers', element: guard('customer.view', <CustomersPage />) },
          { path: 'customers/:id', element: guard('customer.view', <CustomerDetailPage />) },
          { path: 'suppliers', element: guard('supplier.view', <SuppliersPage />) },
          { path: 'suppliers/:id', element: guard('supplier.view', <SupplierDetailPage />) },
          { path: 'products', element: guard('product.view', <ProductsPage />) },
          { path: 'products/new', element: guard('product.create', <ProductFormPage key="new" />) },
          { path: 'products/:id', element: guard('product.view', <ProductDetailPage />) },
          { path: 'products/:id/edit', element: guard('product.edit', <ProductFormPage key="edit" />) },
          { path: 'rates', element: guard('rate.view', <RatesPage />) },
          { path: 'billing', element: guard('sales.create', <BillingPage />) },
          { path: 'sales', element: guard('sales.view', <InvoicesPage />) },
          { path: 'sales/:id', element: guard('sales.view', <InvoicePage />) },
          { path: 'orders', element: guard('order.view', <OrdersPage />) },
          { path: 'orders/new', element: guard('order.create', <OrderFormPage />) },
          { path: 'orders/:id', element: guard('order.view', <OrderDetailPage />) },
          { path: 'orders/:id/edit', element: guard('order.edit', <OrderFormPage />) },
          { path: 'approvals', element: guard('inventory.approve', <ApprovalsPage />) },
          { path: 'inventory', element: guard('inventory.view', <StockSummaryPage />) },
          { path: 'inventory/opening', element: guard('inventory.view', <StockEntriesPage key="opening" mode="opening" />) },
          { path: 'inventory/adjustments', element: guard('inventory.view', <StockEntriesPage key="adjustment" mode="adjustment" />) },
          { path: 'inventory/transfers', element: guard('inventory.view', <TransfersPage />) },
          { path: 'inventory/ledger', element: guard('inventory.view', <StockLedgerPage />) },
          { path: 'items', element: guard('purchase.view', <ItemsPage />) },
          { path: 'purchases', element: guard('purchase.view', <PurchasesPage />) },
          { path: 'purchases/new', element: guard('purchase.create', <PurchaseFormPage />) },
          { path: 'purchases/orders', element: guard('purchase.view', <PurchaseOrdersPage />) },
          { path: 'purchases/orders/:id', element: guard('purchase.view', <PurchaseOrderDetailPage />) },
          { path: 'purchases/:id', element: guard('purchase.view', <PurchaseDetailPage />) },
          { path: 'hr/employees', element: guard('employee.view', <EmployeesPage />) },
          { path: 'hr/employees/:id', element: guard('employee.view', <EmployeeDetailPage />) },
          { path: 'hr/attendance', element: guard('attendance.view', <AttendancePage />) },
          { path: 'hr/advances', element: guard('payroll.view', <AdvancesPage />) },
          { path: 'hr/payroll', element: guard('payroll.view', <PayrollPage />) },
          { path: 'hr/payroll/:id', element: guard('payroll.view', <PayrollRunPage />) },
          { path: 'hr/payroll/:id/payslip/:employeeId', element: guard('payroll.view', <PayslipPage />) },
          { path: 'reports', element: guard(REPORT_PERMISSIONS, <ReportsPage />) },
          { path: 'reports/:key', element: guard(REPORT_PERMISSIONS, <ReportViewPage />) },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
]);
