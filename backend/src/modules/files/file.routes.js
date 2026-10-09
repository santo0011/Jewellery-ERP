import { Router } from 'express';
import { idParamsSchema } from '@jerp/shared/schemas';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validate.js';
import { serveFile } from './file.controller.js';

const router = Router();
router.use(authenticate);
router.get('/:id', validate({ params: idParamsSchema }), serveFile);

export default router;
