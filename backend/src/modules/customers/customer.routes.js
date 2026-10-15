import { Router } from 'express';
import { customerListQuerySchema, customerSchema, duePaymentSchema, idParamsSchema, recordStatusSchema } from '@jerp/shared/schemas';
import { sendCreated, sendOk } from '../../utils/response.js';
import { collectPayment, getCustomerDues } from './customerReceipt.service.js';
import { customerHistory } from './customerHistory.service.js';
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
// Dues: what the customer still owes, and collecting it later (a due receipt).
router.get('/:id/dues', authorize('customer.view'), byId, async (req, res) => sendOk(res, await getCustomerDues(req.valid.params.id)));
router.post('/:id/payments', authorize('accounts.receipt'), validate({ params: idParamsSchema, body: duePaymentSchema }), async (req, res) => {
  const receipt = await collectPayment(req.valid.params.id, req.valid.body);
  sendCreated(res, receipt, { message: `Receipt ${receipt.receiptNo} saved` });
});
router.get('/:id/history', authorize('customer.view'), byId, async (req, res) => sendOk(res, await customerHistory(req.valid.params.id)));
router.put('/:id', authorize('customer.edit'), validate({ params: idParamsSchema, body: customerSchema }), controller.update);
router.patch('/:id/status', authorize('customer.edit'), validate({ params: idParamsSchema, body: recordStatusSchema }), controller.setStatus);
router.delete('/:id', authorize('customer.delete'), byId, controller.remove);

export default router;
