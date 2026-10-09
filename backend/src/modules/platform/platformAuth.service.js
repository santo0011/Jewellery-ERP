import bcrypt from 'bcryptjs';
import { PLATFORM_ROLES } from '@jerp/shared';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { safeEqualHex, sha256 } from '../../utils/crypto.js';
import { Session } from '../auth/session.model.js';
import { createRefreshSecret, decodeRefreshToken, encodeRefreshToken, signPlatformToken, verifyPlatformToken } from '../auth/token.service.js';
import { PlatformAdmin, PlatformAudit } from './platformAdmin.model.js';

const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', 10);
const invalid = () => ApiError.unauthorized('Please sign in again', 'REFRESH_INVALID');

export const recordPlatformAudit = (entry, meta = {}) => PlatformAudit.create({ ...entry, ip: meta.ip, userAgent: meta.userAgent });

async function openSession(admin, meta) {
  const { secret, hash } = createRefreshSecret();
  const session = await Session.create({
    realm: 'platform',
    userId: admin._id,
    organisationId: null,
    tokenHash: hash,
    ip: meta.ip,
    userAgent: meta.userAgent,
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 86400000),
  });
  return {
    accessToken: signPlatformToken({ adminId: admin._id, sessionId: session._id, tokenVersion: admin.tokenVersion }),
    refreshToken: encodeRefreshToken(session._id, secret),
  };
}

export async function platformLogin({ email, password }, meta) {
  const admin = await PlatformAdmin.findOne({ email }).select('+passwordHash');
  if (!admin) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }
  if (admin.lockedUntil && admin.lockedUntil > new Date()) throw new ApiError(423, 'ACCOUNT_LOCKED', 'Too many failed attempts. Try again later.');
  if (!(await bcrypt.compare(password, admin.passwordHash))) {
    const failed = admin.failedLoginCount + 1;
    const lock = failed >= env.MAX_FAILED_LOGINS;
    await PlatformAdmin.updateOne({ _id: admin._id }, lock ? { $set: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + env.LOCKOUT_MINUTES * 60000) } } : { $set: { failedLoginCount: failed } });
    await recordPlatformAudit({ adminId: admin._id, action: 'login_failed' }, meta);
    throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }
  if (admin.status !== 'active') throw ApiError.unauthorized('This account is disabled', 'ACCOUNT_DISABLED');
  await PlatformAdmin.updateOne({ _id: admin._id }, { $set: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
  await recordPlatformAudit({ adminId: admin._id, action: 'login' }, meta);
  return openSession(admin, meta);
}

export async function platformRefresh(cookieValue, meta) {
  const decoded = decodeRefreshToken(cookieValue);
  if (!decoded) throw invalid();
  const session = await Session.findOne({ _id: decoded.sessionId, realm: 'platform' });
  if (!session || session.revokedAt || session.expiresAt <= new Date()) throw invalid();
  if (!safeEqualHex(sha256(decoded.secret), session.tokenHash)) {
    await Session.updateOne({ _id: session._id }, { $set: { revokedAt: new Date(), revokedReason: 'token_reuse' } });
    await recordPlatformAudit({ adminId: session.userId, action: 'token_reuse' }, meta);
    throw ApiError.unauthorized('Please sign in again', 'REFRESH_REUSED');
  }
  const admin = await PlatformAdmin.findById(session.userId).lean();
  if (!admin || admin.status !== 'active') throw invalid();

  const { secret, hash } = createRefreshSecret();
  const rotated = await Session.findOneAndUpdate({ _id: session._id, tokenHash: session.tokenHash, revokedAt: null }, { $set: { tokenHash: hash, lastUsedAt: new Date() } });
  if (!rotated) throw invalid();
  return {
    accessToken: signPlatformToken({ adminId: admin._id, sessionId: session._id, tokenVersion: admin.tokenVersion }),
    refreshToken: encodeRefreshToken(session._id, secret),
  };
}

export async function platformLogout(cookieValue) {
  const decoded = decodeRefreshToken(cookieValue);
  if (decoded) await Session.updateOne({ _id: decoded.sessionId, realm: 'platform', revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: 'logout' } });
}

export async function authenticatePlatformToken(header) {
  if (!header?.startsWith('Bearer ')) throw ApiError.unauthorized();
  let payload;
  try {
    payload = verifyPlatformToken(header.slice(7));
  } catch (err) {
    if (err.name === 'TokenExpiredError') throw ApiError.unauthorized('Session expired', 'TOKEN_EXPIRED');
    throw ApiError.unauthorized('Invalid token', 'INVALID_TOKEN');
  }
  const [admin, session] = await Promise.all([
    PlatformAdmin.findById(payload.sub).lean(),
    Session.findOne({ _id: payload.sid, realm: 'platform', revokedAt: null, expiresAt: { $gt: new Date() } }).select('_id').lean(),
  ]);
  if (!admin || !session || admin.tokenVersion !== payload.tv || admin.status !== 'active') throw ApiError.unauthorized('Session is no longer valid', 'SESSION_INVALID');
  return { adminId: admin._id, name: admin.name, email: admin.email, role: admin.role, sessionId: session._id };
}

export async function createPlatformAdmin({ name, email, password, role = PLATFORM_ROLES.SUPER_ADMIN }) {
  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
  return PlatformAdmin.create({ name, email, passwordHash, role });
}
