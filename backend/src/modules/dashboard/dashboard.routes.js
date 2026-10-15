import { Router } from 'express';
import { z } from 'zod';
import { objectIdSchema } from '@jerp/shared/schemas';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { sendOk } from '../../utils/response.js';
import { branchDashboard } from './dashboard.service.js';

const router = Router();
// period: today, this month, or all (everything since the branch's first bill).
const querySchema = z.object({ branchId: objectIdSchema, period: z.enum(['today', 'month', 'all']).default('all') });

// Needs Dashboard → View; then each section checks its own permission (sales / orders / inventory).
router.use(authenticate, authorize('dashboard.view'));
router.get('/', validate({ query: querySchema }), async (req, res) => sendOk(res, await branchDashboard(req.valid.query)));

export default router;
