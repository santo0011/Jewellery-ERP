import { Router } from 'express';
import { rateBatchSchema, rateHistoryQuerySchema } from '@jerp/shared/schemas';
import { authenticate } from '../../middleware/authenticate.js';
import { LOOKUP_ACCESS } from '@jerp/shared';
import { authorize, authorizeAny, requireAllBranches } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './rate.controller.js';

const router = Router();

router.use(authenticate);
router.get('/current', authorizeAny(LOOKUP_ACCESS.rate), controller.current);
router.get('/history', authorize('rate.view'), validate({ query: rateHistoryQuerySchema }), controller.history);
// Rates are one set for the whole organisation (every branch bills with them), so they are updated at
// organisation level: by someone with access to all branches, not from a branch login.
router.post('/', authorize('rate.create'), requireAllBranches, validate({ body: rateBatchSchema }), controller.create);

export default router;
