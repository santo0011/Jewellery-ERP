import { Router } from 'express';
import { idParamsSchema, quoteSchema, saleCancelSchema, saleListQuerySchema, saleSchema, salesReturnSchema } from '@jerp/shared/schemas';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './sale.controller.js';

const router = Router();

router.use(authenticate);
router.post('/quote', authorize('sales.create'), validate({ body: quoteSchema }), controller.quote);
router.get('/', authorize('sales.view'), validate({ query: saleListQuerySchema }), controller.list);
router.post('/', authorize('sales.create'), validate({ body: saleSchema }), controller.create);
router.get('/:id', authorize('sales.view'), validate({ params: idParamsSchema }), controller.get);
router.post('/:id/cancel', authorize('sales.cancel'), validate({ params: idParamsSchema, body: saleCancelSchema }), controller.cancel);
router.post('/:id/returns', authorize('sales.return'), validate({ params: idParamsSchema, body: salesReturnSchema }), controller.returnItems);

export default router;
