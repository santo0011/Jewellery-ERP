import { Router } from 'express';
import { checkoutSchema, orderIdParamsSchema, upiPaySchema } from '@jerp/shared/schemas';
import { logger } from '../../config/logger.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { sendOk } from '../../utils/response.js';
import * as billing from './billing.service.js';
import { verifyWebhookSignature } from './cashfree.js';

const router = Router();

// Cashfree calls this when a payment completes (needs a public URL; locally the return page verifies instead).
router.post('/cashfree/webhook', async (req, res) => {
  if (!verifyWebhookSignature(req.rawBody, req.get('x-webhook-timestamp'), req.get('x-webhook-signature'))) {
    logger.warn('Cashfree webhook with a bad signature ignored');
    return res.status(401).json({ success: false });
  }
  try {
    await billing.handleWebhook(req.body);
  } catch (err) {
    logger.error({ err: err.message }, 'Cashfree webhook failed');
  }
  return res.json({ success: true });
});

// The organisation's own subscription — reachable even when it has expired, so they can renew.
router.use(authenticate);
router.get('/', authorize('subscription.view'), async (req, res) => sendOk(res, await billing.myBilling()));
router.post('/checkout', authorize('subscription.manage'), validate({ body: checkoutSchema }), async (req, res) => sendOk(res, await billing.createCheckout(req.valid.body)));
router.post('/payments/:orderId/upi', authorize('subscription.manage'), validate({ params: orderIdParamsSchema, body: upiPaySchema }), async (req, res) => sendOk(res, await billing.startUpiPayment(req.valid.params.orderId, req.valid.body)));
router.post('/payments/:orderId/verify', authorize('subscription.view'), validate({ params: orderIdParamsSchema }), async (req, res) => sendOk(res, await billing.verifyCheckout(req.valid.params.orderId)));

export default router;
