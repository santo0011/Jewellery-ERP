import { ADDRESS_FIELDS } from '@jerp/shared';
import { planSchema, platformUpdateOrganisationSchema } from '@jerp/shared/schemas';
import { EmailSettings } from '../../core/notifications/emailSettings.model.js';
import { Plan, SubscriptionPayment } from '../billing/billing.models.js';
import { deletePlan, updatePlan } from '../billing/billing.service.js';
import { Organisation } from '../organisations/organisation.model.js';
import { Subscription } from '../organisations/subscription.model.js';
import { inputOf, sameValues } from '../undo/undo.snapshot.js';
import { User } from '../users/user.model.js';
import { deleteOrganisation, recordsOf, setOrganisationStatus, updateOrganisation } from './platform.service.js';
import { recordPlatformAudit } from './platformAuth.service.js';

/*
 * What the Super Admin's Undo can take back. Same handler shape as an organisation's (undo.helpers.js), but run with
 * the admin and request info the platform services need: run(entry, { reason, admin, meta }).
 */

const SKIP = { skipTenant: true };
const SUB_FIELDS = ['planId', 'planName', 'plan', 'status', 'trialEndsAt', 'currentPeriodStart', 'currentPeriodEnd', 'lastPaymentAt', 'limits'];
const subOf = (s) => (s ? Object.fromEntries(SUB_FIELDS.map((f) => [f, s[f] ?? null])) : null);

async function orgForm(id) {
  const org = await Organisation.findById(id).lean();
  if (!org) return null;
  const owner = await User.findById(org.ownerUserId).setOptions(SKIP).select('email').lean();
  return { organisationName: org.name, email: owner?.email ?? org.email, mobile: org.phone, stateCode: org.address?.stateCode ?? null, address: Object.fromEntries(ADDRESS_FIELDS.map((f) => [f, org.address?.[f] ?? null])) };
}

export const platformUndoHandlers = [
  {
    type: 'platform.orgCreate',
    title: 'Organisation created',
    mode: 'undo',
    async check(entry) {
      if (!(await Organisation.exists({ _id: entry.recordId }))) return { superseded: true, reason: 'Already deleted' };
      const records = await recordsOf(entry.recordId);
      if (records?.length) return { ok: false, reason: `It already has records (${records.map((r) => `${r.count} ${r.type}${r.count === 1 ? '' : 's'}`).join(', ')}) — deactivate it instead.` };
      return { ok: true, effect: `Deletes ${entry.label}: nothing was done in it yet.` };
    },
    run: (entry, { admin, meta }) => deleteOrganisation(entry.recordId, admin, meta),
  },
  {
    type: 'platform.orgUpdate',
    title: 'Organisation edited',
    mode: 'undo',
    async check(entry) {
      const now = await orgForm(entry.recordId);
      if (!now) return { superseded: true, reason: 'The organisation was deleted' };
      const { before, after } = entry.data;
      const strip = ({ freeDays, ...rest }) => rest; // eslint-disable-line no-unused-vars
      if (!sameValues(now, strip(after))) return { ok: false, reason: 'It was edited again since.' };
      return { ok: true, effect: `Puts ${entry.label}’s details back as they were${entry.data.passwordReset ? ' (the new owner password stays — set another one if needed)' : ''}.` };
    },
    run: (entry, { admin, meta }) => {
      const { freeDays, ...before } = entry.data.before;
      const input = platformUpdateOrganisationSchema.parse({ ...before, ...(freeDays != null && { freeDays }) });
      return updateOrganisation(entry.recordId, input, admin, meta);
    },
  },
  {
    type: 'platform.orgStatus',
    title: 'Organisation activated / deactivated',
    mode: 'undo',
    async check(entry) {
      const org = await Organisation.findById(entry.recordId).select('status').lean();
      if (!org) return { superseded: true, reason: 'The organisation was deleted' };
      if (org.status === entry.data.from) return { superseded: true, reason: 'Its status is already back' };
      if (org.status !== entry.data.to) return { ok: false, reason: 'Its status was changed again since.' };
      return { ok: true, effect: `Sets ${entry.label} back to ${entry.data.from}${entry.data.to === 'suspended' ? ' (its users sign in again)' : ''}.` };
    },
    run: (entry, { admin, meta }) => setOrganisationStatus(entry.recordId, entry.data.from, admin, meta),
  },
  {
    type: 'platform.planCreate',
    title: 'Plan added',
    mode: 'undo',
    async check(entry) {
      const plan = await Plan.findById(entry.recordId).lean();
      if (!plan) return { superseded: true, reason: 'Already deleted' };
      const [orgs, payments] = await Promise.all([Subscription.countDocuments({ planId: plan._id }).setOptions(SKIP), SubscriptionPayment.countDocuments({ planId: plan._id })]);
      if (orgs || payments) return { ok: false, reason: `${plan.name} has been taken by an organisation — hide it instead.` };
      if (plan.isDefault) return { ok: false, reason: `${plan.name} is the default plan — make another plan the default first.` };
      return { ok: true, effect: `Deletes the plan ${plan.name}.` };
    },
    run: (entry, { admin, meta }) => deletePlan(entry.recordId, admin, meta),
  },
  {
    type: 'platform.planUpdate',
    title: 'Plan edited',
    mode: 'undo',
    async check(entry) {
      const plan = await Plan.findById(entry.recordId).lean();
      if (!plan) return { superseded: true, reason: 'The plan was deleted' };
      if (!sameValues(inputOf(planSchema, plan), entry.data.after)) return { ok: false, reason: 'It was edited again since.' };
      return { ok: true, effect: `Puts the plan ${plan.name} back as it was (price, limits, features).` };
    },
    run: (entry, { admin, meta }) => updatePlan(entry.recordId, planSchema.parse(entry.data.before), admin, meta),
  },
  {
    type: 'platform.planDelete',
    title: 'Plan deleted',
    mode: 'undo',
    async check(entry) {
      if (await Plan.exists({ _id: entry.recordId })) return { superseded: true, reason: 'It is back already' };
      if (await Plan.exists({ code: entry.data.snapshot.code })) return { ok: false, reason: 'Another plan has its code now.' };
      return { ok: true, effect: `Brings the plan ${entry.label} back.` };
    },
    run: async (entry, { admin, meta }) => {
      await Plan.create([{ ...entry.data.snapshot, isDefault: false }]);
      await recordPlatformAudit({ adminId: admin.adminId, action: 'plan_create', changes: { name: entry.label, restored: true } }, meta);
    },
  },
  {
    // The subscription goes back to what it was; the payment / activation record it added is kept, marked reversed
    // (so it no longer counts as revenue).
    type: 'platform.subscription',
    title: 'Subscription changed',
    mode: 'reversal',
    async check(entry) {
      const sub = await Subscription.findOne({ organisationId: entry.recordId ?? undefined }).setOptions(SKIP).lean();
      if (!sameValues(subOf(sub), subOf(entry.data.after))) return { ok: false, reason: 'The subscription changed again since (a payment, renewal or another change).' };
      return { ok: true, effect: `Puts ${entry.label.split(' — ')[0]}’s subscription back as it was; the activation is kept on record as reversed.` };
    },
    run: async (entry, { reason, admin, meta }) => {
      const before = subOf(entry.data.before);
      if (before) await Subscription.updateOne({ organisationId: entry.recordId }, { $set: before }).setOptions(SKIP);
      else await Subscription.deleteOne({ organisationId: entry.recordId }).setOptions(SKIP);
      if (entry.data.paymentIds.length) await SubscriptionPayment.updateMany({ _id: { $in: entry.data.paymentIds } }, { $set: { status: 'reversed', reversedAt: new Date(), reverseReason: reason } });
      await recordPlatformAudit({ adminId: admin.adminId, action: 'subscription_reversed', organisationId: entry.recordId, changes: { label: entry.label, reason } }, meta);
    },
  },
  {
    type: 'platform.emailSettings',
    title: 'Email settings changed',
    mode: 'undo',
    async check(entry) {
      const now = await EmailSettings.findOne({ key: 'smtp' }).lean();
      const pick = (s) => (s ? Object.fromEntries(Object.keys(entry.data.after).map((f) => [f, s[f] ?? null])) : null);
      if (!sameValues(pick(now), entry.data.after)) return { ok: false, reason: 'The email settings were changed again since.' };
      return { ok: true, effect: 'Puts the email (SMTP) settings back as they were.' };
    },
    run: async (entry, { admin, meta }) => {
      if (entry.data.before) await EmailSettings.updateOne({ key: 'smtp' }, { $set: { ...entry.data.before, updatedByAdminId: admin.adminId } });
      else await EmailSettings.deleteOne({ key: 'smtp' });
      await recordPlatformAudit({ adminId: admin.adminId, action: 'email_settings_update', changes: { restored: true } }, meta);
    },
  },
];
