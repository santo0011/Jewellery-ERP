import { Router } from 'express';
import { supplierListQuerySchema, supplierPaymentSchema, supplierSchema, idParamsSchema, recordStatusSchema } from '@jerp/shared/schemas';
import { authenticate } from '../../middleware/authenticate.js';
import { LOOKUP_ACCESS } from '@jerp/shared';
import { authorize, authorizeAny } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './supplier.controller.js';

const router = Router();
const byId = validate({ params: idParamsSchema });

router.use(authenticate);
router.get('/', authorizeAny(LOOKUP_ACCESS.supplier), validate({ query: supplierListQuerySchema }), controller.list);
router.post('/', authorize('supplier.create'), validate({ body: supplierSchema }), controller.create);
router.get('/:id', authorize('supplier.view'), byId, controller.get);
router.put('/:id', authorize('supplier.edit'), validate({ params: idParamsSchema, body: supplierSchema }), controller.update);
router.patch('/:id/status', authorize('supplier.edit'), validate({ params: idParamsSchema, body: recordStatusSchema }), controller.setStatus);
router.delete('/:id', authorize('supplier.delete'), byId, controller.remove);
// Payments on the supplier's account: the old balance first, then the oldest bills (same permission as paying a bill).
router.get('/:id/payments', authorize('purchase.view'), byId, controller.payments);
router.post('/:id/payments', authorize('purchase.edit'), validate({ params: idParamsSchema, body: supplierPaymentSchema }), controller.pay);

export default router;
