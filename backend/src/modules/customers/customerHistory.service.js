import { CUSTOMER_SEGMENTS, hasPermission, KYC_DOC_TYPES, stateName } from '@jerp/shared';
import { AuditLog } from '../../core/audit/auditLog.model.js';
import { requireContext } from '../../core/context/requestContext.js';
import { ApiError } from '../../utils/ApiError.js';
import { maskTail } from '../../utils/mask.js';
import { User } from '../users/user.model.js';
import { Customer } from './customer.model.js';

/*
 * Every change to one customer, newest first, ready to show as a timeline: who, when, and old → new for each
 * field (same shape as the organisation's edit history). KYC numbers stay masked for users without customer.viewKyc.
 */

const FIELD_LABEL = {
  name: 'Name',
  mobile: 'Mobile',
  alternateMobile: 'Alternate mobile',
  email: 'Email',
  address: 'Address',
  dob: 'Birthday',
  anniversary: 'Anniversary',
  gstin: 'GSTIN',
  pan: 'PAN',
  'kyc.type': 'KYC document',
  'kyc.number': 'KYC number',
  'kyc.verified': 'KYC verified',
  segment: 'Segment',
  preferredMetals: 'Preferred metals',
  tags: 'Tags',
  openingBalancePaise: 'Opening balance',
  notes: 'Notes',
  status: 'Status',
};

const inr = (paise) => `₹${(Math.abs(paise) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const labelOf = (list, value) => list.find((x) => x.value === value)?.label ?? value;
const dateOf = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? new Date(v).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : v);

function addressText(a) {
  if (!a || typeof a !== 'object') return a;
  return [a.line1, a.line2, a.city, a.stateCode && stateName(a.stateCode), a.pincode].filter(Boolean).join(', ') || null;
}

function show(field, value, canSeeKyc) {
  if (value == null || value === '' || (Array.isArray(value) && !value.length)) return null;
  switch (field) {
    case 'address':
      return addressText(value);
    case 'pan':
    case 'kyc.number':
      return canSeeKyc ? String(value) : maskTail(String(value));
    case 'kyc.type':
      return labelOf(KYC_DOC_TYPES, value);
    case 'kyc.verified':
      return value ? 'Yes' : 'No';
    case 'segment':
      return labelOf(CUSTOMER_SEGMENTS, value);
    case 'status':
      return value === 'active' ? 'Active' : 'Inactive';
    case 'openingBalancePaise':
      return value === 0 ? 'None' : value > 0 ? `Old due ${inr(value)}` : `Advance paid ${inr(value)}`;
    case 'dob':
    case 'anniversary':
      return dateOf(value);
    default:
      return Array.isArray(value) ? value.join(', ') : String(value);
  }
}

const change = (field, from, to, canSeeKyc) => ({ field, label: FIELD_LABEL[field] ?? field, from: show(field, from, canSeeKyc), to: show(field, to, canSeeKyc) });

function entryOf(a, canSeeKyc) {
  const changes = (a.changes ?? []).map((c) => change(c.field, c.from, c.to, canSeeKyc));
  if (a.meta?.receiptNo) {
    return { title: 'Due payment received', note: `${inr(a.meta.dueReceived ?? 0)} · receipt ${a.meta.receiptNo}`, changes: [] };
  }
  switch (a.action) {
    case 'create':
      return { title: 'Customer created', note: a.meta?.code ? `Code ${a.meta.code}` : null, changes };
    case 'status_change':
      return { title: changes[0]?.to === 'Active' ? 'Customer activated' : 'Customer deactivated', changes };
    case 'delete':
      return { title: 'Customer deleted', changes: [] };
    default:
      return { title: 'Details edited', changes };
  }
}

export async function customerHistory(id) {
  const customer = await Customer.findById(id).select('_id').lean();
  if (!customer) throw ApiError.notFound('Customer');
  const canSeeKyc = hasPermission(requireContext().permissions, 'customer.viewKyc');
  const logs = await AuditLog.find({ organisationId: requireContext().organisationId, recordType: 'Customer', recordId: customer._id }).sort({ createdAt: -1 }).lean();
  const users = new Map(
    (await User.find({ _id: { $in: logs.map((l) => l.userId).filter(Boolean) } }).select('name').lean()).map((u) => [String(u._id), u.name]),
  );
  return logs.map((a) => ({
    id: a._id,
    at: a.createdAt,
    by: { kind: 'user', name: users.get(String(a.userId)) ?? 'System' },
    ...entryOf(a, canSeeKyc),
  }));
}
