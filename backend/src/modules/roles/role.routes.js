import { Router } from 'express';
import { idParamsSchema, roleSchema } from '@jerp/shared/schemas';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize, authorizeAny } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './role.controller.js';

const router = Router();
const byId = validate({ params: idParamsSchema });

router.use(authenticate);
router.get('/', authorizeAny(['role.view', 'user.create', 'user.edit']), controller.list);
router.post('/', authorize('role.create'), validate({ body: roleSchema }), controller.create);
router.get('/:id', authorize('role.view'), byId, controller.get);
router.put('/:id', authorize('role.edit'), validate({ params: idParamsSchema, body: roleSchema }), controller.update);
router.post('/:id/duplicate', authorize('role.create'), byId, controller.duplicate);
router.delete('/:id', authorize('role.delete'), byId, controller.remove);

export default router;
