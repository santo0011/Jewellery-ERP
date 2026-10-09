import bcrypt from 'bcryptjs';
import { expandPermissions, ORG_STATUS, USER_STATUS } from '@jerp/shared';
import { env } from '../../config/env.js';
import { withTransaction } from '../../config/db.js';
import { AUDIT_ACTIONS, recordAudit } from '../../core/audit/audit.service.js';
import { sendEmail } from '../../core/notifications/email.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { randomToken, safeEqualHex, sha256 } from '../../utils/crypto.js';
import { Branch } from '../branches/branch.model.js';
import { Organisation } from '../organisations/organisation.model.js';
import { organisationDeactivated } from '../organisations/organisationAccess.js';
import { onboardOrganisation } from '../organisations/organisation.service.js';
import { Subscription } from '../organisations/subscription.model.js';
import { effectiveSubscription } from '../billing/limits.js';
import { Role } from '../roles/role.model.js';
import { getSettings } from '../settings/settings.service.js';
import { assertEmailAvailable } from '../users/emailAvailability.js';
import { User } from '../users/user.model.js';
import { Session } from './session.model.js';
import {
  createRefreshSecret,
  decodeRefreshToken,
  encodeRefreshToken,
  refreshTtlDays,
  signAccessToken,
} from './token.service.js';

const SKIP = { skipTenant: true };
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', 10);

const hashPassword = (password) => bcrypt.hash(password, env.BCRYPT_ROUNDS);

const actorFrom = (user, meta) => ({ organisationId: String(user.organisationId), userId: String(user._id), ...meta });

async function openSession(user, { rememberMe = false, ip, userAgent }, session) {
  const { secret, hash } = createRefreshSecret();
  const [doc] = await Session.create(
    [
      {
        userId: user._id,
        organisationId: user.organisationId,
        tokenHash: hash,
        rememberMe,
        ip,
        userAgent,
        expiresAt: new Date(Date.now() + refreshTtlDays(rememberMe) * 24 * 60 * 60 * 1000),
      },
    ],
    { session },
  );
  return {
    accessToken: signAccessToken({ userId: user._id, organisationId: user.organisationId, sessionId: doc._id, tokenVersion: user.tokenVersion }),
    refreshToken: encodeRefreshToken(doc._id, secret),
    rememberMe,
  };
}

export async function registerOrganisation(input, meta) {
  if (!env.ALLOW_PUBLIC_SIGNUP) throw ApiError.forbidden('Self sign-up is disabled', 'SIGNUP_DISABLED');

  await assertEmailAvailable(input.email);

  const passwordHash = await hashPassword(input.password);
  return withTransaction(async (session) => {
    const { user } = await onboardOrganisation({ ...input, passwordHash }, session);
    return openSession(user, { ...meta, rememberMe: false }, session);
  });
}

export async function login({ email, password, rememberMe }, meta) {
  const user = await User.findOne({ email }).setOptions(SKIP).select('+passwordHash');

  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  const actor = actorFrom(user, meta);

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil - Date.now()) / 60000);
    throw new ApiError(423, 'ACCOUNT_LOCKED', `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const failed = user.failedLoginCount + 1;
    const lock = failed >= env.MAX_FAILED_LOGINS;
    await User.updateOne(
      { _id: user._id },
      lock
        ? { $set: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + env.LOCKOUT_MINUTES * 60000) } }
        : { $set: { failedLoginCount: failed } },
    ).setOptions(SKIP);
    await recordAudit({ action: AUDIT_ACTIONS.LOGIN_FAILED, module: 'auth', recordType: 'User', recordId: user._id, meta: { locked: lock } }, { actor });
    throw ApiError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }

  if (user.status !== USER_STATUS.ACTIVE) throw ApiError.unauthorized('Your account is disabled. Contact your administrator.', 'ACCOUNT_DISABLED');

  const organisation = await Organisation.findById(user.organisationId).select('status').lean();
  if (!organisation || organisation.status !== ORG_STATUS.ACTIVE) {
    throw organisationDeactivated();
  }

  await User.updateOne({ _id: user._id }, { $set: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } }).setOptions(SKIP);
  const tokens = await openSession(user, { ...meta, rememberMe });
  await recordAudit({ action: AUDIT_ACTIONS.LOGIN, module: 'auth', recordType: 'User', recordId: user._id }, { actor });
  return tokens;
}

export async function refresh(cookieValue, meta) {
  const decoded = decodeRefreshToken(cookieValue);
  if (!decoded) throw ApiError.unauthorized('Please sign in again', 'REFRESH_INVALID');

  const session = await Session.findById(decoded.sessionId);
  if (session?.revokedReason === 'organisation_deactivated') {
    const organisation = await Organisation.findById(session.organisationId).select('status').lean();
    if (organisation?.status !== ORG_STATUS.ACTIVE) throw organisationDeactivated();
  }
  if (!session || session.realm === 'platform' || session.revokedAt || session.expiresAt <= new Date()) {
    throw ApiError.unauthorized('Please sign in again', 'REFRESH_INVALID');
  }

  if (!safeEqualHex(sha256(decoded.secret), session.tokenHash)) {
    session.revokedAt = new Date();
    session.revokedReason = 'token_reuse';
    await session.save();
    await recordAudit(
      { action: AUDIT_ACTIONS.TOKEN_REUSE, module: 'auth', recordType: 'Session', recordId: session._id },
      { actor: { organisationId: String(session.organisationId), userId: String(session.userId), ...meta } },
    );
    throw ApiError.unauthorized('Please sign in again', 'REFRESH_REUSED');
  }

  const user = await User.findOne({ _id: session.userId, organisationId: session.organisationId }).setOptions(SKIP).lean();
  if (!user || user.status !== USER_STATUS.ACTIVE) throw ApiError.unauthorized('Please sign in again', 'REFRESH_INVALID');
  const organisation = await Organisation.findById(session.organisationId).select('status').lean();
  if (organisation?.status !== ORG_STATUS.ACTIVE) throw organisationDeactivated();

  const { secret, hash } = createRefreshSecret();
  const rotated = await Session.findOneAndUpdate(
    { _id: session._id, tokenHash: session.tokenHash, revokedAt: null },
    { $set: { tokenHash: hash, lastUsedAt: new Date(), ip: meta.ip, userAgent: meta.userAgent } },
    { returnDocument: 'after' },
  );
  if (!rotated) throw ApiError.unauthorized('Please sign in again', 'REFRESH_INVALID');

  return {
    accessToken: signAccessToken({ userId: user._id, organisationId: user.organisationId, sessionId: session._id, tokenVersion: user.tokenVersion }),
    refreshToken: encodeRefreshToken(session._id, secret),
    rememberMe: session.rememberMe,
  };
}

export async function logout(cookieValue, meta) {
  const decoded = decodeRefreshToken(cookieValue);
  if (!decoded) return;
  const session = await Session.findOneAndUpdate(
    { _id: decoded.sessionId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: 'logout' } },
  );
  if (session) {
    await recordAudit(
      { action: AUDIT_ACTIONS.LOGOUT, module: 'auth', recordType: 'Session', recordId: session._id },
      { actor: { organisationId: String(session.organisationId), userId: String(session.userId), ...meta } },
    );
  }
}

export async function logoutAll(userId) {
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
  await Session.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: 'logout_all' } });
  await recordAudit({ action: AUDIT_ACTIONS.SESSION_REVOKE, module: 'auth', recordType: 'User', recordId: userId, meta: { all: true } });
}

export async function forgotPassword(email) {
  const user = await User.findOne({ email, status: USER_STATUS.ACTIVE }).setOptions(SKIP).lean();
  if (!user) return;

  const token = randomToken(32);
  await User.updateOne(
    { _id: user._id },
    { $set: { passwordReset: { tokenHash: sha256(token), expiresAt: new Date(Date.now() + env.PASSWORD_RESET_MINUTES * 60000) } } },
  ).setOptions(SKIP);

  await sendEmail({
    to: user.email,
    template: 'passwordReset',
    data: { name: user.name, link: `${env.APP_URL}/reset-password?token=${token}`, minutes: env.PASSWORD_RESET_MINUTES },
  });
}

export async function resetPassword({ token, password }, meta) {
  const user = await User.findOne({ 'passwordReset.tokenHash': sha256(token), 'passwordReset.expiresAt': { $gt: new Date() } })
    .setOptions(SKIP)
    .lean();
  if (!user) throw ApiError.badRequest('This reset link is invalid or has expired', undefined, 'RESET_INVALID');

  await withTransaction(async (session) => {
    await User.updateOne(
      { _id: user._id },
      {
        $set: { passwordHash: await hashPassword(password), passwordChangedAt: new Date(), passwordReset: null, failedLoginCount: 0, lockedUntil: null, mustChangePassword: false },
        $inc: { tokenVersion: 1 },
      },
      { session },
    ).setOptions(SKIP);
    await Session.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: 'password_reset' } }, { session });
    await recordAudit({ action: AUDIT_ACTIONS.PASSWORD_RESET, module: 'auth', recordType: 'User', recordId: user._id }, { session, actor: actorFrom(user, meta) });
  });
}

export async function changePassword(userId, sessionId, { currentPassword, newPassword }) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) throw ApiError.notFound('User');
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw ApiError.badRequest('Current password is incorrect', [{ path: 'currentPassword', message: 'Current password is incorrect' }], 'VALIDATION_ERROR');
  }

  user.passwordHash = await hashPassword(newPassword);
  user.passwordChangedAt = new Date();
  user.tokenVersion += 1;
  user.mustChangePassword = false;

  await withTransaction(async (session) => {
    await user.save({ session });
    await Session.updateMany(
      { userId, _id: { $ne: sessionId }, revokedAt: null },
      { $set: { revokedAt: new Date(), revokedReason: 'password_change' } },
      { session },
    );
    await recordAudit({ action: AUDIT_ACTIONS.PASSWORD_CHANGE, module: 'auth', recordType: 'User', recordId: user._id }, { session });
  });

  return {
    accessToken: signAccessToken({ userId: user._id, organisationId: user.organisationId, sessionId, tokenVersion: user.tokenVersion }),
  };
}

export async function getMe(auth) {
  const [user, organisation, subscription] = await Promise.all([
    User.findById(auth.userId).select('name email mobile isOwner defaultBranchId roleIds branchAccess lastLoginAt mustChangePassword branchLoginFor').lean(),
    Organisation.findById(auth.organisationId).select('name legalName timezone currency address gstin logoFileId branchLimit').lean(),
    Subscription.findOne({}).lean(),
  ]);
  if (!user || !organisation) throw ApiError.unauthorized('Session is no longer valid', 'SESSION_INVALID');

  const branchFilter = { status: 'active' };
  if (!auth.branchAccess.all) branchFilter._id = { $in: auth.branchAccess.branchIds };

  const [roles, branches, settings] = await Promise.all([
    Role.find({ _id: { $in: user.roleIds } }).select('key name').lean(),
    Branch.find(branchFilter).select('code name isHeadOffice').sort({ isHeadOffice: -1, name: 1 }).lean(),
    getSettings(),
  ]);

  return {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      isOwner: user.isOwner,
      defaultBranchId: user.defaultBranchId,
      allBranches: Boolean(user.branchAccess?.all),
      lastLoginAt: user.lastLoginAt,
      mustChangePassword: Boolean(user.mustChangePassword),
      branchLogin: Boolean(user.branchLoginFor),
      roles: roles.map((r) => ({ id: r._id, key: r.key, name: r.name })),
    },
    organisation: {
      id: organisation._id,
      name: organisation.name,
      legalName: organisation.legalName,
      gstin: organisation.gstin,
      timezone: organisation.timezone,
      currency: organisation.currency,
      stateCode: organisation.address?.stateCode ?? null,
      hasLogo: Boolean(organisation.logoFileId),
      branchLimit: organisation.branchLimit,
    },
    subscription: subscription && (() => {
      const eff = effectiveSubscription(subscription);
      return { plan: subscription.plan, planName: subscription.planName ?? subscription.plan, status: eff.status, expired: eff.expired, daysLeft: eff.daysLeft, endsAt: eff.endsAt, trialEndsAt: subscription.trialEndsAt };
    })(),
    permissions: expandPermissions(auth.permissions),
    activeBranchId: auth.branchId,
    branches: branches.map((b) => ({ id: b._id, code: b.code, name: b.name, isHeadOffice: b.isHeadOffice })),
    catalog: {
      enabledPurities: settings.jewellery.enabledPurities,
      defaultWastageMode: settings.jewellery.defaultWastageMode,
      defaultMakingChargeType: settings.jewellery.defaultMakingChargeType,
      huidMandatory: settings.jewellery.huidMandatory,
      barcodeSymbology: settings.barcode.symbology,
    },
  };
}

export async function updateProfile(userId, input) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User');
  const changes = ['name', 'mobile'].filter((f) => user[f] !== input[f]).map((f) => ({ field: f, from: user[f], to: input[f] }));
  if (changes.length) {
    user.set(input);
    await user.save();
    await recordAudit({ action: AUDIT_ACTIONS.UPDATE, module: 'user', recordType: 'User', recordId: user._id, changes });
  }
  return { id: user._id, name: user.name, email: user.email, mobile: user.mobile };
}

export async function listSessions(userId, currentSessionId) {
  const sessions = await Session.find({ userId, revokedAt: null, expiresAt: { $gt: new Date() } })
    .select('userAgent ip createdAt lastUsedAt expiresAt rememberMe')
    .sort({ lastUsedAt: -1 })
    .lean();
  return sessions.map((s) => ({
    id: s._id,
    userAgent: s.userAgent,
    ip: s.ip,
    createdAt: s.createdAt,
    lastUsedAt: s.lastUsedAt,
    expiresAt: s.expiresAt,
    current: String(s._id) === String(currentSessionId),
  }));
}

export async function revokeSession(userId, sessionId) {
  const session = await Session.findOneAndUpdate(
    { _id: sessionId, userId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: 'revoked_by_user' } },
  );
  if (!session) throw ApiError.notFound('Session');
  await recordAudit({ action: AUDIT_ACTIONS.SESSION_REVOKE, module: 'auth', recordType: 'Session', recordId: session._id });
}
