import { Router } from 'express';
import { idParamsSchema, purchaseListQuerySchema, purchaseOrderCancelSchema, purchaseOrderListQuerySchema, purchaseOrderSchema, purchasePaymentSchema, purchaseSchema } from '@jerp/shared/schemas';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { sendCreated, sendOk } from '../../utils/response.js';
import * as purchases from './purchase.service.js';

const router = Router();
const byId = validate({ params: idParamsSchema });
router.use(authenticate);

router.get('/', authorize('purchase.view'), validate({ query: purchaseListQuerySchema }), async (req, res) => {
  const { items, meta } = await purchases.listPurchases(req.valid.query);
  sendOk(res, items, { meta });
});
router.post('/', authorize('purchase.create'), validate({ body: purchaseSchema }), async (req, res) => {
  const p = await purchases.createPurchase(req.valid.body);
  sendCreated(res, p, { message: `Purchase ${p.purchaseNo} saved` });
});

router.get('/orders', authorize('purchase.view'), validate({ query: purchaseOrderListQuerySchema }), async (req, res) => {
  const { items, meta } = await purchases.listPurchaseOrders(req.valid.query);
  sendOk(res, items, { meta });
});
router.post('/orders', authorize('purchase.create'), validate({ body: purchaseOrderSchema }), async (req, res) => {
  const o = await purchases.createPurchaseOrder(req.valid.body);
  sendCreated(res, o, { message: `Order ${o.orderNo} placed` });
});
router.get('/orders/:id', authorize('purchase.view'), byId, async (req, res) => sendOk(res, await purchases.getPurchaseOrder(req.valid.params.id)));
router.post('/orders/:id/cancel', authorize('purchase.cancel'), validate({ params: idParamsSchema, body: purchaseOrderCancelSchema }), async (req, res) =>
  sendOk(res, await purchases.cancelPurchaseOrder(req.valid.params.id, req.valid.body), { message: 'Order cancelled' }),
);

router.get('/:id', authorize('purchase.view'), byId, async (req, res) => sendOk(res, await purchases.getPurchase(req.valid.params.id)));
router.post('/:id/payments', authorize('purchase.edit'), validate({ params: idParamsSchema, body: purchasePaymentSchema }), async (req, res) =>
  sendOk(res, await purchases.payPurchase(req.valid.params.id, req.valid.body), { message: 'Payment recorded' }),
);

export default router;
