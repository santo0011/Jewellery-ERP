import { Router } from 'express';
import {
  adjustmentSchema,
  idParamsSchema,
  movementListQuerySchema,
  openingStockSchema,
  stockDocListQuerySchema,
  stockSummaryQuerySchema,
  transferRejectSchema,
  transferSchema,
} from '@jerp/shared/schemas';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './inventory.controller.js';

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

export default router;
