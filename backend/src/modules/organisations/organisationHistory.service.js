import { stateName } from '@jerp/shared';
import { AuditLog } from '../../core/audit/auditLog.model.js';
import { PlatformAdmin, PlatformAudit } from '../platform/platformAdmin.model.js';
import { User } from '../users/user.model.js';

const SKIP = { skipTenant: true };

const FIELD_LABEL = {
  name: 'Business name',
  legalName: 'Legal name',
  gstin: 'GSTIN',
  pan: 'PAN',
  phone: 'Phone',
  email: 'Email',
  timezone: 'Time zone',
  'address.line1': 'Address line 1',
  'address.line2': 'Address line 2',
  'address.city': 'City',
  'address.stateCode': 'State',
  'address.pincode': 'PIN code',
  branchLimit: 'Branch limit',
  freeDays: 'Free days',
  password: 'Password',
  status: 'Status',
  logo: 'Logo',
};

const STATUS_LABEL = { active: 'Active', suspended: 'Deactivated' };

function show(field, value) {
  if (value == null || value === '') return null;
  if (field === 'address.stateCode') return stateName(value) ?? value;
  if (field === 'status') return STATUS_LABEL[value] ?? value;
  if (field === 'freeDays') return `${value} day${value === 1 ? '' : 's'}`;
  return String(value);
}

/** One changed field, ready to show: label, old and new value. Secrets and file ids are never shown. */
function change(field, from, to) {
  const hidden = field === 'password' || field === 'logo';
  return { field, label: FIELD_LABEL[field] ?? field, from: hidden ? null : show(field, from), to: hidden ? null : show(field, to) };
}

const inr = (paise) => `₹${(paise / 100).toLocaleString('en-IN')}`;

const SUBSCRIPTION_TITLE = { subscription_trial: 'Free period started', subscription_manual: 'Payment recorded', subscription_extend: 'Subscription extended' };

/** A Super Admin action on the organisation, as a history entry. */
function fromPlatform(a) {
  const c = a.changes ?? {};
  switch (a.action) {
    case 'organisation_create':
      return {
        title: 'Organisation created',
        changes: [change('name', null, c.name), change('email', null, c.owner), change('branchLimit', null, c.branchLimit), ...(c.freeDays != null ? [change('freeDays', null, c.freeDays)] : [])],
      };
    case 'organisation_update':
      return { title: 'Details edited', changes: (Array.isArray(c) ? c : []).map((x) => change(x.field, x.from, x.to)) };
    case 'branch_limit_change':
      return { title: 'Branch limit changed', changes: [change('branchLimit', c.from, c.to)] };
    case 'organisation_status':
      return { title: c.to === 'suspended' ? 'Organisation deactivated' : 'Organisation activated', changes: [change('status', c.from, c.to)] };
    default:
      if (SUBSCRIPTION_TITLE[a.action]) {
        const details = [c.plan, c.months && `${c.months} month${c.months === 1 ? '' : 's'}`, c.days && `${c.days} day${c.days === 1 ? '' : 's'}`, c.amountPaise != null && inr(c.amountPaise)].filter(Boolean).join(' · ');
        return { title: SUBSCRIPTION_TITLE[a.action], note: [details, c.note].filter(Boolean).join(' — ') || null, changes: [] };
      }
      return null;
  }
}

/** A change made from inside the organisation (Settings → Organisation), as a history entry. */
function fromOrganisation(a) {
  if (a.action === 'create') return { title: 'Organisation created', changes: [] };
  const changes = (a.changes ?? []).map((x) => change(x.field, x.from, x.to));
  if (changes.length === 1 && changes[0].field === 'logo') return { title: a.changes[0].to ? 'Logo changed' : 'Logo removed', changes: [] };
  return { title: 'Details edited', changes };
}

/**
 * Every change to the organisation's details, newest first: what the Super Admin did (details, branch limit,
 * status, subscription) and what the organisation's own users did. Each entry says who, when and old → new.
 */
export async function organisationHistory(organisationId, { limit = 200 } = {}) {
  const [platform, own] = await Promise.all([
    PlatformAudit.find({ organisationId, action: { $in: ['organisation_create', 'organisation_update', 'branch_limit_change', 'organisation_status', ...Object.keys(SUBSCRIPTION_TITLE)] } })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean(),
    AuditLog.find({ organisationId, module: 'organisation', recordType: 'Organisation' }).setOptions(SKIP).sort({ createdAt: -1 }).limit(limit).lean(),
  ]);
  const createdByAdmin = platform.some((a) => a.action === 'organisation_create');

  const [admins, users] = await Promise.all([
    PlatformAdmin.find({ _id: { $in: platform.map((a) => a.adminId).filter(Boolean) } }).select('name').lean(),
    User.find({ _id: { $in: own.map((a) => a.userId).filter(Boolean) } }).setOptions(SKIP).select('name').lean(),
  ]);
  const adminName = new Map(admins.map((a) => [String(a._id), a.name]));
  const userName = new Map(users.map((u) => [String(u._id), u.name]));

  const entries = [
    ...platform.map((a) => {
      const e = fromPlatform(a);
      return e && { id: String(a._id), at: a.createdAt, by: { kind: 'admin', name: adminName.get(String(a.adminId)) ?? 'Super Admin' }, ...e };
    }),
    ...own
      // The Super Admin's own "created" entry already covers an organisation they set up.
      .filter((a) => !(a.action === 'create' && createdByAdmin))
      .map((a) => ({ id: String(a._id), at: a.createdAt, by: { kind: 'user', name: userName.get(String(a.userId)) ?? 'Organisation user' }, ...fromOrganisation(a) })),
  ].filter(Boolean);

  return entries.sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, limit);
}
