import { Router } from 'express';
import mongoose from 'mongoose';
import authRoutes from '../modules/auth/auth.routes.js';
import branchRoutes from '../modules/branches/branch.routes.js';
import organisationRoutes from '../modules/organisations/organisation.routes.js';
import roleRoutes from '../modules/roles/role.routes.js';
import settingsRoutes from '../modules/settings/settings.routes.js';
import userRoutes from '../modules/users/user.routes.js';
import auditRoutes from '../modules/audit/audit.routes.js';
import categoryRoutes from '../modules/categories/category.routes.js';
import customerRoutes from '../modules/customers/customer.routes.js';
import fileRoutes from '../modules/files/file.routes.js';
import productRoutes from '../modules/products/product.routes.js';
import supplierRoutes from '../modules/suppliers/supplier.routes.js';
import approvalRoutes from '../modules/approvals/approval.routes.js';
import inventoryRoutes from '../modules/inventory/inventory.routes.js';
import rateRoutes from '../modules/rates/rate.routes.js';
import saleRoutes from '../modules/sales/sale.routes.js';
import orderRoutes from '../modules/orders/order.routes.js';
import dashboardRoutes from '../modules/dashboard/dashboard.routes.js';
import hrRoutes from '../modules/hr/hr.routes.js';
import reportRoutes from '../modules/reports/report.routes.js';
import platformRoutes from '../modules/platform/platform.routes.js';
import { env } from '../config/env.js';
import { sendOk } from '../utils/response.js';

const router = Router();

router.get('/health', (req, res) => {
  sendOk(res, { status: 'ok', db: mongoose.connection.readyState === 1 ? 'up' : 'down', time: new Date().toISOString() });
});

router.get('/auth/config', (req, res) => sendOk(res, { publicSignup: env.ALLOW_PUBLIC_SIGNUP }));
router.use('/platform', platformRoutes);
router.use('/auth', authRoutes);
router.use('/organisation', organisationRoutes);
router.use('/branches', branchRoutes);
router.use('/roles', roleRoutes);
router.use('/users', userRoutes);
router.use('/settings', settingsRoutes);
router.use('/audit-logs', auditRoutes);
router.use('/customers', customerRoutes);
router.use('/suppliers', supplierRoutes);
router.use('/categories', categoryRoutes);
router.use('/products', productRoutes);
router.use('/files', fileRoutes);
router.use('/rates', rateRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/approvals', approvalRoutes);
router.use('/sales', saleRoutes);
router.use('/orders', orderRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/hr', hrRoutes);
router.use('/reports', reportRoutes);

export default router;
