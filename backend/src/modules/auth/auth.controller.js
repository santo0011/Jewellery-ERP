import { sendCreated, sendOk } from '../../utils/response.js';
import { PlatformAdmin } from '../platform/platformAdmin.model.js';
import { platformLogin } from '../platform/platformAuth.service.js';
import * as authService from './auth.service.js';
import { clearRefreshCookie, REFRESH_COOKIE, setPlatformRefreshCookie, setRefreshCookie } from './token.service.js';

const requestMeta = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') ?? null, requestId: req.id });

function issueTokens(res, { accessToken, refreshToken, rememberMe }) {
  setRefreshCookie(res, refreshToken, rememberMe);
  return { accessToken };
}

export async function register(req, res) {
  const tokens = await authService.registerOrganisation(req.valid.body, requestMeta(req));
  sendCreated(res, issueTokens(res, tokens));
}

/** One sign-in form for everyone: Super Admin emails open a platform session, all others a tenant session. */
export async function login(req, res) {
  const { email, password } = req.valid.body;
  if (await PlatformAdmin.exists({ email })) {
    const { accessToken, refreshToken } = await platformLogin({ email, password }, requestMeta(req));
    setPlatformRefreshCookie(res, refreshToken);
    return sendOk(res, { accessToken, realm: 'platform' });
  }
  const tokens = await authService.login(req.valid.body, requestMeta(req));
  sendOk(res, { ...issueTokens(res, tokens), realm: 'tenant' });
}

export async function refresh(req, res) {
  try {
    const tokens = await authService.refresh(req.cookies?.[REFRESH_COOKIE], requestMeta(req));
    sendOk(res, issueTokens(res, tokens));
  } catch (err) {
    clearRefreshCookie(res);
    throw err;
  }
}

export async function logout(req, res) {
  await authService.logout(req.cookies?.[REFRESH_COOKIE], requestMeta(req));
  clearRefreshCookie(res);
  sendOk(res, null, { message: 'Signed out' });
}

export async function logoutAll(req, res) {
  await authService.logoutAll(req.auth.userId);
  clearRefreshCookie(res);
  sendOk(res, null, { message: 'Signed out from all devices' });
}

export async function forgotPassword(req, res) {
  await authService.forgotPassword(req.valid.body.email);
  sendOk(res, null, { message: 'If an account exists for this email, a reset link has been sent.' });
}

export async function resetPassword(req, res) {
  await authService.resetPassword(req.valid.body, requestMeta(req));
  sendOk(res, null, { message: 'Password updated. Please sign in.' });
}

export async function changePassword(req, res) {
  const result = await authService.changePassword(req.auth.userId, req.auth.sessionId, req.valid.body);
  sendOk(res, result, { message: 'Password changed. Other devices have been signed out.' });
}

export async function me(req, res) {
  sendOk(res, await authService.getMe(req.auth));
}

export async function updateProfile(req, res) {
  sendOk(res, await authService.updateProfile(req.auth.userId, req.valid.body), { message: 'Profile updated' });
}

export async function listSessions(req, res) {
  sendOk(res, await authService.listSessions(req.auth.userId, req.auth.sessionId));
}

export async function revokeSession(req, res) {
  await authService.revokeSession(req.auth.userId, req.valid.params.id);
  sendOk(res, null, { message: 'Session revoked' });
}
