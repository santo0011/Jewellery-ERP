import { Router } from 'express';
import { advanceSchema, idParamsSchema, objectIdSchema, orderCancelSchema, orderEstimateSchema, orderFinishSchema, orderItemParamsSchema, orderListQuerySchema, orderSchema, orderStatusSchema } from '@jerp/shared/schemas';
import { authenticate } from '../../middleware/authenticate.js';
import { z } from 'zod';
import { authorize } from '../../middleware/authorize.js';
import { singleImageUpload } from '../../middleware/upload.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './order.controller.js';

const router = Router();

router.use(authenticate);
router.get('/', authorize('order.view'), validate({ query: orderListQuerySchema }), controller.list);
router.post('/', authorize('order.create'), validate({ body: orderSchema }), controller.create);
router.post('/estimate', authorize('order.create'), validate({ body: orderEstimateSchema }), controller.estimate);
router.get('/:id', authorize('order.view'), validate({ params: idParamsSchema }), controller.get);
router.post('/:id/images', authorize('order.edit'), validate({ params: idParamsSchema }), singleImageUpload('image', { maxBytes: 5 * 1024 * 1024 }), controller.addImage);
router.delete('/:id/images/:fileId', authorize('order.edit'), validate({ params: z.object({ id: objectIdSchema, fileId: objectIdSchema }) }), controller.removeImage);
router.post('/:id/advances', authorize('order.edit'), validate({ params: idParamsSchema, body: advanceSchema }), controller.addAdvance);
// Tagging the finished piece creates a product and stock, so it also needs those rights.
router.post('/:id/items/:index/finish', authorize('order.edit'), authorize('product.create'), authorize('inventory.adjust'), validate({ params: orderItemParamsSchema, body: orderFinishSchema }), controller.finishItem);
router.patch('/:id/status', authorize('order.edit'), validate({ params: idParamsSchema, body: orderStatusSchema }), controller.setStatus);
router.post('/:id/cancel', authorize('order.cancel'), validate({ params: idParamsSchema, body: orderCancelSchema }), controller.cancel);

export default router;
