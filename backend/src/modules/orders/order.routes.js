import { Router } from 'express';
import { advanceSchema, idParamsSchema, objectIdSchema, orderCancelSchema, orderCustomerMetalSchema, orderEstimateSchema, orderFinishSchema, orderItemParamsSchema, orderListQuerySchema, orderSchema, orderStatusSchema, orderUpdateSchema } from '@jerp/shared/schemas';
import { authenticate } from '../../middleware/authenticate.js';
import { z } from 'zod';
import { LOOKUP_ACCESS } from '@jerp/shared';
import { authorize, authorizeAny } from '../../middleware/authorize.js';
import { singleImageUpload } from '../../middleware/upload.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './order.controller.js';

const router = Router();

router.use(authenticate);
router.get('/', authorizeAny(LOOKUP_ACCESS.order), validate({ query: orderListQuerySchema }), controller.list);
router.post('/', authorize('order.create'), validate({ body: orderSchema }), controller.create);
router.post('/estimate', authorize('order.create'), validate({ body: orderEstimateSchema }), controller.estimate);
router.get('/:id', authorizeAny(LOOKUP_ACCESS.order), validate({ params: idParamsSchema }), controller.get);
router.put('/:id', authorize('order.edit'), validate({ params: idParamsSchema, body: orderUpdateSchema }), controller.update);
router.post('/:id/images', authorize('order.edit'), validate({ params: idParamsSchema }), singleImageUpload('image', { maxBytes: 5 * 1024 * 1024 }), controller.addImage);
router.delete('/:id/images/:fileId', authorize('order.edit'), validate({ params: z.object({ id: objectIdSchema, fileId: objectIdSchema }) }), controller.removeImage);
router.post('/:id/advances', authorize('order.edit'), validate({ params: idParamsSchema, body: advanceSchema }), controller.addAdvance);
// The customer's own gold for the order: received (valued, held as advance) or an entry made by mistake given back.
router.post('/:id/customer-metal', authorize('order.edit'), validate({ params: idParamsSchema, body: orderCustomerMetalSchema }), controller.addCustomerMetal);
router.delete('/:id/customer-metal/:lineId', authorize('order.edit'), validate({ params: z.object({ id: objectIdSchema, lineId: objectIdSchema }) }), controller.removeCustomerMetal);
// Tagging the finished piece creates a product and stock, so it also needs those rights.
router.post('/:id/items/:index/finish', authorize('order.edit'), authorize('product.create'), authorize('inventory.adjust'), validate({ params: orderItemParamsSchema, body: orderFinishSchema }), controller.finishItem);
router.patch('/:id/status', authorize('order.edit'), validate({ params: idParamsSchema, body: orderStatusSchema }), controller.setStatus);
router.post('/:id/cancel', authorize('order.cancel'), validate({ params: idParamsSchema, body: orderCancelSchema }), controller.cancel);

export default router;
