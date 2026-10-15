import { BRANCH_STATUS, SALE_STATUS, stateName, USER_STATUS } from '@jerp/shared';
import { ApiError } from '../../utils/ApiError.js';
import { Plan, SubscriptionPayment } from '../billing/billing.models.js';
import { effectiveSubscription } from '../billing/limits.js';
import { Branch } from '../branches/branch.model.js';
import { Organisation } from '../organisations/organisation.model.js';
import { Subscription } from '../organisations/subscription.model.js';
import { Product } from '../products/product.model.js';
import { Sale } from '../sales/sale.model.js';
import { User } from '../users/user.model.js';

/*
 * Super Admin reports: money from subscriptions, where every organisation stands, renewals, sign-ups and usage.
 * Same shape as the showroom reports (columns, rows, totals, summary) so the screen, CSV and print work alike.
 */

const SKIP = { skipTenant: true };
const DAY = 86400000;
const ROW_LIMIT = 2000;

const sum = (list, fn) => list.reduce((s, x) => s + (fn(x) ?? 0), 0);
const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : 0);
const col = (key, label, type = 'text', extra = {}) => ({ key, label, type, ...extra });
const totalsOf = (rows, keys) => Object.fromEntries(keys.map((k) => [k, sum(rows, (r) => r[k])]));
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** A date range as Date bounds: from the start of `from` to the end of `to` (server time). */
const bounds = ({ from, to }) => ({ $gte: new Date(`${from}T00:00:00`), $lt: new Date(new Date(`${to}T00:00:00`).getTime() + DAY) });
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const monthLabel = (key) => new Date(`${key}-01T00:00:00`).toLocaleString('en-IN', { month: 'long', year: 'numeric' });

const STATUS_LABEL = { trial: 'Free trial', active: 'Active', expired: 'Expired', suspended: 'Suspended', cancelled: 'Cancelled', past_due: 'Past due' };
const statusTone = (s) => (s === 'active' ? 'paid' : s === 'trial' ? null : 'due');
const METHOD = { upi: 'UPI', card: 'Card', credit_card: 'Credit card', debit_card: 'Debit card', net_banking: 'Net banking', netbanking: 'Net banking', wallet: 'Wallet', bank: 'Bank transfer', cash: 'Cash', cheque: 'Cheque' };
const methodLabel = (m) => METHOD[m] ?? (m ? m.replace(/_/g, ' ') : '—');
const orgLink = (id) => `/admin/organisations/${id}`;

/** Money received: paid payments with an amount (free trials and extensions are recorded as ₹0 and left out). */
const PAID = { status: 'paid', amountPaise: { $gt: 0 } };

async function countsByOrg(Model, match, ids) {
  const rows = await Model.aggregate([{ $match: { ...match, organisationId: { $in: ids } } }, { $group: { _id: '$organisationId', count: { $sum: 1 } } }]).option(SKIP);
  return new Map(rows.map((r) => [String(r._id), r.count]));
}

/** Organisations with their subscription, owner and what they have paid in all (by id). */
async function organisationsWithBilling(filter = {}) {
  const orgs = await Organisation.find(filter).sort({ createdAt: -1 }).lean();
  const ids = orgs.map((o) => o._id);
  const [subs, owners, paid] = await Promise.all([
    Subscription.find({ organisationId: { $in: ids } }).setOptions(SKIP).lean(),
    User.find({ _id: { $in: orgs.map((o) => o.ownerUserId).filter(Boolean) } }).setOptions(SKIP).select('name email mobile lastLoginAt').lean(),
    SubscriptionPayment.aggregate([{ $match: { ...PAID, organisationId: { $in: ids } } }, { $group: { _id: '$organisationId', total: { $sum: '$amountPaise' }, count: { $sum: 1 }, last: { $max: '$paidAt' } } }]),
  ]);
  const subOf = new Map(subs.map((s) => [String(s.organisationId), s]));
  const ownerOf = new Map(owners.map((u) => [String(u._id), u]));
  const paidOf = new Map(paid.map((p) => [String(p._id), p]));
  const now = new Date();
  return orgs.map((o) => {
    const sub = subOf.get(String(o._id));
    const eff = effectiveSubscription(sub, now);
    return { org: o, sub, eff, owner: ownerOf.get(String(o.ownerUserId)) ?? null, paid: paidOf.get(String(o._id)) ?? { total: 0, count: 0, last: null } };
  });
}

const REPORTS = [
  // ------------------------------------------------ revenue
  {
    key: 'revenue-register',
    group: 'Revenue',
    icon: 'receipt',
    title: 'Revenue register',
    description: 'Every subscription payment received, with organisation, plan and how it was paid.',
    filters: ['range'],
    async run(p) {
      const list = await SubscriptionPayment.find({ ...PAID, paidAt: bounds(p) }).sort({ paidAt: 1 }).lean();
      const rows = list.map((x) => ({
        date: x.paidAt,
        receipt: x.orderId,
        organisation: x.organisationName ?? '—',
        plan: x.planName ?? '—',
        period: x.months ? `${x.months} month${x.months === 1 ? '' : 's'}` : '—',
        source: x.source === 'manual' ? 'Recorded by admin' : 'Online',
        method: methodLabel(x.paymentMethod),
        reference: x.reference ?? x.cfPaymentId ?? null,
        amountPaise: x.amountPaise,
        _links: { organisation: orgLink(x.organisationId) },
      }));
      const totals = totalsOf(rows, ['amountPaise']);
      const online = sum(list.filter((x) => x.source !== 'manual'), (x) => x.amountPaise);
      return {
        columns: [col('date', 'Date', 'date'), col('receipt', 'Payment ID'), col('organisation', 'Organisation'), col('plan', 'Plan'), col('period', 'Period'), col('source', 'Received'), col('method', 'Method'), col('reference', 'Reference'), col('amountPaise', 'Amount', 'money', { strong: true, tone: 'paid' })],
        rows,
        totals,
        summary: [
          { label: 'Revenue', value: totals.amountPaise, type: 'money', tone: 'paid' },
          { label: 'Payments', value: rows.length, type: 'number' },
          { label: 'Paying organisations', value: new Set(list.map((x) => String(x.organisationId))).size, type: 'number' },
          { label: 'Received online', value: online, type: 'money' },
        ],
      };
    },
  },
  {
    key: 'revenue-monthly',
    group: 'Revenue',
    icon: 'calendar',
    title: 'Monthly revenue',
    description: 'Revenue month by month with growth over the month before.',
    filters: ['range'],
    defaultFrom: (now) => iso(new Date(now.getFullYear(), now.getMonth() - 11, 1)),
    async run(p) {
      const list = await SubscriptionPayment.find({ ...PAID, paidAt: bounds(p) }).select('paidAt amountPaise organisationId source').lean();
      // Organisations paying for the first time ever, by the month of that first payment.
      const firsts = await SubscriptionPayment.aggregate([{ $match: PAID }, { $group: { _id: '$organisationId', first: { $min: '$paidAt' } } }]);
      const firstMonth = new Map(firsts.map((f) => [String(f._id), monthKey(new Date(f.first))]));
      const months = [];
      for (let d = new Date(`${p.from.slice(0, 7)}-01T00:00:00`); d <= new Date(`${p.to}T00:00:00`); d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.push(monthKey(d));
      const byMonth = new Map(months.map((k) => [k, { payments: 0, orgs: new Set(), fresh: new Set(), revenuePaise: 0, onlinePaise: 0 }]));
      for (const x of list) {
        const k = monthKey(new Date(x.paidAt));
        const m = byMonth.get(k);
        if (!m) continue;
        m.payments += 1;
        m.revenuePaise += x.amountPaise;
        if (x.source !== 'manual') m.onlinePaise += x.amountPaise;
        m.orgs.add(String(x.organisationId));
        if (firstMonth.get(String(x.organisationId)) === k) m.fresh.add(String(x.organisationId));
      }
      let prev = null;
      const rows = months.map((k) => {
        const m = byMonth.get(k);
        const growth = prev == null || prev === 0 ? null : pct(m.revenuePaise - prev, prev);
        prev = m.revenuePaise;
        return { month: monthLabel(k), payments: m.payments, organisations: m.orgs.size, newPaying: m.fresh.size, onlinePaise: m.onlinePaise, revenuePaise: m.revenuePaise, growth, _tone: growth == null ? null : growth >= 0 ? 'paid' : 'due' };
      });
      const totals = totalsOf(rows, ['payments', 'newPaying', 'onlinePaise', 'revenuePaise']);
      const best = rows.reduce((b, r) => (r.revenuePaise > (b?.revenuePaise ?? 0) ? r : b), null);
      return {
        columns: [col('month', 'Month'), col('payments', 'Payments', 'number'), col('organisations', 'Organisations paid', 'number'), col('newPaying', 'New paying', 'number'), col('onlinePaise', 'Online', 'money'), col('revenuePaise', 'Revenue', 'money', { strong: true, tone: 'paid' }), col('growth', 'Growth', 'percent', { signed: true, toneFromRow: true })],
        rows,
        totals,
        summary: [
          { label: 'Revenue', value: totals.revenuePaise, type: 'money', tone: 'paid' },
          { label: 'Average a month', value: rows.length ? Math.round(totals.revenuePaise / rows.length) : 0, type: 'money' },
          { label: 'Best month', value: best ? best.month : '—', type: 'text' },
          { label: 'New paying organisations', value: totals.newPaying, type: 'number' },
        ],
      };
    },
  },
  {
    key: 'revenue-by-plan',
    group: 'Revenue',
    icon: 'plan',
    title: 'Revenue by plan',
    description: 'Which plans bring the money in, and how many organisations are on each now.',
    filters: ['range'],
    async run(p) {
      const [list, plans, subs] = await Promise.all([
        SubscriptionPayment.find({ ...PAID, paidAt: bounds(p) }).select('planId planName amountPaise organisationId').lean(),
        Plan.find({}).lean(),
        Subscription.find({}).setOptions(SKIP).lean(),
      ]);
      const now = new Date();
      const rowsBy = new Map(plans.map((pl) => [String(pl._id), { plan: pl.name, price: pl.pricePaise, duration: pl.durationMonths, payments: 0, orgs: new Set(), revenuePaise: 0, current: 0 }]));
      const rowOf = (id, name) => {
        if (!rowsBy.has(String(id))) rowsBy.set(String(id), { plan: name ?? 'Old plan', price: null, duration: null, payments: 0, orgs: new Set(), revenuePaise: 0, current: 0 });
        return rowsBy.get(String(id));
      };
      for (const x of list) {
        const r = rowOf(x.planId, x.planName);
        r.payments += 1;
        r.revenuePaise += x.amountPaise;
        r.orgs.add(String(x.organisationId));
      }
      for (const s of subs) {
        const eff = effectiveSubscription(s, now);
        if (!eff.expired && eff.status !== 'trial' && s.planId) rowOf(s.planId, s.planName).current += 1;
      }
      const total = sum([...rowsBy.values()], (r) => r.revenuePaise);
      const rows = [...rowsBy.values()]
        .filter((r) => r.payments || r.current)
        .map((r) => ({ plan: r.plan, price: r.price, duration: r.duration ? `${r.duration} month${r.duration === 1 ? '' : 's'}` : '—', current: r.current, payments: r.payments, organisations: r.orgs.size, revenuePaise: r.revenuePaise, share: pct(r.revenuePaise, total) }))
        .sort((a, b) => b.revenuePaise - a.revenuePaise);
      const totals = totalsOf(rows, ['current', 'payments', 'revenuePaise']);
      return {
        columns: [col('plan', 'Plan', 'text', { strong: true }), col('price', 'Price', 'money'), col('duration', 'Period'), col('current', 'On it now', 'number'), col('payments', 'Payments', 'number'), col('organisations', 'Organisations paid', 'number'), col('revenuePaise', 'Revenue', 'money', { strong: true, tone: 'paid' }), col('share', 'Share', 'percent')],
        rows,
        totals,
        summary: [
          { label: 'Revenue', value: totals.revenuePaise, type: 'money', tone: 'paid' },
          { label: 'Top plan', value: rows[0]?.revenuePaise ? rows[0].plan : '—', type: 'text' },
          { label: 'Paying now', value: totals.current, type: 'number' },
          { label: 'Payments', value: totals.payments, type: 'number' },
        ],
      };
    },
  },

  // ------------------------------------------------ subscriptions
  {
    key: 'subscription-status',
    group: 'Subscriptions',
    icon: 'status',
    title: 'Subscription status',
    description: 'Every organisation: plan, status, when it ends and what it has paid in all.',
    filters: ['status'],
    async run(p) {
      const all = await organisationsWithBilling();
      const list = p.status ? all.filter((x) => (p.status === 'expired' ? x.eff.expired : !x.eff.expired && x.eff.status === p.status)) : all;
      const rows = list
        .map(({ org, sub, eff, owner, paid }) => ({
          organisation: org.name,
          owner: owner?.name ?? '—',
          mobile: owner?.mobile ?? org.phone ?? null,
          plan: sub?.planName ?? sub?.plan ?? '—',
          status: STATUS_LABEL[eff.expired ? 'expired' : eff.status] ?? eff.status,
          endsAt: eff.endsAt,
          daysLeft: eff.expired ? 0 : eff.daysLeft,
          lastPaid: paid.last,
          paidPaise: paid.total,
          _tone: statusTone(eff.expired ? 'expired' : eff.status),
          _links: { organisation: orgLink(org._id) },
        }))
        .sort((a, b) => (a.endsAt ? new Date(a.endsAt) : Infinity) - (b.endsAt ? new Date(b.endsAt) : Infinity));
      const count = (fn) => all.filter(fn).length;
      return {
        columns: [col('organisation', 'Organisation', 'text', { strong: true }), col('owner', 'Owner'), col('mobile', 'Mobile'), col('plan', 'Plan'), col('status', 'Status', 'text', { toneFromRow: true }), col('endsAt', 'Ends on', 'date'), col('daysLeft', 'Days left', 'number'), col('lastPaid', 'Last paid', 'date'), col('paidPaise', 'Paid in all', 'money')],
        rows,
        totals: totalsOf(rows, ['paidPaise']),
        summary: [
          { label: 'Paid', value: count((x) => !x.eff.expired && x.eff.status !== 'trial'), type: 'number', tone: 'paid' },
          { label: 'Free trial', value: count((x) => !x.eff.expired && x.eff.status === 'trial'), type: 'number' },
          { label: 'Expired', value: count((x) => x.eff.expired), type: 'number', tone: 'due' },
          { label: 'Organisations', value: all.length, type: 'number' },
        ],
      };
    },
  },
  {
    key: 'renewals',
    group: 'Subscriptions',
    icon: 'renew',
    title: 'Renewals due',
    description: 'Ending in the next 30 days or lapsed in the last 30 — who to call first.',
    filters: [],
    async run() {
      const now = Date.now();
      const all = await organisationsWithBilling();
      const rows = all
        .filter(({ eff }) => eff.endsAt && Math.abs(new Date(eff.endsAt).getTime() - now) <= 30 * DAY)
        .map(({ org, sub, eff, owner, paid }) => {
          const days = Math.ceil((new Date(eff.endsAt).getTime() - now) / DAY);
          return {
            organisation: org.name,
            owner: owner?.name ?? '—',
            mobile: owner?.mobile ?? org.phone ?? null,
            email: owner?.email ?? org.email ?? null,
            plan: sub?.planName ?? sub?.plan ?? '—',
            status: STATUS_LABEL[eff.expired ? 'expired' : eff.status] ?? eff.status,
            endsAt: eff.endsAt,
            when: eff.expired ? `Lapsed ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago` : days <= 0 ? 'Ends today' : `In ${days} day${days === 1 ? '' : 's'}`,
            paidPaise: paid.total,
            _days: days,
            _tone: eff.expired || days <= 3 ? 'due' : null,
            _links: { organisation: orgLink(org._id) },
          };
        })
        .sort((a, b) => a._days - b._days);
      const upcoming = rows.filter((r) => r._days >= 0);
      return {
        columns: [col('organisation', 'Organisation', 'text', { strong: true }), col('owner', 'Owner'), col('mobile', 'Mobile'), col('email', 'Email'), col('plan', 'Plan'), col('status', 'Status'), col('endsAt', 'Ends on', 'date'), col('when', 'When', 'text', { toneFromRow: true }), col('paidPaise', 'Paid in all', 'money')],
        rows,
        totals: {},
        summary: [
          { label: 'Ending in 7 days', value: upcoming.filter((r) => r._days <= 7).length, type: 'number', tone: 'due' },
          { label: 'Ending in 30 days', value: upcoming.length, type: 'number' },
          { label: 'Lapsed (30 days)', value: rows.length - upcoming.length, type: 'number', tone: 'due' },
          { label: 'Trials ending', value: upcoming.filter((r) => r.status === STATUS_LABEL.trial).length, type: 'number' },
        ],
      };
    },
  },

  // ------------------------------------------------ organisations
  {
    key: 'signups',
    group: 'Organisations',
    icon: 'signup',
    title: 'Sign-ups',
    description: 'New organisations in the period and how many went on to pay.',
    filters: ['range'],
    async run(p) {
      const list = await organisationsWithBilling({ createdAt: bounds(p) });
      const ids = list.map((x) => x.org._id);
      const branches = await countsByOrg(Branch, { status: BRANCH_STATUS.ACTIVE }, ids);
      const rows = list
        .map(({ org, eff, owner, paid }) => ({
          joined: org.createdAt,
          organisation: org.name,
          owner: owner?.name ?? '—',
          email: owner?.email ?? org.email ?? null,
          mobile: owner?.mobile ?? org.phone ?? null,
          state: org.address?.stateCode ? stateName(org.address.stateCode) : null,
          branches: branches.get(String(org._id)) ?? 0,
          status: STATUS_LABEL[eff.expired ? 'expired' : eff.status] ?? eff.status,
          paidPaise: paid.total,
          _paid: paid.total > 0,
          _tone: statusTone(eff.expired ? 'expired' : eff.status),
          _links: { organisation: orgLink(org._id) },
        }))
        .sort((a, b) => new Date(a.joined) - new Date(b.joined));
      const converted = rows.filter((r) => r._paid).length;
      return {
        columns: [col('joined', 'Joined', 'date'), col('organisation', 'Organisation', 'text', { strong: true }), col('owner', 'Owner'), col('email', 'Email'), col('mobile', 'Mobile'), col('state', 'State'), col('branches', 'Branches', 'number'), col('status', 'Status', 'text', { toneFromRow: true }), col('paidPaise', 'Paid so far', 'money')],
        rows,
        totals: totalsOf(rows, ['branches', 'paidPaise']),
        summary: [
          { label: 'Sign-ups', value: rows.length, type: 'number' },
          { label: 'Became paying', value: converted, type: 'number', tone: 'paid' },
          { label: 'Conversion', value: pct(converted, rows.length), type: 'percent' },
          { label: 'Paid by them', value: sum(rows, (r) => r.paidPaise), type: 'money', tone: 'paid' },
        ],
      };
    },
  },
  {
    key: 'usage',
    group: 'Organisations',
    icon: 'usage',
    title: 'Organisation usage',
    description: 'How much each organisation uses the software: branches, users, stock, bills and last sign-in.',
    filters: ['range'],
    defaultFrom: (now) => iso(new Date(now.getFullYear(), now.getMonth() - 2, 1)),
    async run(p) {
      const list = await organisationsWithBilling();
      const ids = list.map((x) => x.org._id);
      const [branches, users, products, bills, lastLogins] = await Promise.all([
        countsByOrg(Branch, { status: BRANCH_STATUS.ACTIVE }, ids),
        countsByOrg(User, { status: USER_STATUS.ACTIVE }, ids),
        countsByOrg(Product, { isDeleted: { $ne: true } }, ids),
        countsByOrg(Sale, { status: SALE_STATUS.COMPLETED, createdAt: bounds(p) }, ids),
        User.aggregate([{ $match: { organisationId: { $in: ids } } }, { $group: { _id: '$organisationId', last: { $max: '$lastLoginAt' } } }]).option(SKIP),
      ]);
      const lastOf = new Map(lastLogins.map((l) => [String(l._id), l.last]));
      const staleBefore = Date.now() - 14 * DAY;
      const rows = list
        .map(({ org, sub, eff }) => {
          const id = String(org._id);
          const last = lastOf.get(id) ?? null;
          return {
            organisation: org.name,
            plan: sub?.planName ?? sub?.plan ?? '—',
            status: STATUS_LABEL[eff.expired ? 'expired' : eff.status] ?? eff.status,
            branches: branches.get(id) ?? 0,
            users: users.get(id) ?? 0,
            products: products.get(id) ?? 0,
            bills: bills.get(id) ?? 0,
            lastLogin: last,
            _tone: !last || new Date(last).getTime() < staleBefore ? 'due' : null,
            _links: { organisation: orgLink(org._id) },
          };
        })
        .sort((a, b) => b.bills - a.bills || b.products - a.products);
      const totals = totalsOf(rows, ['branches', 'users', 'products', 'bills']);
      return {
        columns: [col('organisation', 'Organisation', 'text', { strong: true }), col('plan', 'Plan'), col('status', 'Status'), col('branches', 'Branches', 'number'), col('users', 'Users', 'number'), col('products', 'Products', 'number'), col('bills', 'Bills in period', 'number', { strong: true }), col('lastLogin', 'Last sign-in', 'date', { toneFromRow: true })],
        rows,
        totals,
        summary: [
          { label: 'Bills in period', value: totals.bills, type: 'number' },
          { label: 'Active (billed)', value: rows.filter((r) => r.bills > 0).length, type: 'number', tone: 'paid' },
          { label: 'Not signed in 14 days', value: rows.filter((r) => r._tone === 'due').length, type: 'number', tone: 'due' },
          { label: 'Products added', value: totals.products, type: 'number' },
        ],
        note: 'Last sign-in in red: nobody from that organisation has signed in for 14 days or more.',
      };
    },
  },
];

const BY_KEY = new Map(REPORTS.map((r) => [r.key, r]));

export function listPlatformReports() {
  return REPORTS.map(({ key, group, icon, title, description, filters }) => ({ key, group, icon, title, description, filters }));
}

export async function runPlatformReport(key, query) {
  const report = BY_KEY.get(key);
  if (!report) throw ApiError.notFound('Report');
  const now = new Date();
  const params = {
    from: query.from ?? report.defaultFrom?.(now) ?? iso(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: query.to ?? iso(now),
    status: query.status ?? null,
  };
  if (params.from > params.to) throw ApiError.badRequest('“From” date is after “To” date', [{ path: 'from', message: 'Must be on or before the To date' }], 'VALIDATION_ERROR');
  const result = await report.run(params);
  const truncated = result.rows.length > ROW_LIMIT;
  const rows = (truncated ? result.rows.slice(0, ROW_LIMIT) : result.rows).map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !k.startsWith('_') || k === '_tone' || k === '_links')));
  return {
    key,
    group: report.group,
    title: report.title,
    description: report.description,
    filters: report.filters,
    params,
    ...result,
    rows,
    note: [result.note, truncated ? `Showing the first ${ROW_LIMIT} rows — narrow the dates to see the rest.` : null].filter(Boolean).join(' ') || null,
    generatedAt: new Date(),
  };
}
