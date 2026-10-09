import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { BRANCH_STATUS, ORG_STATUS, SUBSCRIPTION_STATUS, USER_STATUS } from '@jerp/shared';
import { env } from '../../config/env.js';
import { withTransaction } from '../../config/db.js';
import { ApiError } from '../../utils/ApiError.js';
import { searchFilter } from '../../utils/pagination.js';
import { Branch } from '../branches/branch.model.js';
import { Organisation } from '../organisations/organisation.model.js';
import { Subscription } from '../organisations/subscription.model.js';
import { onboardOrganisation } from '../organisations/organisation.service.js';
import { Session } from '../auth/session.model.js';
import { User } from '../users/user.model.js';
import { recordPlatformAudit } from './platformAuth.service.js';
import { effectiveSubscription, limitsOf } from '../billing/limits.js';
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
    return {
      id: o._id,
      name: o.name,
      slug: o.slug,
      status: o.status,
      gstin: o.gstin,
      email: o.email,
      phone: o.phone,
      stateCode: o.address?.stateCode ?? null,
      branchLimit: o.branchLimit,
      branchesUsed: used,
      branchesAvailable: Math.max(0, o.branchLimit - used),
      activeUsers: users.get(String(o._id)) ?? 0,
      plan: subscriptionByOrg.get(String(o._id))?.planName ?? subscriptionByOrg.get(String(o._id))?.plan ?? null,
      subscription: (() => {
        const eff = effectiveSubscription(subscriptionByOrg.get(String(o._id)));
        return { status: eff.status, expired: eff.expired, daysLeft: eff.daysLeft, endsAt: eff.endsAt };
      })(),
      userLimit: limitsOf(subscriptionByOrg.get(String(o._id))).users,
      freeDays: freeDaysOf(o, subscriptionByOrg.get(String(o._id))),
      owner: owner ? { name: owner.name, email: owner.email, mobile: owner.mobile, lastLoginAt: owner.lastLoginAt } : null,
      createdAt: o.createdAt,
      // Only an organisation that has added nothing of its own can be deleted.
      records: records.get(String(o._id)) ?? [],
      canDelete: !(records.get(String(o._id)) ?? []).length,
    };
  });
}

export async function platformDashboard() {
  const [organisations, active, suspended, branches, users, recent] = await Promise.all([
    Organisation.countDocuments({}),
    Organisation.countDocuments({ status: ORG_STATUS.ACTIVE }),
    Organisation.countDocuments({ status: ORG_STATUS.SUSPENDED }),
    Branch.countDocuments({ status: BRANCH_STATUS.ACTIVE }).setOptions(SKIP),
    User.countDocuments({ status: USER_STATUS.ACTIVE }).setOptions(SKIP),
    Organisation.find({}).sort({ createdAt: -1 }).limit(5).lean(),
  ]);
  return { organisations, active, suspended, branches, users, recent: await serializeMany(recent) };
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
  const branches = await Branch.find({ organisationId: org._id }).setOptions(SKIP).select('code name status isHeadOffice address.city createdAt').sort({ isHeadOffice: -1, name: 1 }).lean();
  return { ...summary, branches: branches.map((b) => ({ id: b._id, code: b.code, name: b.name, status: b.status, isHeadOffice: b.isHeadOffice, city: b.address?.city ?? null })) };
}

export async function createOrganisation(input, admin, meta) {
  await assertEmailAvailable(input.email);
  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_ROUNDS);
  const { organisation } = await withTransaction((session) =>
    onboardOrganisation({ ...input, passwordHash, platformAdminId: admin.adminId }, session),
  );
  await recordPlatformAudit({ adminId: admin.adminId, action: 'organisation_create', organisationId: organisation._id, changes: { name: input.organisationName, branchLimit: input.branchLimit, owner: input.email, freeDays: input.freeDays } }, meta);
  return getOrganisation(organisation._id);
}

async function assertLimitCoversUsage(org, branchLimit) {
  const used = await Branch.countDocuments({ organisationId: org._id, status: BRANCH_STATUS.ACTIVE }).setOptions(SKIP);
  if (branchLimit < used) {
    throw ApiError.conflict(`${org.name} already has ${used} active branches. Ask them to deactivate branches first, or set the limit to at least ${used}.`, 'BRANCH_LIMIT_BELOW_USAGE', [
      { path: 'branchLimit', message: `At least ${used}` },
    ]);
  }
}

/** Edits the organisation; its email is also the owner's login email, and a new password replaces the owner's. */
export async function updateOrganisation(id, { organisationName, email, password, mobile, stateCode, branchLimit, freeDays }, admin, meta) {
  const org = await findOrg(id);
  await assertLimitCoversUsage(org, branchLimit);
  const owner = await User.findById(org.ownerUserId).setOptions(SKIP).select('email').lean();
  const emailChanged = owner && owner.email !== email;
  if (emailChanged) await assertEmailAvailable(email, { exceptUserId: owner._id });

  const next = { name: organisationName, email, phone: mobile, 'address.stateCode': stateCode, branchLimit };
  const current = { name: org.name, email: org.email, phone: org.phone, 'address.stateCode': org.address?.stateCode ?? null, branchLimit: org.branchLimit };
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
  return getOrganisation(id);
}

export async function setBranchLimit(id, branchLimit, admin, meta) {
  const org = await findOrg(id);
  await assertLimitCoversUsage(org, branchLimit);
  if (branchLimit !== org.branchLimit) {
    await Organisation.updateOne({ _id: org._id }, { $set: { branchLimit } });
    await recordPlatformAudit({ adminId: admin.adminId, action: 'branch_limit_change', organisationId: org._id, changes: { from: org.branchLimit, to: branchLimit } }, meta);
  }
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
  Role: { isSystem: { $ne: true } },
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
