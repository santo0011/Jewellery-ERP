import mongoose from 'mongoose';
import { AuditLog } from '../../core/audit/auditLog.model.js';
import { requireContext } from '../../core/context/requestContext.js';
import { escapeRegex } from '../../utils/pagination.js';
import { Organisation } from '../organisations/organisation.model.js';
import { User } from '../users/user.model.js';

const startOfDay = (date, timezoneOffsetMinutes) => new Date(Date.parse(`${date}T00:00:00Z`) - timezoneOffsetMinutes * 60000);

function offsetMinutes(timeZone, at = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(at);
  const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(parts.find((p) => p.type === 'timeZoneName')?.value ?? '');
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
  return match[1] === '-' ? -minutes : minutes;
}

export async function listAuditLogs({ page, limit, q, module, action, userId, recordId, from, to }) {
  const { organisationId } = requireContext();
  const organisation = await Organisation.findById(organisationId).select('timezone').lean();
  const timezone = organisation?.timezone ?? 'Asia/Kolkata';
  const filter = { organisationId: new mongoose.Types.ObjectId(organisationId) };
  if (module) filter.module = module;
  if (action) filter.action = action;
  if (userId) filter.userId = new mongoose.Types.ObjectId(userId);
  if (recordId) filter.recordId = new mongoose.Types.ObjectId(recordId);

  const offset = offsetMinutes(timezone);
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = startOfDay(from, offset);
    if (to) filter.createdAt.$lt = new Date(startOfDay(to, offset).getTime() + 86400000);
  }

  if (q && !userId) {
    const rx = new RegExp(escapeRegex(q), 'i');
    const users = await User.find({ $or: [{ name: rx }, { email: rx }] }).select('_id').lean();
    filter.userId = { $in: users.map((u) => u._id) };
  }

  const [items, total] = await Promise.all([
    AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments(filter),
  ]);

  const userIds = [...new Set(items.map((i) => i.userId && String(i.userId)).filter(Boolean))];
  const users = userIds.length ? await User.find({ _id: { $in: userIds } }).select('name email').lean() : [];
  const usersById = new Map(users.map((u) => [String(u._id), { id: u._id, name: u.name, email: u.email }]));

  return {
    items: items.map((i) => ({
      id: i._id,
      action: i.action,
      module: i.module,
      recordType: i.recordType,
      recordId: i.recordId,
      changes: i.changes ?? [],
      meta: i.meta ?? null,
      user: i.userId ? (usersById.get(String(i.userId)) ?? null) : null,
      ip: i.ip ?? null,
      createdAt: i.createdAt,
    })),
    meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  };
}
