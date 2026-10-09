import { Router } from 'express';
import { adminResetPasswordSchema, createUserSchema, idParamsSchema, updateUserSchema, userListQuerySchema, userStatusSchema } from '@jerp/shared/schemas';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize, requireAllBranches } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './user.controller.js';

const router = Router();

router.use(authenticate);
router.get('/', authorize('user.view'), validate({ query: userListQuerySchema }), controller.list);
router.post('/', authorize('user.create'), requireAllBranches, validate({ body: createUserSchema }), controller.create);
router.get('/:id', authorize('user.view'), validate({ params: idParamsSchema }), controller.get);
router.put('/:id', authorize('user.edit'), requireAllBranches, validate({ params: idParamsSchema, body: updateUserSchema }), controller.update);
router.patch('/:id/status', authorize('user.delete'), requireAllBranches, validate({ params: idParamsSchema, body: userStatusSchema }), controller.setStatus);
router.post('/:id/reset-password', authorize('user.edit'), requireAllBranches, validate({ params: idParamsSchema, body: adminResetPasswordSchema }), controller.resetPassword);

export default router;
