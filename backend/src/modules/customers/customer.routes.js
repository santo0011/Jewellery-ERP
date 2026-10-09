import { Router } from 'express';
import { customerListQuerySchema, customerSchema, idParamsSchema, recordStatusSchema } from '@jerp/shared/schemas';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './customer.controller.js';

const router = Router();
const byId = validate({ params: idParamsSchema });

router.use(authenticate);
router.get('/', authorize('customer.view'), validate({ query: customerListQuerySchema }), controller.list);
router.post('/', authorize('customer.create'), validate({ body: customerSchema }), controller.create);
router.get('/:id', authorize('customer.view'), byId, controller.get);
router.get('/:id/activity', authorize('customer.view'), byId, controller.activity);
router.put('/:id', authorize('customer.edit'), validate({ params: idParamsSchema, body: customerSchema }), controller.update);
router.patch('/:id/status', authorize('customer.edit'), validate({ params: idParamsSchema, body: recordStatusSchema }), controller.setStatus);
router.delete('/:id', authorize('customer.delete'), byId, controller.remove);

export default router;
