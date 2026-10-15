import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { expandPermissions, ORG_STATUS, USER_STATUS } from '@jerp/shared';
import { env } from '../../config/env.js';
import { withTransaction } from '../../config/db.js';
import { AUDIT_ACTIONS, recordAudit } from '../../core/audit/audit.service.js';
import { trySendEmail } from '../../core/notifications/email.service.js';
import { PlatformAdmin } from '../platform/platformAdmin.model.js';
import { recordPlatformAudit } from '../platform/platformAuth.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { safeEqualHex, sha256 } from '../../utils/crypto.js';
import { Branch } from '../branches/branch.model.js';
import { sharedBranchModules } from '../inventory/inventory.helpers.js';
import { Organisation } from '../organisations/organisation.model.js';
import { organisationDeactivated } from '../organisations/organisationAccess.js';
import { onboardOrganisation } from '../organisations/organisation.service.js';
import { Subscription } from '../organisations/subscription.model.js';
import { effectiveSubscription, limitsOf } from '../billing/limits.js';
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

async function openSession(user, { rememberMe = false, ip, userAgent, via = 'password' }, session) {
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
        signedInWith: via,
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

// ---------------------------------------------------------------- forgot password (6-digit emailed code)

const RESET_MAX_TRIES = 5;
const RESET_RESEND_SECONDS = 60;
const resetHash = (accountId, otp) => sha256(`password-reset:${accountId}:${otp}`);

/** The account that signs in with this email — an organisation user or a Super Admin — with its reset state. */
async function resetAccount(email) {
  const user = await User.findOne({ email, status: USER_STATUS.ACTIVE }).setOptions(SKIP).select('+passwordReset').lean();
  if (user) return { kind: 'user', doc: user, model: User };
  const admin = await PlatformAdmin.findOne({ email, status: 'active' }).lean();
  return admin ? { kind: 'admin', doc: admin, model: PlatformAdmin } : null;
}
const updateAccount = (acct, update, opts) => (acct.kind === 'user' ? User.updateOne({ _id: acct.doc._id }, update, opts).setOptions(SKIP) : PlatformAdmin.updateOne({ _id: acct.doc._id }, update, opts));

/**
 * Emails a 6-digit code (digits only) to whoever signs in with this address. Says nothing about whether the address
 * exists, and a mail failure is only logged — the answer is the same either way. A new code replaces the old one;
 * asking again within a minute does not send another.
 */
export async function forgotPassword(email) {
  const acct = await resetAccount(email);
  if (!acct) return;
  const sentAt = acct.doc.passwordReset?.sentAt;
  if (sentAt && Date.now() - new Date(sentAt).getTime() < RESET_RESEND_SECONDS * 1000) return;

  const otp = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const passwordReset = { tokenHash: resetHash(acct.doc._id, otp), expiresAt: new Date(Date.now() + env.PASSWORD_RESET_MINUTES * 60000), attempts: 0, sentAt: new Date() };
  await updateAccount(acct, { $set: { passwordReset } });
  await trySendEmail({ to: acct.doc.email, template: 'passwordReset', data: { name: acct.doc.name, otp, minutes: env.PASSWORD_RESET_MINUTES } });
}

/**
 * Checks a reset code. A wrong code uses up one of RESET_MAX_TRIES; after that (or once expired) a new code is
 * needed. Unknown emails get the same answer as a wrong code.
 */
async function checkResetCode(email, otp) {
  const acct = await resetAccount(email);
  const reset = acct?.doc.passwordReset;
  if (!reset?.tokenHash || !reset.expiresAt || new Date(reset.expiresAt) < new Date()) {
    throw ApiError.badRequest('This code is wrong or has expired. Request a new one.', [{ path: 'otp', message: 'Wrong or expired code' }], 'RESET_EXPIRED');
  }
  if ((reset.attempts ?? 0) >= RESET_MAX_TRIES) {
    throw ApiError.badRequest('Too many wrong tries. Request a new code.', [{ path: 'otp', message: 'Request a new code' }], 'RESET_LOCKED');
  }
  if (!safeEqualHex(resetHash(acct.doc._id, otp), reset.tokenHash)) {
    await updateAccount(acct, { $inc: { 'passwordReset.attempts': 1 } });
    const left = RESET_MAX_TRIES - (reset.attempts ?? 0) - 1;
    throw ApiError.badRequest(
      left > 0 ? `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.` : 'Too many wrong tries. Request a new code.',
      [{ path: 'otp', message: 'Wrong code' }],
      left > 0 ? 'RESET_INVALID' : 'RESET_LOCKED',
    );
  }
  return acct;
}

/** Step 2: is the code right? (Leaves it valid for step 3.) */
export async function verifyResetCode({ email, otp }) {
  await checkResetCode(email, otp);
}

/**
 * Forgot password → signed in with the emailed code (no new password needed; it can be changed later from the
 * profile). The code is used up. Returns the tenant tokens, or `{ admin }` for a Super Admin (whose platform
 * session the controller opens).
 */
export async function signInWithResetCode({ email, otp }, meta) {
  const acct = await checkResetCode(email, otp);
  const usedUp = { tokenHash: null, expiresAt: null, attempts: 0, sentAt: null };

  if (acct.kind === 'admin') {
    await PlatformAdmin.updateOne({ _id: acct.doc._id }, { $set: { passwordReset: usedUp, failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } });
    return { admin: acct.doc };
  }

  const user = acct.doc;
  const organisation = await Organisation.findById(user.organisationId).select('status').lean();
  if (!organisation || organisation.status !== ORG_STATUS.ACTIVE) throw organisationDeactivated();
  await User.updateOne({ _id: user._id }, { $set: { passwordReset: null, failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() } }).setOptions(SKIP);
  const tokens = await openSession(user, { ...meta, rememberMe: false, via: 'code' });
  await recordAudit({ action: AUDIT_ACTIONS.LOGIN, module: 'auth', recordType: 'User', recordId: user._id, meta: { via: 'Emailed code' } }, { actor: actorFrom(user, meta) });
  return tokens;
}

/** Step 3: the code again and the new password. Every session of the account is signed out. */
export async function resetPassword({ email, otp, password }, meta) {
  const acct = await checkResetCode(email, otp);
  const passwordHash = await hashPassword(password);

  if (acct.kind === 'admin') {
    await PlatformAdmin.updateOne(
      { _id: acct.doc._id },
      { $set: { passwordHash, passwordReset: { tokenHash: null, expiresAt: null, attempts: 0, sentAt: null }, failedLoginCount: 0, lockedUntil: null }, $inc: { tokenVersion: 1 } },
    );
    await Session.updateMany({ userId: acct.doc._id, realm: 'platform', revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: 'password_reset' } });
    await recordPlatformAudit({ adminId: acct.doc._id, action: 'password_reset' }, meta);
    return;
  }

  const user = acct.doc;
  await withTransaction(async (session) => {
    await User.updateOne(
      { _id: user._id },
      {
        $set: { passwordHash, passwordChangedAt: new Date(), passwordReset: null, failedLoginCount: 0, lockedUntil: null, mustChangePassword: false },
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
  // Signed in with an emailed code (forgot password), or just signed in with the temporary password they must replace
  // (a new organisation or user): who they are is already proved, so the current password is not asked again.
  const current = await Session.findById(sessionId).select('signedInWith').lean();
  if (current?.signedInWith !== 'code' && !user.mustChangePassword) {
    if (!currentPassword) throw ApiError.badRequest('Current password is required', [{ path: 'currentPassword', message: 'Current password is required' }], 'VALIDATION_ERROR');
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw ApiError.badRequest('Current password is incorrect', [{ path: 'currentPassword', message: 'Current password is incorrect' }], 'VALIDATION_ERROR');
    }
  }

  if (user.mustChangePassword && (await bcrypt.compare(newPassword, user.passwordHash))) {
    throw ApiError.badRequest('Choose a password different from the temporary one', [{ path: 'newPassword', message: 'Same as the temporary password' }], 'VALIDATION_ERROR');
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
    // From now on this session is an ordinary one: the next change asks for the (new) current password.
    await Session.updateOne(
      { _id: sessionId },
      { $set: { signedInWith: 'password' } },
      { session },
    );
    await recordAudit({ action: AUDIT_ACTIONS.PASSWORD_CHANGE, module: 'auth', recordType: 'User', recordId: user._id }, { session });
  });

  return {
    accessToken: signAccessToken({ userId: user._id, organisationId: user.organisationId, sessionId, tokenVersion: user.tokenVersion }),
  };
}

export async function getMe(auth) {
  const [user, currentSession, organisation, subscription] = await Promise.all([
    User.findById(auth.userId).select('name email mobile isOwner defaultBranchId roleIds branchAccess lastLoginAt mustChangePassword branchLoginFor').lean(),
    Session.findById(auth.sessionId).select('signedInWith').lean(),
    Organisation.findById(auth.organisationId).select('name legalName timezone currency address gstin logoFileId').lean(),
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
      allBranches: Boolean(auth.branchAccess.all), // as enforced (a branch login never has all branches)
      lastLoginAt: user.lastLoginAt,
      mustChangePassword: Boolean(user.mustChangePassword),
      signedInWithCode: currentSession?.signedInWith === 'code', // can set a new password without the old one
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
      logoVersion: organisation.logoFileId ? String(organisation.logoFileId) : null, // changes on every upload: refreshes cached logo images
      branchLimit: limitsOf(subscription).branches, // from the plan (2 on a free trial); null = unlimited
    },
    subscription: subscription && (() => {
      const eff = effectiveSubscription(subscription);
      return { plan: subscription.plan, planName: subscription.planName ?? subscription.plan, status: eff.status, expired: eff.expired, daysLeft: eff.daysLeft, endsAt: eff.endsAt, trialEndsAt: subscription.trialEndsAt };
    })(),
    permissions: expandPermissions(auth.permissions),
    activeBranchId: auth.branchId,
    // Modules opened to at least one other branch: their list pages show the navbar branch filter.
    branchModules: [...(await sharedBranchModules())],
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
