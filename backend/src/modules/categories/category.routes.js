import { Router } from 'express';
import { categorySchema, idParamsSchema } from '@jerp/shared/schemas';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize, authorizeAny } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './category.controller.js';

const router = Router();

router.use(authenticate);
router.get('/', authorizeAny(['category.view', 'product.view']), controller.list);
router.post('/', authorize('category.create'), validate({ body: categorySchema }), controller.create);
router.post('/defaults', authorize('category.create'), controller.addDefaults);
router.put('/:id', authorize('category.edit'), validate({ params: idParamsSchema, body: categorySchema }), controller.update);
router.delete('/:id', authorize('category.delete'), validate({ params: idParamsSchema }), controller.remove);

export default router;
