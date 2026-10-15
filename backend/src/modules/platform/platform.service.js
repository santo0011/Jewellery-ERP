import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { randomInt } from 'node:crypto';
import { trySendEmail } from '../../core/notifications/email.service.js';
import { ADDRESS_FIELDS, BRANCH_STATUS, ORG_STATUS, SUBSCRIPTION_STATUS, USER_STATUS } from '@jerp/shared';
import { env } from '../../config/env.js';
import { withTransaction } from '../../config/db.js';
import { ApiError } from '../../utils/ApiError.js';
import { searchFilter } from '../../utils/pagination.js';
import { Branch } from '../branches/branch.model.js';
import { Organisation } from '../organisations/organisation.model.js';
import { Subscription } from '../organisations/subscription.model.js';
import { onboardOrganisation } from '../organisations/organisation.service.js';
import { copyToHeadOffice } from '../organisations/headOfficeAddress.js';
import { Session } from '../auth/session.model.js';
import { User } from '../users/user.model.js';
import { PlatformAdmin } from './platformAdmin.model.js';
import { recordPlatformAudit } from './platformAuth.service.js';
import { effectiveSubscription, limitsOf } from '../billing/limits.js';
import { periodStart } from '../billing/billing.service.js';
import { assertEmailAvailable } from '../users/emailAvailability.js';

const SKIP = { skipTenant: true };
const DAY = 86400000;

/** Free days, counted from the day the organisation was created; null once it is on a paid period. */
const freeDaysOf = (org, sub) =>
  sub?.status === SUBSCRIPTION_STATUS.TRIAL && sub.trialEndsAt ? Math.max(0, Math.round((new Date(sub.trialEndsAt) - new Date(org.createdAt)) / DAY)) : null;

async function countsByOrg(Model, match, orgIds) {
  const rows = await Model.aggregate([{ $match: { ...match, organisationId: { $in: orgIds } } }, { $group: { _id: '$organisationId', count: { $sum: 1 } } }]).option(SKIP);
  return new Map(rows.map((r) => [String(r._id), r.count]));
}

async function serializeMany(orgs) {
  const ids = orgs.map((o) => o._id);
  const [branches, users, owners, subscriptions, records] = await Promise.all([
    countsByOrg(Branch, { status: BRANCH_STATUS.ACTIVE }, ids),
    countsByOrg(User, { status: USER_STATUS.ACTIVE }, ids),
    User.find({ _id: { $in: orgs.map((o) => o.ownerUserId).filter(Boolean) } }).setOptions(SKIP).select('name email mobile lastLoginAt').lean(),
    Subscription.find({ organisationId: { $in: ids } }).setOptions(SKIP).lean(),
    recordsByOrg(ids),
  ]);
  const ownerById = new Map(owners.map((u) => [String(u._id), u]));
  const subscriptionByOrg = new Map(subscriptions.map((sub) => [String(sub.organisationId), sub]));
  return orgs.map((o) => {
    const used = branches.get(String(o._id)) ?? 0;
    const owner = ownerById.get(String(o.ownerUserId));
    // Limits come from the subscription: 2 branches on a free trial, else the plan's (null = unlimited).
    const limits = limitsOf(subscriptionByOrg.get(String(o._id)));
    return {
      id: o._id,
      name: o.name,
      slug: o.slug,
      status: o.status,
      gstin: o.gstin,
      email: o.email,
      phone: o.phone,
      stateCode: o.address?.stateCode ?? null,
      address: o.address ?? null,
      branchLimit: limits.branches,
      branchesUsed: used,
      branchesAvailable: limits.branches == null ? null : Math.max(0, limits.branches - used),
      activeUsers: users.get(String(o._id)) ?? 0,
      plan: subscriptionByOrg.get(String(o._id))?.planName ?? subscriptionByOrg.get(String(o._id))?.plan ?? null,
      subscription: (() => {
        const eff = effectiveSubscription(subscriptionByOrg.get(String(o._id)));
        return { status: eff.status, expired: eff.expired, daysLeft: eff.daysLeft, endsAt: eff.endsAt };
      })(),
      userLimit: limits.users,
      freeDays: freeDaysOf(o, subscriptionByOrg.get(String(o._id))),
      owner: owner ? { name: owner.name, email: owner.email, mobile: owner.mobile, lastLoginAt: owner.lastLoginAt } : null,
      createdAt: o.createdAt,
      // Only an organisation that has added nothing of its own can be deleted.
      records: records.get(String(o._id)) ?? [],
      canDelete: !(records.get(String(o._id)) ?? []).length,
    };
  });
}

export async function platformDashboard({ period = 'month' } = {}) {
  const now = new Date();
  const from = periodStart(period, now);
  const joinedInPeriod = from ? { createdAt: { $gte: from } } : {};
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const [organisations, active, suspended, branches, users, recent, joined, newInPeriod] = await Promise.all([
    Organisation.countDocuments({}),
    Organisation.countDocuments({ status: ORG_STATUS.ACTIVE }),
    Organisation.countDocuments({ status: ORG_STATUS.SUSPENDED }),
    Branch.countDocuments({ status: BRANCH_STATUS.ACTIVE }).setOptions(SKIP),
    User.countDocuments({ status: USER_STATUS.ACTIVE }).setOptions(SKIP),
    Organisation.find(joinedInPeriod).sort({ createdAt: -1 }).limit(5).lean(),
    Organisation.find({ createdAt: { $gte: sixMonthsAgo } }).select('createdAt').lean(),
    Organisation.countDocuments(joinedInPeriod),
  ]);
  // Sign-ups in each of the last six months (oldest first).
  const signups = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, count: 0 };
  });
  const byKey = new Map(signups.map((m) => [m.key, m]));
  for (const o of joined) {
    const d = new Date(o.createdAt);
    const m = byKey.get(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    if (m) m.count += 1;
  }
  return { organisations, active, suspended, branches, users, newThisMonth: signups[5].count, newInPeriod, signups, recent: await serializeMany(recent) };
}

export async function listOrganisations({ page, limit, q, status }) {
  const filter = { ...searchFilter(q, ['name', 'slug', 'gstin', 'email', 'phone']) };
  if (status) filter.status = status;
  const [orgs, total] = await Promise.all([Organisation.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), Organisation.countDocuments(filter)]);
  return { items: await serializeMany(orgs), meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } };
}

async function findOrg(id) {
  const org = await Organisation.findById(id).lean();
  if (!org) throw ApiError.notFound('Organisation');
  return org;
}

export async function getOrganisation(id) {
  const org = await findOrg(id);
  const [summary] = await serializeMany([org]);
  const [branches, creator] = await Promise.all([
    Branch.find({ organisationId: org._id }).setOptions(SKIP).select('code name status isHeadOffice address.city createdAt').sort({ isHeadOffice: -1, name: 1 }).lean(),
    org.createdByPlatformAdmin ? PlatformAdmin.findById(org.createdByPlatformAdmin).select('name').lean() : null,
  ]);
  return {
    ...summary,
    // Everything else the organisation holds about itself, for the Super Admin's organisation page.
    details: {
      legalName: org.legalName ?? null,
      pan: org.pan ?? null,
      currency: org.currency ?? 'INR',
      timezone: org.timezone ?? null,
      fyStartMonth: org.fyStartMonth ?? 4,
      hasLogo: Boolean(org.logoFileId),
      createdBy: org.createdByPlatformAdmin ? { kind: 'admin', name: creator?.name ?? 'Super Admin' } : { kind: 'signup', name: 'Signed up themselves' },
      updatedAt: org.updatedAt,
    },
    branches: branches.map((b) => ({ id: b._id, code: b.code, name: b.name, status: b.status, isHeadOffice: b.isHeadOffice, city: b.address?.city ?? null })),
  };
}

/** A 6-digit sign-in code (digits 0–9 only), used as a first or replacement password. */
const loginCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

/**
 * Emails an organisation its sign-in code. The code is handed back to the Super Admin only when it did not go out
 * by email (no SMTP set up, or the server refused), so they can pass it on another way.
 */
async function deliverLoginCode(template, { name, organisationName, email, otp }) {
  const result = await trySendEmail({ to: email, template, data: { name, organisationName, email, otp, loginUrl: `${env.APP_URL}/login` } });
  return { status: result.status, sentTo: email, ...(result.error && { error: result.error }), ...(result.status !== 'sent' && { otp }) };
}

export async function createOrganisation(input, admin, meta) {
  await assertEmailAvailable(input.email);
  // The panel sends no password: a 6-digit code becomes the first password, is emailed to the organisation, and
  // must be changed at first sign-in. (Scripts may still pass a password.)
  const otp = input.password ? null : loginCode();
  const passwordHash = await bcrypt.hash(input.password ?? otp, env.BCRYPT_ROUNDS);
  const { organisation } = await withTransaction((session) =>
    onboardOrganisation({ ...input, passwordHash, mustChangePassword: Boolean(otp), platformAdminId: admin.adminId }, session),
  );
  await recordPlatformAudit({ adminId: admin.adminId, action: 'organisation_create', organisationId: organisation._id, changes: { name: input.organisationName, owner: input.email, freeDays: input.freeDays } }, meta);
  const loginEmail = otp ? await deliverLoginCode('organisationWelcome', { name: input.ownerName, organisationName: input.organisationName, email: input.email, otp }) : null;
  return { ...(await getOrganisation(organisation._id)), loginEmail };
}

/** Issues a new 6-digit code as the owner's password, signs out their sessions, and emails it. */
export async function sendLoginCode(id, admin, meta) {
  const org = await findOrg(id);
  const owner = await User.findById(org.ownerUserId).setOptions(SKIP).select('name email').lean();
  if (!owner) throw ApiError.conflict('This organisation has no owner login', 'NO_OWNER');
  const otp = loginCode();
  const passwordHash = await bcrypt.hash(otp, env.BCRYPT_ROUNDS);
  await withTransaction(async (session) => {
    await User.updateOne(
      { _id: owner._id },
      { $set: { passwordHash, passwordChangedAt: new Date(), mustChangePassword: true, failedLoginCount: 0, lockedUntil: null, passwordReset: null }, $inc: { tokenVersion: 1 } },
      { session },
    ).setOptions(SKIP);
    await Session.updateMany({ userId: owner._id, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: 'login_code_sent' } }, { session });
  });
  await recordPlatformAudit({ adminId: admin.adminId, action: 'login_code_sent', organisationId: org._id, changes: { to: owner.email } }, meta);
  return deliverLoginCode('loginOtp', { name: owner.name, organisationName: org.name, email: owner.email, otp });
}

/** Edits the organisation; its email is also the owner's login email, and a new password replaces the owner's. */
export async function updateOrganisation(id, { organisationName, email, password, mobile, stateCode, address, freeDays }, admin, meta) {
  const org = await findOrg(id);
  const owner = await User.findById(org.ownerUserId).setOptions(SKIP).select('email').lean();
  const emailChanged = owner && owner.email !== email;
  if (emailChanged) await assertEmailAvailable(email, { exceptUserId: owner._id });

  const next = { name: organisationName, email, phone: mobile, 'address.stateCode': stateCode };
  const current = { name: org.name, email: org.email, phone: org.phone, 'address.stateCode': org.address?.stateCode ?? null };
  // Address parts (the same list create and display use); each change is recorded on its own.
  if (address) {
    for (const f of ADDRESS_FIELDS) {
      next[`address.${f}`] = address[f] || null;
      current[`address.${f}`] = org.address?.[f] ?? null;
    }
  }
  const changes = Object.keys(next)
    .filter((field) => next[field] !== current[field])
    .map((field) => ({ field, from: current[field], to: next[field] }));
  if (emailChanged && !changes.some((c) => c.field === 'email')) changes.push({ field: 'email', from: owner.email, to: email });
  if (password && owner) changes.push({ field: 'password', from: null, to: 'reset' }); // never log the password itself
  // Free days can be changed only while the organisation is still on its free period.
  const subscription = await Subscription.findOne({ organisationId: org._id }).setOptions(SKIP).lean();
  const currentFreeDays = freeDaysOf(org, subscription);
  const freeDaysChanged = freeDays != null && currentFreeDays != null && freeDays !== currentFreeDays;
  if (freeDaysChanged) changes.push({ field: 'freeDays', from: currentFreeDays, to: freeDays });

  if (!changes.length) return getOrganisation(id);

  const passwordHash = password && owner ? await bcrypt.hash(password, env.BCRYPT_ROUNDS) : null;
  await withTransaction(async (session) => {
    const orgFields = changes.filter((c) => c.field in next);
    if (orgFields.length) await Organisation.updateOne({ _id: org._id }, { $set: Object.fromEntries(orgFields.map((c) => [c.field, c.to])) }, { session });
    if (freeDaysChanged) await Subscription.updateOne({ _id: subscription._id }, { $set: { trialEndsAt: new Date(new Date(org.createdAt).getTime() + freeDays * DAY) } }, { session }).setOptions(SKIP);
    if (owner && (emailChanged || passwordHash)) {
      const login = { ...(emailChanged && { email }) };
      if (passwordHash) Object.assign(login, { passwordHash, passwordChangedAt: new Date(), mustChangePassword: false, failedLoginCount: 0, lockedUntil: null });
      // Signing out every device after a credential change means an old password or email cannot keep a session alive.
      await User.updateOne({ _id: owner._id }, { $set: login, $inc: { tokenVersion: 1 } }, { session }).setOptions(SKIP);
      await Session.updateMany({ userId: owner._id, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: 'credentials_changed_by_platform' } }, { session });
    }
  });
  await recordPlatformAudit({ adminId: admin.adminId, action: 'organisation_update', organisationId: org._id, changes }, meta);
  // The head office branch shares the registered address.
  const saved = await Organisation.findById(org._id).select('address').lean();
  await copyToHeadOffice(org._id, saved.address, { changes });
  return getOrganisation(id);
}

export async function setOrganisationStatus(id, status, admin, meta) {
  const org = await findOrg(id);
  if (org.status !== status) {
    await withTransaction(async (session) => {
      await Organisation.updateOne({ _id: org._id }, { $set: { status } }, { session });
      // Deactivating signs everyone out at once; their next refresh or sign-in gets the deactivated message.
      if (status === ORG_STATUS.SUSPENDED) {
        await Session.updateMany({ organisationId: org._id, revokedAt: null }, { $set: { revokedAt: new Date(), revokedReason: 'organisation_deactivated' } }, { session });
      }
    });
    await recordPlatformAudit({ adminId: admin.adminId, action: 'organisation_status', organisationId: org._id, changes: { from: org.status, to: status } }, meta);
  }
  return getOrganisation(id);
}

// ---------------------------------------------------------------------------
// Deleting an organisation that never got used
// ---------------------------------------------------------------------------

// Made when the organisation is created (or by simply signing in): on their own these are not the organisation's records.
const SETUP_ONLY = new Set(['Organisation', 'Subscription', 'Settings', 'AuditLog', 'Session', 'Counter', 'PlatformAudit']);
// Models onboarding also fills: only what was added on top of the starting set counts.
const BEYOND_SETUP = {
  Branch: { isHeadOffice: { $ne: true } },
  User: { isOwner: { $ne: true } },
  Role: { isSystem: { $ne: true }, key: /^custom_/ }, // roles it made (former defaults do not count)
  Category: { isSystem: { $ne: true } },
  Account: { isSystem: { $ne: true } },
  SubscriptionPayment: { status: 'paid' },
};
const RECORD_LABEL = {
  Branch: 'branch', User: 'user', Role: 'role', Category: 'category', Account: 'ledger account', SubscriptionPayment: 'subscription payment', Product: 'product', Customer: 'customer',
  Supplier: 'supplier', Sale: 'invoice', SalesReturn: 'sales return', Order: 'order', Purchase: 'purchase', PurchaseOrder: 'purchase order', Item: 'item', StockEntry: 'stock entry',
  StockTransfer: 'transfer', StockMovement: 'stock movement', MetalStock: 'metal stock', MetalRate: 'metal rate', Employee: 'employee', Attendance: 'attendance entry',
  AttendanceCalendar: 'holiday calendar', PayrollRun: 'payroll run', SalaryAdvance: 'salary advance', JournalEntry: 'ledger entry', ApprovalRequest: 'approval', FileAsset: 'file',
};

const tenantModels = () => Object.values(mongoose.models).filter((M) => M.schema.path('organisationId') && M.modelName !== 'PlatformAudit');

/** For each organisation, what it has created itself, e.g. [{ type: 'product', count: 3 }]. Empty means it can be deleted. */
async function recordsByOrg(orgIds) {
  const found = new Map(orgIds.map((id) => [String(id), []]));
  const models = tenantModels().filter((M) => !SETUP_ONLY.has(M.modelName));
  const counts = await Promise.all(
    models.map((M) => M.aggregate([{ $match: { organisationId: { $in: orgIds }, ...BEYOND_SETUP[M.modelName] } }, { $group: { _id: '$organisationId', count: { $sum: 1 } } }]).option(SKIP)),
  );
  models.forEach((M, i) => {
    for (const row of counts[i]) found.get(String(row._id))?.push({ type: RECORD_LABEL[M.modelName] ?? M.modelName, count: row.count });
  });
  return found;
}

const recordsOf = async (orgId) => (await recordsByOrg([orgId])).get(String(orgId));

/** Removes an organisation that has no records of its own (only what creating it set up). Anything more and it is refused. */
export async function deleteOrganisation(id, admin, meta) {
  const org = await findOrg(id);
  const records = await recordsOf(org._id);
  if (records.length) {
    const list = records.map((r) => `${r.count} ${r.type}${r.count === 1 ? '' : 's'}`).join(', ');
    throw ApiError.conflict(`${org.name} already has records (${list}), so it cannot be deleted. You can deactivate it instead.`, 'ORGANISATION_IN_USE');
  }
  await withTransaction(async (session) => {
    for (const M of tenantModels()) {
      if ((await M.countDocuments({ organisationId: org._id }).setOptions(SKIP).session(session)) === 0) continue;
      await M.deleteMany({ organisationId: org._id }, { session }).setOptions(SKIP);
    }
    await Organisation.deleteOne({ _id: org._id }, { session });
  });
  await recordPlatformAudit({ adminId: admin.adminId, action: 'organisation_delete', organisationId: org._id, changes: { name: org.name, email: org.email } }, meta);
  return { id: org._id, name: org.name };
}
