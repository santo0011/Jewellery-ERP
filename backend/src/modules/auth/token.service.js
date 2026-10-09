import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { randomToken, sha256 } from '../../utils/crypto.js';

const ISSUER = 'jewellery-erp';
const TENANT_AUDIENCE = 'tenant';

export const REFRESH_COOKIE = 'jerp_rt';
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

export function signAccessToken({ userId, organisationId, sessionId, tokenVersion }) {
  return jwt.sign({ org: String(organisationId), sid: String(sessionId), tv: tokenVersion }, env.JWT_ACCESS_SECRET, {
    subject: String(userId),
    audience: TENANT_AUDIENCE,
    issuer: ISSUER,
    expiresIn: env.ACCESS_TOKEN_TTL,
    algorithm: 'HS256',
  });
}

export const verifyAccessToken = (token) =>
  jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'], audience: TENANT_AUDIENCE, issuer: ISSUER });

export function createRefreshSecret() {
  const secret = randomToken(32);
  return { secret, hash: sha256(secret) };
}

export const encodeRefreshToken = (sessionId, secret) => `${sessionId}.${secret}`;

export function decodeRefreshToken(value) {
  if (typeof value !== 'string') return null;
  const [sessionId, secret] = value.split('.');
  if (!/^[a-f\d]{24}$/i.test(sessionId ?? '') || !secret) return null;
  return { sessionId, secret };
}

export const refreshTtlDays = (rememberMe) => (rememberMe ? env.REFRESH_TOKEN_REMEMBER_DAYS : env.REFRESH_TOKEN_DAYS);

export function setRefreshCookie(res, value, rememberMe) {
  res.cookie(REFRESH_COOKIE, value, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    maxAge: refreshTtlDays(rememberMe) * 24 * 60 * 60 * 1000,
  });
}

export function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'strict', path: REFRESH_COOKIE_PATH });
}

const PLATFORM_AUDIENCE = 'platform';
export const PLATFORM_REFRESH_COOKIE = 'jerp_prt';
export const PLATFORM_REFRESH_COOKIE_PATH = '/api/v1/platform/auth';

export function signPlatformToken({ adminId, sessionId, tokenVersion }) {
  return jwt.sign({ sid: String(sessionId), tv: tokenVersion }, env.JWT_ACCESS_SECRET, {
    subject: String(adminId),
    audience: PLATFORM_AUDIENCE,
    issuer: ISSUER,
    expiresIn: env.ACCESS_TOKEN_TTL,
    algorithm: 'HS256',
  });
}

export const verifyPlatformToken = (token) =>
  jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'], audience: PLATFORM_AUDIENCE, issuer: ISSUER });

export function setPlatformRefreshCookie(res, value) {
  res.cookie(PLATFORM_REFRESH_COOKIE, value, {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'strict',
    path: PLATFORM_REFRESH_COOKIE_PATH,
    maxAge: env.REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearPlatformRefreshCookie(res) {
  res.clearCookie(PLATFORM_REFRESH_COOKIE, { httpOnly: true, secure: env.COOKIE_SECURE, sameSite: 'strict', path: PLATFORM_REFRESH_COOKIE_PATH });
}
