import { Router } from 'express';
import { updateOrganisationSchema } from '@jerp/shared/schemas';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { singleImageUpload } from '../../middleware/upload.js';
import { validate } from '../../middleware/validate.js';
import { requireContext } from '../../core/context/requestContext.js';
import { sendOk } from '../../utils/response.js';
import * as controller from './organisation.controller.js';
import { organisationHistory } from './organisationHistory.service.js';

const router = Router();

router.use(authenticate);
router.get('/', authorize('organisation.view'), controller.getCurrent);
router.get('/history', authorize('organisation.view'), async (req, res) => sendOk(res, await organisationHistory(requireContext().organisationId)));
router.patch('/', authorize('organisation.edit'), validate({ body: updateOrganisationSchema }), controller.updateCurrent);
router.get('/subscription', authorize('subscription.view'), controller.getSubscription);
router.get('/logo', controller.getLogo);
router.put('/logo', authorize('organisation.edit'), singleImageUpload('logo'), controller.uploadLogo);
router.delete('/logo', authorize('organisation.edit'), controller.removeLogo);

export default router;
