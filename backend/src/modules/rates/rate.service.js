import { withTransaction } from '../../config/db.js';
import { AUDIT_ACTIONS, recordAudit } from '../../core/audit/audit.service.js';
import { requireContext } from '../../core/context/requestContext.js';
import { ApiError } from '../../utils/ApiError.js';
import { dayRange, todayContext } from '../../utils/businessDate.js';
import { getSettings } from '../settings/settings.service.js';
import { User } from '../users/user.model.js';
import { MetalRate } from './rate.model.js';

const serialize = (r, users) => ({
  id: r._id,
  metal: r.metal,
  purity: r.purity,
  ratePerGramPaise: r.ratePerGramPaise,
  effectiveAt: r.effectiveAt,
  businessDate: r.businessDate,
  note: r.note,
  createdBy: users?.get(String(r.createdBy)) ?? null,
});

export async function currentRates() {
  const rows = await MetalRate.aggregate([
    { $sort: { effectiveAt: -1 } },
    { $group: { _id: { metal: '$metal', purity: '$purity' }, doc: { $first: '$$ROOT' } } },
    { $replaceRoot: { newRoot: '$doc' } },
    { $sort: { metal: 1, purity: -1 } },
  ]);
  const { businessDate } = await todayContext();
  return rows.map((r) => ({ ...serialize(r), isToday: r.businessDate === businessDate }));
}

export async function getApplicableRate(metal, purity, at = new Date(), { session } = {}) {
  return MetalRate.findOne({ metal, purity, effectiveAt: { $lte: at } }).sort({ effectiveAt: -1 }).session(session ?? null).lean();
}

export async function setRates({ rates, note }) {
  const { userId } = requireContext();
  const [{ jewellery }, today] = await Promise.all([getSettings(), todayContext()]);
  const disabled = rates.filter((r) => !jewellery.enabledPurities[r.metal]?.includes(r.purity));
  if (disabled.length) {
    throw ApiError.badRequest('Some purities are turned off in Business settings', disabled.map((r) => ({ path: `${r.metal}.${r.purity}`, message: 'Purity is disabled' })), 'VALIDATION_ERROR');
  }

  const docs = await withTransaction(async (session) => {
    const created = await MetalRate.create(
      rates.map((r) => ({ ...r, effectiveAt: today.now, businessDate: today.businessDate, note: note ?? null, createdBy: userId })),
      { session, ordered: true },
    );
    await recordAudit(
      {
        action: AUDIT_ACTIONS.CREATE,
        module: 'rate',
        recordType: 'MetalRate',
        meta: { businessDate: today.businessDate, count: rates.length },
        changes: rates.map((r) => ({ field: `${r.metal} ${r.purity}`, from: null, to: r.ratePerGramPaise })),
      },
      { session },
    );
    return created;
  });
  return docs.map((d) => serialize(d.toObject()));
}

export async function rateHistory({ page, limit, metal, purity, from, to }) {
  const { timezone } = await todayContext();
  const filter = {};
  if (metal) filter.metal = metal;
  if (purity) filter.purity = purity;
  if (from || to) filter.effectiveAt = dayRange(from, to, timezone);

  const [items, total] = await Promise.all([
    MetalRate.find(filter).sort({ effectiveAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    MetalRate.countDocuments(filter),
  ]);
  const userIds = [...new Set(items.map((i) => String(i.createdBy)))];
  const users = new Map((await User.find({ _id: { $in: userIds } }).select('name').lean()).map((u) => [String(u._id), { id: u._id, name: u.name }]));
  return { items: items.map((r) => serialize(r, users)), meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } };
}
