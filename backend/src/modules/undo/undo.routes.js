import { Router } from 'express';
import { idParamsSchema, undoHistoryQuerySchema, undoReasonSchema } from '@jerp/shared/schemas';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { sendOk } from '../../utils/response.js';
import * as undo from './undo.service.js';

const router = Router();
router.use(authenticate);

// The latest action of each stack this person works in (organisation, and each of their branches).
router.get('/stacks', authorize('undo.view'), async (req, res) => sendOk(res, await undo.listStacks()));
router.get('/history', authorize('undo.view'), validate({ query: undoHistoryQuerySchema }), async (req, res) => {
  const { items, meta } = await undo.listHistory(req.valid.query);
  sendOk(res, items, { meta });
});
router.get('/:id', authorize('undo.view'), validate({ params: idParamsSchema }), async (req, res) => sendOk(res, await undo.getUndoAction(req.valid.params.id)));
// Each handler also checks the permission the action itself needs (cancelling an invoice needs sales.cancel …).
router.post('/:id/undo', authorize('undo.undo'), validate({ params: idParamsSchema, body: undoReasonSchema }), async (req, res) =>
  sendOk(res, await undo.undoAction(req.valid.params.id, req.valid.body), { message: 'Action undone' }),
);
router.post('/:id/dismiss', authorize('undo.undo'), validate({ params: idParamsSchema, body: undoReasonSchema }), async (req, res) =>
  sendOk(res, await undo.dismissAction(req.valid.params.id, req.valid.body), { message: 'Action kept' }),
);

export default router;
