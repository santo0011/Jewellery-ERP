import { Router } from 'express';
import { rateBatchSchema, rateHistoryQuerySchema } from '@jerp/shared/schemas';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './rate.controller.js';

const router = Router();

router.use(authenticate);
router.get('/current', authorize('rate.view'), controller.current);
router.get('/history', authorize('rate.view'), validate({ query: rateHistoryQuerySchema }), controller.history);
router.post('/', authorize('rate.create'), validate({ body: rateBatchSchema }), controller.create);

export default router;
