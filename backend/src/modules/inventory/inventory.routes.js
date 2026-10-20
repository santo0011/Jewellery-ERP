import { Router } from 'express';
import {
  adjustmentSchema,
  idParamsSchema,
  movementListQuerySchema,
  openingStockSchema,
  productionSchema,
  stockDocListQuerySchema,
  stockSummaryQuerySchema,
  transferRejectSchema,
  transferSchema,
} from '@jerp/shared/schemas';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './inventory.controller.js';
import { createProduction, getProduction, listProductions } from './production.service.js';
import { sendCreated, sendOk } from '../../utils/response.js';

const router = Router();
const byId = validate({ params: idParamsSchema });
const listQuery = validate({ query: stockDocListQuerySchema });

router.use(authenticate);
router.get('/summary', authorize('inventory.view'), validate({ query: stockSummaryQuerySchema }), controller.summary);
router.get('/movements', authorize('inventory.view'), validate({ query: movementListQuerySchema }), controller.movements);

router.get('/opening', authorize('inventory.view'), listQuery, controller.listOpening);
router.post('/opening', authorize('inventory.adjust'), validate({ body: openingStockSchema }), controller.createOpening);
router.get('/adjustments', authorize('inventory.view'), listQuery, controller.listAdjustments);
router.post('/adjustments', authorize('inventory.adjust'), validate({ body: adjustmentSchema }), controller.createAdjustment);
router.get('/entries/:id', authorize('inventory.view'), byId, controller.getEntry);

router.get('/transfers', authorize('inventory.view'), listQuery, controller.listTransfers);
router.post('/transfers', authorize('inventory.transfer'), validate({ body: transferSchema }), controller.createTransfer);
router.get('/transfers/:id', authorize('inventory.view'), byId, controller.getTransfer);
router.post('/transfers/:id/receive', authorize('inventory.transfer'), byId, controller.receiveTransfer);
router.post('/transfers/:id/reject', authorize('inventory.transfer'), validate({ params: idParamsSchema, body: transferRejectSchema }), controller.rejectTransfer);

// Making jewellery from the raw metal stock: metal out of the metal stock, finished pieces into Products.
router.get('/production', authorize('inventory.view'), listQuery, async (req, res) => {
  const { items, meta } = await listProductions(req.valid.query);
  sendOk(res, items, { meta });
});
router.get('/production/:id', authorize('inventory.view'), byId, async (req, res) => sendOk(res, await getProduction(req.valid.params.id)));
router.post('/production', authorize('inventory.adjust'), validate({ body: productionSchema }), async (req, res) => sendCreated(res, await createProduction(req.valid.body), { message: 'Jewellery made and added to stock' }));

export default router;
