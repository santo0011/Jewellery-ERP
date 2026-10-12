import { Router } from 'express';
import { z } from 'zod';
import { idParamsSchema, platformCreateOrganisationSchema, platformOrgListQuerySchema, platformOrgStatusSchema, platformUpdateOrganisationSchema } from '@jerp/shared/schemas';
import { validate } from '../../middleware/validate.js';
import * as controller from './platform.controller.js';
import { assignPlanSchema, billingPaymentListQuerySchema, emailSettingsSchema, emailTestSchema, planSchema } from '@jerp/shared/schemas';
import * as emailSettings from './emailSettings.service.js';
import * as platformService from './platform.service.js';
import { sendCreated, sendOk } from '../../utils/response.js';
import * as billing from '../billing/billing.service.js';
import { organisationHistory } from '../organisations/organisationHistory.service.js';

const meta = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') ?? null });

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
// A fresh 6-digit sign-in code for the organisation's owner (replaces their password), sent by email.
router.post('/organisations/:id/send-login', validate({ params: idParamsSchema }), async (req, res) => {
  const result = await platformService.sendLoginCode(req.valid.params.id, req.platformAdmin, meta(req));
  sendOk(res, result, { message: result.status === 'sent' ? `New sign-in code emailed to ${result.sentTo}` : 'New sign-in code created' });
});
router.patch('/organisations/:id', validate({ params: idParamsSchema, body: platformUpdateOrganisationSchema }), controller.update);
router.get('/organisations/:id/history', validate({ params: idParamsSchema }), async (req, res) => sendOk(res, await organisationHistory(req.valid.params.id)));
router.delete('/organisations/:id', validate({ params: idParamsSchema }), controller.remove);
router.patch('/organisations/:id/status', validate({ params: idParamsSchema, body: platformOrgStatusSchema }), controller.setStatus);

// Subscriptions & billing
// Outgoing email (SMTP): where sign-in codes and password reset links are sent from.
router.get('/email-settings', async (req, res) => sendOk(res, await emailSettings.getEmailSettings()));
router.put('/email-settings', validate({ body: emailSettingsSchema }), async (req, res) =>
  sendOk(res, await emailSettings.saveEmailSettings(req.valid.body, req.platformAdmin, meta(req)), { message: 'Email settings saved' }),
);
router.get('/email-settings/preview/:template', validate({ params: z.object({ template: z.enum(emailSettings.PREVIEW_TEMPLATES) }) }), (req, res) =>
  sendOk(res, emailSettings.previewEmail(req.valid.params.template)),
);
router.post('/email-settings/test', validate({ body: emailTestSchema }), async (req, res) =>
  sendOk(res, await emailSettings.sendTestEmail(req.valid.body, req.platformAdmin), { message: `Test email sent to ${req.valid.body.to}` }),
);

router.get('/billing/dashboard', async (req, res) => sendOk(res, await billing.billingDashboard()));
router.get('/plans', async (req, res) => sendOk(res, await billing.listPlans({ includeInactive: true })));
router.post('/plans', validate({ body: planSchema }), async (req, res) => {
  const plan = await billing.createPlan(req.valid.body, req.platformAdmin, meta(req));
  sendCreated(res, plan, { message: `${plan.name} plan created` });
});
router.put('/plans/:id', validate({ params: idParamsSchema, body: planSchema }), async (req, res) =>
  sendOk(res, await billing.updatePlan(req.valid.params.id, req.valid.body, req.platformAdmin, meta(req)), { message: 'Plan updated' }),
);
router.delete('/plans/:id', validate({ params: idParamsSchema }), async (req, res) => {
  const plan = await billing.deletePlan(req.valid.params.id, req.platformAdmin, meta(req));
  sendOk(res, plan, { message: `${plan.name} plan deleted` });
});
router.get('/payments', validate({ query: billingPaymentListQuerySchema }), async (req, res) => {
  const { items, meta: listMeta } = await billing.listPayments(req.valid.query);
  sendOk(res, items, { meta: listMeta });
});
router.get('/organisations/:id/billing', validate({ params: idParamsSchema }), async (req, res) => sendOk(res, await billing.organisationBilling(req.valid.params.id)));
router.post('/organisations/:id/subscription', validate({ params: idParamsSchema, body: assignPlanSchema }), async (req, res) =>
  sendOk(res, await billing.assignPlan(req.valid.params.id, req.valid.body, req.platformAdmin, meta(req)), { message: 'Subscription updated' }),
);

export default router;
