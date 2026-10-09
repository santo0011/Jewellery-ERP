import { randomBytes } from 'node:crypto';
import { BRANCH_STATUS, PLAN_LIMITS, SUBSCRIPTION_STATUS, USER_STATUS } from '@jerp/shared';
import { env } from '../../config/env.js';
import { withTransaction } from '../../config/db.js';
import { logger } from '../../config/logger.js';
import { requireContext } from '../../core/context/requestContext.js';
import { ApiError } from '../../utils/ApiError.js';
import { searchFilter } from '../../utils/pagination.js';
import { Branch } from '../branches/branch.model.js';
import { Organisation } from '../organisations/organisation.model.js';
import { Subscription } from '../organisations/subscription.model.js';
import { recordPlatformAudit } from '../platform/platformAuth.service.js';
import { Product } from '../products/product.model.js';
import { User } from '../users/user.model.js';
import { Plan, SubscriptionPayment } from './billing.models.js';
import { cashfreeEnabled, cashfreeMode, createOrder, getOrder, getSuccessfulPayment, latestAttempt, payOrder } from './cashfree.js';
import { effectiveSubscription, limitsOf } from './limits.js';

const SKIP = { skipTenant: true };
const DAY = 86400000;
const UNLIMITED_BRANCHES = 999;

const addMonths = (date, months) => {
  const d = new Date(date);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0); // 31 Jan + 1 month = 28/29 Feb, not 3 Mar
  return d;
};
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'plan';

// ---------------------------------------------------------------- plans

function serializePlan(p) {
  return {
    id: p._id,
    code: p.code,
    name: p.name,
    description: p.description,
    pricePaise: p.pricePaise,
    durationMonths: p.durationMonths,
    monthlyPaise: p.durationMonths ? Math.round(p.pricePaise / p.durationMonths) : p.pricePaise,
    limits: p.limits,
    features: p.features,
    isActive: p.isActive,
    isDefault: p.isDefault,
    isPopular: p.isPopular,
    sortOrder: p.sortOrder,
  };
}

const DEFAULT_PLANS = [
  { code: 'basic', name: 'Basic', description: 'One shop, getting started', pricePaise: 99900, durationMonths: 1, limits: PLAN_LIMITS.basic, isDefault: true, sortOrder: 1, features: ['Billing & GST invoices', 'Stock & purchases', 'Customer orders', 'Reports'] },
  { code: 'professional', name: 'Professional', description: 'Growing showrooms with a few branches', pricePaise: 249900, durationMonths: 1, limits: PLAN_LIMITS.professional, isPopular: true, sortOrder: 2, features: ['Everything in Basic', 'Up to 5 branches', 'HR, attendance & payroll', 'Branch transfers'] },
  { code: 'enterprise', name: 'Enterprise', description: 'Chains — no limits', pricePaise: 499900, durationMonths: 1, limits: PLAN_LIMITS.enterprise, sortOrder: 3, features: ['Everything in Professional', 'Unlimited branches & users', 'Priority support'] },
];

/**
 * On start-up: create the starter plans once, and link older subscriptions (plan code only) to a plan —
 * 'trial' maps to the default plan's trial, others to the plan with the same code.
 */
export async function ensureBillingSetup() {
  if (!(await Plan.estimatedDocumentCount())) await Plan.insertMany(DEFAULT_PLANS);
  const plans = await Plan.find({}).lean();
  const byCode = new Map(plans.map((p) => [p.code, p]));
  const fallback = plans.find((p) => p.isDefault) ?? plans[0];
  const orphans = await Subscription.find({ planId: null }).setOptions(SKIP).lean();
  for (const sub of orphans) {
    const plan = byCode.get(sub.plan) ?? fallback;
    await Subscription.updateOne({ _id: sub._id }, { $set: { planId: plan._id, planName: plan.name, ...(sub.plan !== 'trial' && { plan: plan.code }), limits: limitsOf(sub) } }).setOptions(SKIP);
  }
}

export async function listPlans({ includeInactive = false } = {}) {
  const plans = await Plan.find(includeInactive ? {} : { isActive: true }).sort({ sortOrder: 1, pricePaise: 1 }).lean();
  const [counts, paid] = await Promise.all([
    Subscription.aggregate([{ $group: { _id: '$planId', n: { $sum: 1 } } }]).option(SKIP),
    SubscriptionPayment.distinct('planId'),
  ]);
  const used = new Map(counts.map((c) => [String(c._id), c.n]));
  const bought = new Set(paid.map(String));
  return plans.map((p) => {
    const organisations = used.get(String(p._id)) ?? 0;
    return { ...serializePlan(p), organisations, canDelete: !organisations && !bought.has(String(p._id)) && !p.isDefault };
  });
}

async function findPlan(id) {
  const plan = await Plan.findById(id).lean();
  if (!plan) throw ApiError.notFound('Plan');
  return plan;
}

async function oneDefault(planId, isDefault) {
  if (isDefault) await Plan.updateMany({ _id: { $ne: planId } }, { $set: { isDefault: false } });
}

export async function createPlan(input, admin, meta) {
  let code = slug(input.name);
  if (await Plan.exists({ code })) code = `${code}-${randomBytes(2).toString('hex')}`;
  const plan = await Plan.create({ ...input, code });
  await oneDefault(plan._id, input.isDefault);
  await recordPlatformAudit({ adminId: admin.adminId, action: 'plan_create', changes: { name: plan.name, pricePaise: plan.pricePaise } }, meta);
  return serializePlan(plan.toObject());
}

export async function updatePlan(id, input, admin, meta) {
  const plan = await Plan.findByIdAndUpdate(id, { $set: input }, { returnDocument: 'after' }).lean();
  if (!plan) throw ApiError.notFound('Plan');
  await oneDefault(plan._id, input.isDefault);
  await recordPlatformAudit({ adminId: admin.adminId, action: 'plan_update', changes: { name: plan.name, pricePaise: plan.pricePaise, isActive: plan.isActive } }, meta);
  return serializePlan(plan);
}

/** Deletes a plan nobody has taken: no organisation is on it and it was never paid for. */
export async function deletePlan(id, admin, meta) {
  const plan = await findPlan(id);
  const [organisations, payments] = await Promise.all([Subscription.countDocuments({ planId: plan._id }).setOptions(SKIP), SubscriptionPayment.countDocuments({ planId: plan._id })]);
  if (organisations || payments) {
    throw ApiError.conflict(`${plan.name} has already been taken by an organisation, so it cannot be deleted. You can hide it instead (turn off "Active").`, 'PLAN_IN_USE');
  }
  if (plan.isDefault) throw ApiError.conflict(`${plan.name} is the default plan for new organisations. Make another plan the default first.`, 'PLAN_IS_DEFAULT');
  await Plan.deleteOne({ _id: plan._id });
  await recordPlatformAudit({ adminId: admin.adminId, action: 'plan_delete', changes: { name: plan.name, pricePaise: plan.pricePaise } }, meta);
  return { id: plan._id, name: plan.name };
}

/** The plan a brand-new organisation starts on (its free trial). */
export async function defaultPlanForNewOrganisation() {
  return (await Plan.findOne({ isDefault: true, isActive: true }).lean()) ?? (await Plan.findOne({ isActive: true }).sort({ sortOrder: 1 }).lean());
}

// ---------------------------------------------------------------- subscription changes

/** Plan fields copied onto the subscription, and the branch limit raised (never below branches in use). */
async function planFields(orgId, plan) {
  const usedBranches = await Branch.countDocuments({ organisationId: orgId, status: BRANCH_STATUS.ACTIVE }).setOptions(SKIP);
  await Organisation.updateOne({ _id: orgId }, { $set: { branchLimit: Math.max(usedBranches, plan.limits?.branches ?? UNLIMITED_BRANCHES, 1) } });
  return { planId: plan._id, plan: plan.code, planName: plan.name, limits: { users: plan.limits?.users ?? null, branches: plan.limits?.branches ?? null, products: plan.limits?.products ?? null } };
}

/** A paid period starts when the current one ends (renewing early loses nothing), or now if it has lapsed. */
function nextPeriod(sub, months, now = new Date()) {
  const current = sub?.status === SUBSCRIPTION_STATUS.ACTIVE && sub.currentPeriodEnd && new Date(sub.currentPeriodEnd) > now ? new Date(sub.currentPeriodEnd) : now;
  return { start: current, end: addMonths(current, months) };
}

async function subscriptionOf(orgId, session) {
  return Subscription.findOne({ organisationId: orgId }).setOptions(SKIP).session(session ?? null).lean();
}

/** Marks a payment paid (once) and extends the organisation's subscription by what it bought. */
async function settle(payment, gatewayInfo = {}) {
  return withTransaction(async (session) => {
    const fresh = await SubscriptionPayment.findOne({ _id: payment._id, status: 'created' }).session(session);
    if (!fresh) return SubscriptionPayment.findById(payment._id).session(session).lean(); // already settled
    const plan = await Plan.findById(fresh.planId).session(session).lean();
    const sub = await subscriptionOf(fresh.organisationId, session);
    const { start, end } = nextPeriod(sub, fresh.months);
    const fields = await planFields(fresh.organisationId, plan);
    await Subscription.updateOne(
      { organisationId: fresh.organisationId },
      { $set: { ...fields, status: SUBSCRIPTION_STATUS.ACTIVE, trialEndsAt: null, currentPeriodStart: start, currentPeriodEnd: end, lastPaymentAt: new Date() } },
      { session },
    ).setOptions(SKIP);
    fresh.set({ status: 'paid', paidAt: new Date(), periodStart: start, periodEnd: end, ...gatewayInfo });
    await fresh.save({ session });
    logger.info(`Subscription payment ${fresh.orderId} settled: ${fresh.organisationName} on ${plan.name} until ${end.toISOString().slice(0, 10)}`);
    return fresh.toObject();
  });
}

/** Super Admin: start a trial, record a payment made outside the app, or add days to the current period. */
export async function assignPlan(orgId, { planId, mode, days, months, amountPaise, paymentMode, reference, note }, admin, meta) {
  const org = await Organisation.findById(orgId).lean();
  if (!org) throw ApiError.notFound('Organisation');
  const plan = await findPlan(planId);
  const sub = await subscriptionOf(org._id);
  const now = new Date();

  if (mode === 'trial') {
    const length = days ?? env.TRIAL_DAYS;
    const fields = await planFields(org._id, plan);
    await Subscription.updateOne({ organisationId: org._id }, { $set: { ...fields, status: SUBSCRIPTION_STATUS.TRIAL, trialEndsAt: new Date(now.getTime() + length * DAY), currentPeriodStart: null, currentPeriodEnd: null } }, { upsert: true }).setOptions(SKIP);
  } else if (mode === 'extend') {
    const eff = effectiveSubscription(sub, now);
    const from = eff.endsAt && !eff.expired ? new Date(eff.endsAt) : now;
    const until = new Date(from.getTime() + days * DAY);
    const fields = await planFields(org._id, plan);
    const onTrial = sub?.status === SUBSCRIPTION_STATUS.TRIAL && !eff.expired;
    await Subscription.updateOne(
      { organisationId: org._id },
      { $set: { ...fields, ...(onTrial ? { trialEndsAt: until } : { status: SUBSCRIPTION_STATUS.ACTIVE, currentPeriodStart: sub?.currentPeriodStart ?? now, currentPeriodEnd: until, trialEndsAt: null }) } },
    ).setOptions(SKIP);
  } else {
    const payment = await SubscriptionPayment.create({
      orderId: `MAN_${Date.now().toString(36)}${randomBytes(3).toString('hex')}`.toUpperCase(),
      organisationId: org._id,
      organisationName: org.name,
      planId: plan._id,
      planName: plan.name,
      months: months ?? plan.durationMonths,
      amountPaise: amountPaise ?? Math.round((plan.pricePaise / plan.durationMonths) * (months ?? plan.durationMonths)),
      source: 'manual',
      paymentMethod: paymentMode ?? 'cash',
      reference: reference ?? null,
      note: note ?? null,
      createdByAdminId: admin.adminId,
    });
    await settle(payment.toObject());
  }
  await recordPlatformAudit({ adminId: admin.adminId, action: `subscription_${mode}`, organisationId: org._id, changes: { plan: plan.name, days, months, amountPaise, note } }, meta);
  return organisationBilling(org._id);
}

// ---------------------------------------------------------------- views

function serializePayment(p) {
  return {
    id: p._id,
    orderId: p.orderId,
    organisation: { id: p.organisationId, name: p.organisationName },
    plan: { id: p.planId, name: p.planName },
    months: p.months,
    amountPaise: p.amountPaise,
    status: p.status,
    source: p.source,
    paymentMethod: p.paymentMethod,
    reference: p.reference ?? p.cfPaymentId ?? null,
    failureReason: p.failureReason,
    periodStart: p.periodStart,
    periodEnd: p.periodEnd,
    paidAt: p.paidAt,
    note: p.note,
    createdAt: p.createdAt,
  };
}

function serializeSubscription(sub) {
  const eff = effectiveSubscription(sub);
  return {
    planId: sub?.planId ?? null,
    planName: sub?.planName ?? sub?.plan ?? null,
    status: eff.status,
    storedStatus: sub?.status ?? null,
    expired: eff.expired,
    daysLeft: eff.daysLeft,
    endsAt: eff.endsAt,
    trialEndsAt: sub?.trialEndsAt ?? null,
    currentPeriodStart: sub?.currentPeriodStart ?? null,
    currentPeriodEnd: sub?.currentPeriodEnd ?? null,
    lastPaymentAt: sub?.lastPaymentAt ?? null,
    limits: limitsOf(sub),
  };
}

async function usageOf(orgId) {
  const [users, branches, products] = await Promise.all([
    User.countDocuments({ organisationId: orgId, status: USER_STATUS.ACTIVE }).setOptions(SKIP),
    Branch.countDocuments({ organisationId: orgId, status: BRANCH_STATUS.ACTIVE }).setOptions(SKIP),
    Product.countDocuments({ organisationId: orgId, isDeleted: false }).setOptions(SKIP),
  ]);
  return { users, branches, products };
}

/** Subscription, usage and payments of one organisation (Super Admin's organisation page). */
export async function organisationBilling(orgId) {
  const [sub, usage, payments] = await Promise.all([subscriptionOf(orgId), usageOf(orgId), SubscriptionPayment.find({ organisationId: orgId }).sort({ createdAt: -1 }).limit(50).lean()]);
  return { subscription: serializeSubscription(sub), usage, payments: payments.map(serializePayment) };
}

/** The organisation's own billing page: where they stand, what they use, what they can buy, what they paid. */
export async function myBilling() {
  const { organisationId } = requireContext();
  const [billing, plans] = await Promise.all([organisationBilling(organisationId), listPlans()]);
  return { ...billing, payments: billing.payments.filter((p) => p.status !== 'created' || Date.now() - new Date(p.createdAt).getTime() < DAY), plans, gateway: { enabled: cashfreeEnabled(), mode: cashfreeMode() } };
}

export async function listPayments({ page, limit, q, status, organisationId, source }) {
  const filter = { ...searchFilter(q, ['orderId', 'organisationName', 'planName', 'reference', 'cfPaymentId']) };
  if (status) filter.status = status;
  if (source) filter.source = source;
  if (organisationId) filter.organisationId = organisationId;
  const [rows, total, sums] = await Promise.all([
    SubscriptionPayment.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    SubscriptionPayment.countDocuments(filter),
    SubscriptionPayment.aggregate([{ $match: { status: 'paid' } }, { $group: { _id: null, total: { $sum: '$amountPaise' }, count: { $sum: 1 }, online: { $sum: { $cond: [{ $eq: ['$source', 'cashfree'] }, '$amountPaise', 0] } } } }]),
  ]);
  return { items: rows.map(serializePayment), meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)), summary: { revenuePaise: sums[0]?.total ?? 0, paidCount: sums[0]?.count ?? 0, onlinePaise: sums[0]?.online ?? 0 } } };
}

/** Super Admin dashboard: revenue, how subscriptions stand, who expires soon, latest payments. */
export async function billingDashboard() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const [subs, orgs, paidRows, recent] = await Promise.all([
    Subscription.find({}).setOptions(SKIP).lean(),
    Organisation.find({}).select('name status').lean(),
    SubscriptionPayment.find({ status: 'paid', paidAt: { $gte: sixMonthsAgo } }).select('amountPaise paidAt').lean(),
    SubscriptionPayment.find({}).sort({ createdAt: -1 }).limit(6).lean(),
  ]);
  const orgName = new Map(orgs.map((o) => [String(o._id), o.name]));
  const counts = { active: 0, trial: 0, expired: 0 };
  const expiring = [];
  for (const sub of subs) {
    const eff = effectiveSubscription(sub, now);
    if (eff.expired) counts.expired += 1;
    else if (eff.status === SUBSCRIPTION_STATUS.TRIAL) counts.trial += 1;
    else counts.active += 1;
    if (!eff.expired && eff.daysLeft <= 7) expiring.push({ organisationId: sub.organisationId, name: orgName.get(String(sub.organisationId)) ?? '—', planName: sub.planName ?? sub.plan, status: eff.status, endsAt: eff.endsAt, daysLeft: eff.daysLeft });
  }
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, totalPaise: 0, count: 0 };
  });
  const byKey = new Map(months.map((m) => [m.key, m]));
  for (const p of paidRows) {
    const d = new Date(p.paidAt);
    const m = byKey.get(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    if (m) {
      m.totalPaise += p.amountPaise;
      m.count += 1;
    }
  }
  const [all] = await SubscriptionPayment.aggregate([{ $match: { status: 'paid' } }, { $group: { _id: null, total: { $sum: '$amountPaise' } } }]);
  return {
    revenue: { totalPaise: all?.total ?? 0, monthPaise: paidRows.filter((p) => new Date(p.paidAt) >= monthStart).reduce((s, p) => s + p.amountPaise, 0), months },
    subscriptions: counts,
    expiring: expiring.sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 8),
    recentPayments: recent.map(serializePayment),
  };
}

// ---------------------------------------------------------------- online payment (organisation side)

/** Cashfree method codes for each choice on our payment screen. */
const METHOD_CODES = { all: null, upi: 'upi', cards: 'cc,dc', netbanking: 'nb', wallets: 'app', paylater: 'paylater,emi,cardlessemi' };

/** Starts a Cashfree checkout for a plan, offering only the chosen kind of method; a free plan is switched on straight away. */
export async function createCheckout({ planId, methods = 'all' }) {
  const { organisationId, userId } = requireContext();
  const plan = await findPlan(planId);
  if (!plan.isActive) throw ApiError.badRequest('This plan is no longer offered', [{ path: 'planId', message: 'Pick another plan' }], 'VALIDATION_ERROR');
  const [org, user] = await Promise.all([Organisation.findById(organisationId).lean(), User.findById(userId).setOptions(SKIP).select('name email mobile').lean()]);
  const usage = await usageOf(organisationId);
  for (const k of ['users', 'branches', 'products']) {
    const max = plan.limits?.[k];
    if (max != null && usage[k] > max) throw ApiError.conflict(`You have ${usage[k]} ${k}, more than ${plan.name} allows (${max}). Choose a bigger plan.`, 'PLAN_BELOW_USAGE');
  }

  const payment = await SubscriptionPayment.create({
    orderId: `JERP_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`,
    organisationId,
    organisationName: org.name,
    planId: plan._id,
    planName: plan.name,
    months: plan.durationMonths,
    amountPaise: plan.pricePaise,
    source: 'cashfree',
    createdByUserId: userId,
  });
  if (plan.pricePaise === 0) {
    await settle(payment.toObject(), { paymentMethod: 'free' });
    return { free: true, orderId: payment.orderId };
  }

  const phone = String(user?.mobile ?? org.phone ?? '').replace(/\D/g, '').slice(-10) || '9999999999';
  const order = await createOrder({
    orderId: payment.orderId,
    amountPaise: plan.pricePaise,
    customer: { id: String(organisationId), name: org.name.slice(0, 100), email: user?.email ?? org.email ?? 'billing@example.com', phone },
    returnUrl: `${env.APP_URL}/settings/subscription?order_id={order_id}`,
    note: `${plan.name} · ${plan.durationMonths} month${plan.durationMonths > 1 ? 's' : ''}`,
    paymentMethods: METHOD_CODES[methods] ?? null,
  });
  await SubscriptionPayment.updateOne({ _id: payment._id }, { $set: { cfOrderId: order.cf_order_id, paymentSessionId: order.payment_session_id } });
  return { orderId: payment.orderId, paymentSessionId: order.payment_session_id, mode: cashfreeMode(), amountPaise: plan.pricePaise };
}

/** Asks Cashfree how an order stands and settles it if paid. Safe to call any number of times. */
async function syncOrder(payment) {
  if (payment.status !== 'created' || payment.source !== 'cashfree') return payment;
  const order = await getOrder(payment.orderId);
  if (order.order_status === 'PAID') {
    const p = await getSuccessfulPayment(payment.orderId).catch(() => null);
    return settle(payment, { cfPaymentId: p?.cf_payment_id ? String(p.cf_payment_id) : null, paymentMethod: p?.payment_group ?? null });
  }
  if (['EXPIRED', 'TERMINATED'].includes(order.order_status)) {
    return SubscriptionPayment.findOneAndUpdate({ _id: payment._id, status: 'created' }, { $set: { status: order.order_status === 'EXPIRED' ? 'expired' : 'failed', failureReason: `Order ${order.order_status.toLowerCase()}` } }, { returnDocument: 'after' }).lean();
  }
  return payment;
}

/**
 * Confirm with Cashfree (never the browser) and report the result. While still unpaid it also says how the
 * latest attempt went, so the payment screen can show "that try failed" instead of waiting for ever.
 */
export async function verifyCheckout(orderId) {
  const { organisationId } = requireContext();
  const payment = await SubscriptionPayment.findOne({ orderId, organisationId }).lean();
  if (!payment) throw ApiError.notFound('Payment');
  const synced = await syncOrder(payment);
  let attempt = null;
  if (synced.status === 'created' && synced.source === 'cashfree') {
    const last = await latestAttempt(orderId).catch(() => null);
    if (last) attempt = { status: last.payment_status, message: last.payment_message ?? null, method: last.payment_group ?? null };
  }
  return { ...serializePayment(synced), attempt };
}

/** Pays an open UPI checkout from our own screen: QR to scan (laptop), app links (phone) or a request to a UPI ID. */
export async function startUpiPayment(orderId, { method, upiId }) {
  const { organisationId } = requireContext();
  const payment = await SubscriptionPayment.findOne({ orderId, organisationId }).lean();
  if (!payment) throw ApiError.notFound('Payment');
  if (payment.status !== 'created' || !payment.paymentSessionId) throw ApiError.conflict('This payment is already closed. Start again from the plan.', 'INVALID_STATE');
  const channel = { qr: 'qrcode', apps: 'link', upi_id: 'collect' }[method];
  const res = await payOrder(payment.paymentSessionId, { upi: { channel, ...(method === 'upi_id' && { upi_id: upiId }) } });
  const payload = res.data?.payload ?? {};
  if (method === 'qr') return { method, qrcode: payload.qrcode ?? null };
  if (method === 'apps') return { method, links: { phonepe: payload.phonepe ?? null, gpay: payload.gpay ?? null, paytm: payload.paytm ?? null, bhim: payload.bhim ?? null, other: payload.default ?? null } };
  return { method, sentTo: upiId };
}

/** Cashfree webhook (signature already checked): settle the order it is about. */
export async function handleWebhook(body) {
  const orderId = body?.data?.order?.order_id;
  if (!orderId) return;
  const payment = await SubscriptionPayment.findOne({ orderId }).lean();
  if (!payment) return;
  await syncOrder(payment);
}
