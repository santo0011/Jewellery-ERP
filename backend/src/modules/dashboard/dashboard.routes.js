import { Router } from 'express';
import { z } from 'zod';
import { objectIdSchema } from '@jerp/shared/schemas';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { sendOk } from '../../utils/response.js';
import { branchDashboard } from './dashboard.service.js';

const router = Router();
const querySchema = z.object({ branchId: objectIdSchema, days: z.coerce.number().int().refine((d) => [7, 30, 90].includes(d), 'Use 7, 30 or 90 days').default(30) });

// Each section checks its own permission (sales / orders / inventory); signing in is enough to ask.
router.use(authenticate);
router.get('/', validate({ query: querySchema }), async (req, res) => sendOk(res, await branchDashboard(req.valid.query)));

export default router;
