import { sendOk } from '../../utils/response.js';
import * as organisationService from './organisation.service.js';

export async function getCurrent(req, res) {
  sendOk(res, await organisationService.getCurrentOrganisation());
}

export async function updateCurrent(req, res) {
  sendOk(res, await organisationService.updateCurrentOrganisation(req.valid.body), { message: 'Organisation updated' });
}

export async function getSubscription(req, res) {
  const subscription = await organisationService.getSubscription();
  sendOk(res, {
    plan: subscription.plan,
    status: subscription.status,
    trialEndsAt: subscription.trialEndsAt,
    currentPeriodEnd: subscription.currentPeriodEnd,
    limits: subscription.limits,
  });
}

export async function uploadLogo(req, res) {
  sendOk(res, await organisationService.setLogo(req.file), { message: 'Logo updated' });
}

export async function getLogo(req, res) {
  const { buffer, mimeType } = await organisationService.getLogo();
  res.set({ 'Content-Type': mimeType, 'Cache-Control': 'private, max-age=300' }).send(buffer);
}

export async function removeLogo(req, res) {
  await organisationService.removeLogo();
  sendOk(res, null, { message: 'Logo removed' });
}
