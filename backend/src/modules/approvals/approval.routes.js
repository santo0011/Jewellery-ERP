import { Router } from 'express';
import { approvalDecisionSchema, approvalListQuerySchema, idParamsSchema } from '@jerp/shared/schemas';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './approval.controller.js';

const router = Router();

router.use(authenticate);
router.get('/', validate({ query: approvalListQuerySchema }), controller.list);
router.get('/pending-count', controller.pendingCount);
router.post('/:id/decision', validate({ params: idParamsSchema, body: approvalDecisionSchema }), controller.decide);

export default router;
