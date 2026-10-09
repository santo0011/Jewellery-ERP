import { Button } from '@mui/material';
import { createBrowserRouter, Navigate, Link as RouterLink } from 'react-router';
import { EmptyState } from '../components/StateViews.jsx';
import ForgotPasswordPage from '../features/auth/ForgotPasswordPage.jsx';
import LoginPage from '../features/auth/LoginPage.jsx';
import RegisterPage from '../features/auth/RegisterPage.jsx';
import ResetPasswordPage from '../features/auth/ResetPasswordPage.jsx';
import BranchesPage from '../features/branches/BranchesPage.jsx';
import HomePage from '../features/home/HomePage.jsx';
import ProfilePage from '../features/profile/ProfilePage.jsx';
import RoleEditorPage from '../features/roles/RoleEditorPage.jsx';
import RolesPage from '../features/roles/RolesPage.jsx';
import OrganisationPage from '../features/settings/OrganisationPage.jsx';
import AuditLogPage from '../features/audit/AuditLogPage.jsx';
import BusinessSettingsPage from '../features/settings/BusinessSettingsPage.jsx';
import UsersPage from '../features/users/UsersPage.jsx';
import CategoriesPage from '../features/categories/CategoriesPage.jsx';
import CustomerDetailPage from '../features/customers/CustomerDetailPage.jsx';
import CustomersPage from '../features/customers/CustomersPage.jsx';
import ProductDetailPage from '../features/products/ProductDetailPage.jsx';
import ProductFormPage from '../features/products/ProductFormPage.jsx';
import ProductsPage from '../features/products/ProductsPage.jsx';
import SupplierDetailPage from '../features/suppliers/SupplierDetailPage.jsx';
import SuppliersPage from '../features/suppliers/SuppliersPage.jsx';
import ApprovalsPage from '../features/approvals/ApprovalsPage.jsx';
import StockEntriesPage from '../features/inventory/StockEntriesPage.jsx';
import StockLedgerPage from '../features/inventory/StockLedgerPage.jsx';
import StockSummaryPage from '../features/inventory/StockSummaryPage.jsx';
import TransfersPage from '../features/inventory/TransfersPage.jsx';
import PurchaseDetailPage from '../features/purchases/PurchaseDetailPage.jsx';
import PurchaseFormPage from '../features/purchases/PurchaseFormPage.jsx';
import PurchaseOrderDetailPage from '../features/purchases/PurchaseOrderDetailPage.jsx';
import PurchaseOrdersPage from '../features/purchases/PurchaseOrdersPage.jsx';
import PurchasesPage from '../features/purchases/PurchasesPage.jsx';
import ItemsPage from '../features/items/ItemsPage.jsx';
import SubscriptionPage from '../features/billing/SubscriptionPage.jsx';
import RatesPage from '../features/rates/RatesPage.jsx';
import OrderDetailPage from '../features/orders/OrderDetailPage.jsx';
import OrderFormPage from '../features/orders/OrderFormPage.jsx';
import OrdersPage from '../features/orders/OrdersPage.jsx';
import BillingPage from '../features/sales/BillingPage.jsx';
import AdvancesPage from '../features/hr/AdvancesPage.jsx';
import AttendancePage from '../features/hr/AttendancePage.jsx';
import EmployeeDetailPage from '../features/hr/EmployeeDetailPage.jsx';
import EmployeesPage from '../features/hr/EmployeesPage.jsx';
import PayrollPage from '../features/hr/PayrollPage.jsx';
import PayrollRunPage from '../features/hr/PayrollRunPage.jsx';
import PayslipPage from '../features/hr/PayslipPage.jsx';
import ReportsPage from '../features/reports/ReportsPage.jsx';
import ReportViewPage from '../features/reports/ReportViewPage.jsx';
import { REPORT_PERMISSIONS } from '../layouts/navConfig.js';
import InvoicePage from '../features/sales/InvoicePage.jsx';
import InvoicesPage from '../features/sales/InvoicesPage.jsx';
import { RequireAdmin } from '../features/platform/adminGuards.jsx';
import AdminLayout from '../features/platform/AdminLayout.jsx';
import AdminOrganisationDetailPage from '../features/platform/AdminOrganisationDetailPage.jsx';
import AdminOrganisationsPage from '../features/platform/AdminOrganisationsPage.jsx';
import AdminDashboardPage from '../features/platform/AdminDashboardPage.jsx';
import PlansPage from '../features/platform/PlansPage.jsx';
import PaymentsPage from '../features/platform/PaymentsPage.jsx';
import AppLayout from '../layouts/AppLayout.jsx';
import AuthLayout from '../layouts/AuthLayout.jsx';
import { GuestOnly, RequireAuth, RequirePermission } from './guards.jsx';

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
          { path: 'approvals', element: guard('inventory.approve', <ApprovalsPage />) },
          { path: 'inventory', element: guard('inventory.view', <StockSummaryPage />) },
          { path: 'inventory/opening', element: guard('inventory.view', <StockEntriesPage key="opening" mode="opening" />) },
          { path: 'inventory/adjustments', element: guard('inventory.view', <StockEntriesPage key="adjustment" mode="adjustment" />) },
          { path: 'inventory/transfers', element: guard('inventory.view', <TransfersPage />) },
          { path: 'inventory/ledger', element: guard('inventory.view', <StockLedgerPage />) },
          { path: 'items', element: guard(['purchase.view', 'product.view'], <ItemsPage />) },
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
