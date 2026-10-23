import { Router } from 'express';
import { idParamsSchema, oldGoldCancelSchema, oldGoldListQuerySchema, oldGoldPurchaseSchema } from '@jerp/shared/schemas';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { sendCreated, sendOk } from '../../utils/response.js';
import * as oldGold from './oldGold.service.js';

const router = Router();
router.use(authenticate);

router.get('/', authorize('oldgold.view'), validate({ query: oldGoldListQuerySchema }), async (req, res) => {
  const { items, meta } = await oldGold.listOldGold(req.valid.query);
  sendOk(res, items, { meta });
});
router.post('/', authorize('oldgold.create'), validate({ body: oldGoldPurchaseSchema }), async (req, res) => sendCreated(res, await oldGold.createPurchase(req.valid.body), { message: 'Old gold bought' }));
router.get('/:id', authorize('oldgold.view'), validate({ params: idParamsSchema }), async (req, res) => sendOk(res, await oldGold.getOldGold(req.valid.params.id)));
router.post('/:id/cancel', authorize('oldgold.create'), validate({ params: idParamsSchema, body: oldGoldCancelSchema }), async (req, res) =>
  sendOk(res, await oldGold.cancelOldGold(req.valid.params.id, req.valid.body), { message: 'Old gold purchase cancelled' }),
);

export default router;
