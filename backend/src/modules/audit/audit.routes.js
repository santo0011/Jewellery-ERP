import { Router } from 'express';
import { auditListQuerySchema } from '@jerp/shared/schemas';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './audit.controller.js';

const router = Router();

router.use(authenticate);
router.get('/', authorize('audit.view'), validate({ query: auditListQuerySchema }), controller.list);

export default router;
