import { Router } from 'express';
import { z } from 'zod';
import { objectIdSchema } from '@jerp/shared/schemas';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { sendOk } from '../../utils/response.js';
import { DELETABLE_TYPES, deleteCheck, deleteChecks, deleteRecord } from './record.deletion.js';

const router = Router();
router.use(authenticate);

// Each type checks its own permission (customer.delete, employee.delete, …).
const params = validate({ params: z.object({ type: z.enum(DELETABLE_TYPES), id: objectIdSchema }) });
// A table page's rows at once (up to 100): which can be deleted, and why not.
router.post('/:type/delete-checks', validate({ params: z.object({ type: z.enum(DELETABLE_TYPES) }), body: z.object({ ids: z.array(objectIdSchema).max(100) }) }), async (req, res) =>
  sendOk(res, await deleteChecks(req.valid.params.type, req.valid.body.ids)),
);
router.get('/:type/:id/delete-check', params, async (req, res) => sendOk(res, await deleteCheck(req.valid.params.type, req.valid.params.id)));
router.delete('/:type/:id', params, async (req, res) => {
  const done = await deleteRecord(req.valid.params.type, req.valid.params.id);
  sendOk(res, done, { message: `${done.name} deleted` });
});

export default router;
