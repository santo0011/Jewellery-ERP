import { hasPermission } from '@jerp/shared';
import { FileAsset } from '../../core/storage/fileAsset.model.js';
import { storage } from '../../core/storage/storage.service.js';
import { ApiError } from '../../utils/ApiError.js';

const PURPOSE_PERMISSION = { product_image: 'product.view', order_image: 'order.view', employee_photo: 'employee.view', logo: null };

export async function serveFile(req, res) {
  const asset = await FileAsset.findById(req.valid.params.id).lean();
  if (!asset || !(asset.purpose in PURPOSE_PERMISSION)) throw ApiError.notFound('File');
  const required = PURPOSE_PERMISSION[asset.purpose];
  if (required && !hasPermission(req.auth.permissions, required)) throw ApiError.forbidden();
  res.set({ 'Content-Type': asset.mimeType, 'Cache-Control': 'private, max-age=86400, immutable' }).send(await storage.get(asset.key));
}
