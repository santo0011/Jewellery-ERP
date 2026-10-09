import { Router } from 'express';
import { branchListQuerySchema, branchLoginSchema, branchPermissionsSchema, branchSchema, branchStatusSchema, idParamsSchema } from '@jerp/shared/schemas';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize, authorizeAny, requireAllBranches } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './branch.controller.js';

const router = Router();

router.use(authenticate);
router.get('/', authorize('branch.view'), validate({ query: branchListQuerySchema }), controller.list);
router.get('/usage', authorize('branch.view'), controller.usage);
router.get('/directory', authorizeAny(['branch.view', 'inventory.transfer']), controller.directory);
router.post('/', authorize('branch.create'), requireAllBranches, validate({ body: branchSchema }), controller.create);
router.get('/:id', authorize('branch.view'), validate({ params: idParamsSchema }), controller.get);
router.put('/:id', authorize('branch.edit'), validate({ params: idParamsSchema, body: branchSchema }), controller.update);
// The branch's own login account; managing it needs both branch and user rights across all branches.
router.put('/:id/login', authorize('branch.edit'), authorize('user.edit'), requireAllBranches, validate({ params: idParamsSchema, body: branchLoginSchema }), controller.setLogin);
router.put('/:id/permissions', authorize('branch.edit'), requireAllBranches, validate({ params: idParamsSchema, body: branchPermissionsSchema }), controller.setPermissions);
router.patch('/:id/status', authorize('branch.delete'), validate({ params: idParamsSchema, body: branchStatusSchema }), controller.setStatus);

export default router;
