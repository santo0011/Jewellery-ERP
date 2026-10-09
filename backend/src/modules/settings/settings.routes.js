import { Router } from 'express';
import { z } from 'zod';
import { SETTINGS_SECTIONS } from '@jerp/shared';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './settings.controller.js';

const router = Router();
const sectionParams = z.object({ section: z.enum(SETTINGS_SECTIONS) });

router.use(authenticate);
router.get('/', authorize('settings.view'), controller.getAll);
router.put('/:section', authorize('settings.edit'), validate({ params: sectionParams }), controller.update);

export default router;
