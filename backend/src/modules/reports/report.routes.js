import { Router } from 'express';
import { reportParamsSchema, reportQuerySchema } from '@jerp/shared/schemas';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { sendOk } from '../../utils/response.js';
import { listReports, runReport } from './report.service.js';

const router = Router();
router.use(authenticate);

// Each report checks its own permission (sales, inventory, customer, finance, payroll or attendance).
router.get('/', (req, res) => sendOk(res, listReports()));
router.get('/:key', validate({ params: reportParamsSchema, query: reportQuerySchema }), async (req, res) => sendOk(res, await runReport(req.valid.params.key, req.valid.query)));

export default router;
