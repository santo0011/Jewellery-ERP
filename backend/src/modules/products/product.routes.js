import { Router } from 'express';
import { z } from 'zod';
import { idParamsSchema, objectIdSchema, productListQuerySchema, productHuidSchema, productLookupParamsSchema, productSchema } from '@jerp/shared/schemas';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { singleImageUpload } from '../../middleware/upload.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './product.controller.js';

const router = Router();
const byId = validate({ params: idParamsSchema });
const byImage = validate({ params: z.object({ id: objectIdSchema, fileId: objectIdSchema }) });

router.use(authenticate);
router.get('/', authorize('product.view'), validate({ query: productListQuerySchema }), controller.list);
router.post('/', authorize('product.create'), validate({ body: productSchema }), controller.create);
router.get('/lookup/:code', authorize('product.view'), validate({ params: productLookupParamsSchema }), controller.lookup);
router.get('/:id', authorize('product.view'), byId, controller.get);
router.put('/:id', authorize('product.edit'), validate({ params: idParamsSchema, body: productSchema }), controller.update);
router.patch('/:id/huid', authorize('product.edit'), validate({ params: idParamsSchema, body: productHuidSchema }), controller.setHuid);
router.delete('/:id', authorize('product.delete'), byId, controller.remove);
router.post('/:id/images', authorize('product.edit'), byId, singleImageUpload('image', { maxBytes: 5 * 1024 * 1024 }), controller.addImage);
router.delete('/:id/images/:fileId', authorize('product.edit'), byImage, controller.removeImage);
router.patch('/:id/images/:fileId/primary', authorize('product.edit'), byImage, controller.setPrimaryImage);

export default router;
