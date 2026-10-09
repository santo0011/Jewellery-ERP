import { sendCreated, sendOk } from '../../utils/response.js';
import { clearPlatformRefreshCookie, PLATFORM_REFRESH_COOKIE, setPlatformRefreshCookie } from '../auth/token.service.js';
import * as platformAuth from './platformAuth.service.js';
import * as platformService from './platform.service.js';

const meta = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') ?? null });

export async function authenticatePlatform(req, res, next) {
  req.platformAdmin = await platformAuth.authenticatePlatformToken(req.get('authorization'));
  next();
}

export async function refresh(req, res) {
  try {
    const { accessToken, refreshToken } = await platformAuth.platformRefresh(req.cookies?.[PLATFORM_REFRESH_COOKIE], meta(req));
    setPlatformRefreshCookie(res, refreshToken);
    sendOk(res, { accessToken });
  } catch (err) {
    clearPlatformRefreshCookie(res);
    throw err;
  }
}

export async function logout(req, res) {
  await platformAuth.platformLogout(req.cookies?.[PLATFORM_REFRESH_COOKIE]);
  clearPlatformRefreshCookie(res);
  sendOk(res, null, { message: 'Signed out' });
}

export const me = (req, res) => {
  const { adminId, name, email, role } = req.platformAdmin;
  sendOk(res, { id: adminId, name, email, role });
};

export const dashboard = async (req, res) => sendOk(res, await platformService.platformDashboard());

export async function list(req, res) {
  const { items, meta: m } = await platformService.listOrganisations(req.valid.query);
  sendOk(res, items, { meta: m });
}

export const get = async (req, res) => sendOk(res, await platformService.getOrganisation(req.valid.params.id));

export async function create(req, res) {
  const org = await platformService.createOrganisation(req.valid.body, req.platformAdmin, meta(req));
  sendCreated(res, org, { message: `${org.name} created` });
}

export async function update(req, res) {
  const org = await platformService.updateOrganisation(req.valid.params.id, req.valid.body, req.platformAdmin, meta(req));
  sendOk(res, org, { message: `${org.name} updated` });
}

export async function remove(req, res) {
  const org = await platformService.deleteOrganisation(req.valid.params.id, req.platformAdmin, meta(req));
  sendOk(res, org, { message: `${org.name} deleted` });
}

export async function setBranchLimit(req, res) {
  sendOk(res, await platformService.setBranchLimit(req.valid.params.id, req.valid.body.branchLimit, req.platformAdmin, meta(req)), { message: 'Branch limit updated' });
}

export async function setStatus(req, res) {
  const org = await platformService.setOrganisationStatus(req.valid.params.id, req.valid.body.status, req.platformAdmin, meta(req));
  sendOk(res, org, { message: org.status === 'active' ? 'Organisation activated' : 'Organisation suspended' });
}
