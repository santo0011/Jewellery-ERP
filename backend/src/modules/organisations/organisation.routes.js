import { Router } from 'express';
import { z } from 'zod';
import { lookupPincode } from '../../core/address/pincode.service.js';
import { updateOrganisationSchema } from '@jerp/shared/schemas';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize, authorizeAny } from '../../middleware/authorize.js';
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
// PIN code -> post offices, city, district and state, to fill the registered address.
// Anyone who edits an address (organisation or branches) can look up a PIN code.
router.get('/pincode/:pincode', authorizeAny(['organisation.edit', 'branch.create', 'branch.edit']), validate({ params: z.object({ pincode: z.string().regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit PIN code') }) }), async (req, res) =>
  sendOk(res, await lookupPincode(req.valid.params.pincode)),
);
router.get('/logo', controller.getLogo);
router.put('/logo', authorize('organisation.edit'), singleImageUpload('logo'), controller.uploadLogo);
router.delete('/logo', authorize('organisation.edit'), controller.removeLogo);

export default router;
