import { Router } from 'express';
import { branchLimitSchema, idParamsSchema, platformCreateOrganisationSchema, platformOrgListQuerySchema, platformOrgStatusSchema, platformUpdateOrganisationSchema } from '@jerp/shared/schemas';
import { validate } from '../../middleware/validate.js';
import * as controller from './platform.controller.js';

const router = Router();

// Sign-in goes through the shared POST /auth/login, which opens a platform session for Super Admin emails.
router.post('/auth/refresh', controller.refresh);
router.post('/auth/logout', controller.logout);

router.use(controller.authenticatePlatform);
router.get('/auth/me', controller.me);
router.get('/dashboard', controller.dashboard);
router.get('/organisations', validate({ query: platformOrgListQuerySchema }), controller.list);
router.post('/organisations', validate({ body: platformCreateOrganisationSchema }), controller.create);
router.get('/organisations/:id', validate({ params: idParamsSchema }), controller.get);
router.patch('/organisations/:id', validate({ params: idParamsSchema, body: platformUpdateOrganisationSchema }), controller.update);
router.patch('/organisations/:id/branch-limit', validate({ params: idParamsSchema, body: branchLimitSchema }), controller.setBranchLimit);
router.patch('/organisations/:id/status', validate({ params: idParamsSchema, body: platformOrgStatusSchema }), controller.setStatus);

export default router;
