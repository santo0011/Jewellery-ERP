import bcrypt from 'bcryptjs';
import { PLATFORM_ROLES } from '@jerp/shared';
import { env } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { safeEqualHex, sha256 } from '../../utils/crypto.js';
import { Session } from '../auth/session.model.js';
import { createRefreshSecret, decodeRefreshToken, encodeRefreshToken, signPlatformToken, verifyPlatformToken } from '../auth/token.service.js';
import { assertEmailAvailable } from '../users/emailAvailability.js';
import { PlatformUndoAction } from '../../core/undo/platformUndoAction.model.js';
import { PlatformAdmin, PlatformAudit } from './platformAdmin.model.js';

const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', 10);
const invalid = () => ApiError.unauthorized('Please sign in again', 'REFRESH_INVALID');

/**
 * Records a Super Admin action. `entry.undo` ({ type, label?, data?, recordType?, recordId? }) also puts it on the
 * platform's Undo stack (see platformUndo.service.js) — except actions an undo itself does (meta.undoRun).
 */
export async function recordPlatformAudit({ undo, ...entry }, meta = {}) {
  const audit = await PlatformAudit.create({ ...entry, ip: meta.ip, userAgent: meta.userAgent });
  if (undo && !meta.undoRun) {
    await PlatformUndoAction.create({
      type: undo.type,
      recordType: undo.recordType ?? null,
      recordId: undo.recordId ?? entry.organisationId ?? null,
      organisationId: entry.organisationId ?? null,
      label: undo.label ?? null,
      data: undo.data,
      auditId: audit._id,
      createdByAdminId: entry.adminId ?? null,
    });
  }
  return audit;
}

async function openSession(admin, meta, signedInWith = 'password') {
  const { secret, hash } = createRefreshSecret();
  const session = await Session.create({
    realm: 'platform',
    userId: admin._id,
    organisationId: null,
    tokenHash: hash,
    ip: meta.ip,
    userAgent: meta.userAgent,
    signedInWith,
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

/** A Super Admin signed in with an emailed code (forgot password): a new platform session. */
export async function platformCodeSignIn(admin, meta) {
  await recordPlatformAudit({ adminId: admin._id, action: 'login' }, meta);
  return openSession(admin, meta, 'code');
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
    Session.findOne({ _id: payload.sid, realm: 'platform', revokedAt: null, expiresAt: { $gt: new Date() } }).select('_id signedInWith').lean(),
  ]);
  if (!admin || !session || admin.tokenVersion !== payload.tv || admin.status !== 'active') throw ApiError.unauthorized('Session is no longer valid', 'SESSION_INVALID');
  return { adminId: admin._id, name: admin.name, email: admin.email, role: admin.role, language: admin.language ?? null, sessionId: session._id, signedInWithCode: session.signedInWith === 'code' };
}

// ---------------------------------------------------------------- the Super Admin's own profile

const profileOf = (admin, signedInWithCode) => ({
  id: admin._id,
  name: admin.name,
  email: admin.email,
  role: admin.role,
  lastLoginAt: admin.lastLoginAt,
  passwordChangedAt: admin.passwordChangedAt ?? null,
  createdAt: admin.createdAt,
  // Signed in with an emailed code (forgot password): a new password can be set without the old one.
  signedInWithCode: Boolean(signedInWithCode),
});

async function checkPassword(admin, currentPassword) {
  if (!currentPassword) throw ApiError.badRequest('Enter your current password', [{ path: 'currentPassword', message: 'Required' }], 'VALIDATION_ERROR');
  if (!(await bcrypt.compare(currentPassword, admin.passwordHash))) throw ApiError.badRequest('Current password is wrong', [{ path: 'currentPassword', message: 'Current password is wrong' }], 'WRONG_PASSWORD');
}

export async function getPlatformProfile({ adminId, signedInWithCode }) {
  const admin = await PlatformAdmin.findById(adminId).lean();
  if (!admin) throw ApiError.notFound('Account');
  return profileOf(admin, signedInWithCode);
}

/** Saves the language the Super Admin picked for the panel. */
export async function setPlatformLanguage({ adminId }, language) {
  await PlatformAdmin.updateOne({ _id: adminId }, { $set: { language } });
  return { language };
}

/** Name and email. A new email needs the current password (not when signed in with an emailed code). */
export async function updatePlatformProfile({ adminId, signedInWithCode }, { name, email, currentPassword }, meta) {
  const admin = await PlatformAdmin.findById(adminId).select('+passwordHash');
  if (!admin) throw ApiError.notFound('Account');
  const changes = {};
  if (name !== admin.name) changes.name = { from: admin.name, to: name };
  if (email !== admin.email) {
    if (!signedInWithCode) await checkPassword(admin, currentPassword);
    await assertEmailAvailable(email);
    changes.email = { from: admin.email, to: email };
  }
  if (!Object.keys(changes).length) return profileOf(admin.toObject(), signedInWithCode);
  admin.set({ name, email });
  await admin.save();
  await recordPlatformAudit({ adminId: admin._id, action: 'profile_update', changes }, meta);
  return profileOf(admin.toObject(), signedInWithCode);
}

/**
 * New password. Every other device is signed out; this one stays signed in with a fresh token (returned).
 * The current password is needed unless this session was opened with an emailed code.
 */
export async function changePlatformPassword({ adminId, sessionId, signedInWithCode }, { currentPassword, newPassword }, meta) {
  const admin = await PlatformAdmin.findById(adminId).select('+passwordHash');
  if (!admin) throw ApiError.notFound('Account');
  if (!signedInWithCode) await checkPassword(admin, currentPassword);
  if (await bcrypt.compare(newPassword, admin.passwordHash)) throw ApiError.badRequest('Choose a password different from the current one', [{ path: 'newPassword', message: 'Same as the current password' }], 'VALIDATION_ERROR');
  admin.set({ passwordHash: await bcrypt.hash(newPassword, env.BCRYPT_ROUNDS), passwordChangedAt: new Date(), tokenVersion: admin.tokenVersion + 1, failedLoginCount: 0, lockedUntil: null, passwordReset: { tokenHash: null, expiresAt: null, attempts: 0, sentAt: null } });
  await admin.save();
  await Promise.all([
    Session.updateMany({ realm: 'platform', userId: admin._id, _id: { $ne: sessionId }, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: 'password_changed' } }),
    Session.updateOne({ _id: sessionId }, { $set: { signedInWith: 'password' } }),
  ]);
  await recordPlatformAudit({ adminId: admin._id, action: 'password_change' }, meta);
  return { accessToken: signPlatformToken({ adminId: admin._id, sessionId, tokenVersion: admin.tokenVersion }), profile: profileOf(admin.toObject(), false) };
}

export async function createPlatformAdmin({ name, email, password, role = PLATFORM_ROLES.SUPER_ADMIN }) {
  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
  return PlatformAdmin.create({ name, email, passwordHash, role });
}
