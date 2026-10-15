import { Router } from 'express';
import { z } from 'zod';
import { SETTINGS_SECTIONS } from '@jerp/shared';
import { branchPrintSchema, idParamsSchema } from '@jerp/shared/schemas';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { ApiError } from '../../utils/ApiError.js';
import * as controller from './settings.controller.js';

const router = Router();
const sectionParams = z.object({ section: z.enum(SETTINGS_SECTIONS) });

router.use(authenticate);
router.get('/', authorize('settings.view'), controller.getAll);
// Each branch sets its own invoice print design, from its own login; the organisation sets only its own (PUT /print).
const branchUsersOnly = (req, res, next) => {
  if (req.auth.branchAccess.all) throw ApiError.forbidden('Each branch chooses its own print design', 'BRANCH_PRINT_ONLY');
  next();
};
router.put('/print/branches/:id', authorize('settings.view'), authorize('sales.print'), branchUsersOnly, validate({ params: idParamsSchema, body: branchPrintSchema }), controller.updateBranchPrint);
router.put('/:section', authorize('settings.edit'), validate({ params: sectionParams }), controller.update);

export default router;
