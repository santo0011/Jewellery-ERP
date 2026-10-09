import { Router } from 'express';
import { supplierListQuerySchema, supplierSchema, idParamsSchema, recordStatusSchema } from '@jerp/shared/schemas';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './supplier.controller.js';

const router = Router();
const byId = validate({ params: idParamsSchema });

router.use(authenticate);
router.get('/', authorize('supplier.view'), validate({ query: supplierListQuerySchema }), controller.list);
router.post('/', authorize('supplier.create'), validate({ body: supplierSchema }), controller.create);
router.get('/:id', authorize('supplier.view'), byId, controller.get);
router.put('/:id', authorize('supplier.edit'), validate({ params: idParamsSchema, body: supplierSchema }), controller.update);
router.patch('/:id/status', authorize('supplier.edit'), validate({ params: idParamsSchema, body: recordStatusSchema }), controller.setStatus);
router.delete('/:id', authorize('supplier.delete'), byId, controller.remove);

export default router;
