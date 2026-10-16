import { hasPermission } from '@jerp/shared';
import { FileAsset } from '../../core/storage/fileAsset.model.js';
import { storage } from '../../core/storage/storage.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { Employee } from '../hr/hr.models.js';
import { accessibleBranchFilter } from '../inventory/inventory.helpers.js';
import { Order } from '../orders/order.model.js';
import { Product } from '../products/product.model.js';
import { Purchase } from '../purchases/purchase.model.js';

/** The record a file belongs to, limited to the branches the user works in (the organisation logo has none). */
const OWNER = {
  product_image: (id) => Product.exists({ 'images.fileId': id, ...accessibleBranchFilter() }),
  order_image: (id) => Order.exists({ 'images.fileId': id, ...accessibleBranchFilter() }),
  employee_photo: (id) => Employee.exists({ photoFileId: id, ...accessibleBranchFilter() }),
  purchase_bill: (id) => Purchase.exists({ 'billImages.fileId': id, ...accessibleBranchFilter() }),
};

const PURPOSE_PERMISSION = { product_image: 'product.view', order_image: 'order.view', employee_photo: 'employee.view', purchase_bill: 'purchase.view', logo: null };

export async function serveFile(req, res) {
  const asset = await FileAsset.findById(req.valid.params.id).lean();
  if (!asset || !(asset.purpose in PURPOSE_PERMISSION)) throw ApiError.notFound('File');
  const required = PURPOSE_PERMISSION[asset.purpose];
  if (required && !hasPermission(req.auth.permissions, required)) throw ApiError.forbidden();
  // A branch-limited user opens only files of their own branches' records.
  if (!req.auth.branchAccess.all && OWNER[asset.purpose] && !(await OWNER[asset.purpose](asset._id))) throw ApiError.notFound('File');
  res.set({ 'Content-Type': asset.mimeType, 'Cache-Control': 'private, max-age=86400, immutable' }).send(await storage.get(asset.key));
}
