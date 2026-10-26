import { withTransaction } from '../../config/db.js';
import { PlatformUndoAction } from '../../core/undo/platformUndoAction.model.js';
import { UNDO_STATUS } from '../../core/undo/undoAction.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { paginate } from '../../utils/pagination.js';
import { PlatformAdmin } from './platformAdmin.model.js';
import { recordPlatformAudit } from './platformAuth.service.js';
import { platformUndoHandlers } from './platformUndo.handlers.js';

/*
 * Undo for the Super Admin panel: the platform's own stack (organisations, plans, subscriptions, email settings),
 * kept apart from every organisation's. Same rules as theirs (modules/undo/undo.service.js): newest first, a reason
 * every time, never twice, one transaction, and the action itself is never removed — only marked.
 */

const HANDLERS = new Map(platformUndoHandlers.map((h) => [h.type, h]));
const newestFirst = { createdAt: -1, _id: -1 };

async function checkEntry(entry) {
  const handler = HANDLERS.get(entry.type);
  if (!handler) return { ok: false, reason: 'This action can no longer be undone.' };
  try {
    return await handler.check(entry);
  } catch (err) {
    if (err instanceof ApiError && err.status < 500) return { ok: false, reason: err.message };
    throw err;
  }
}

const settle = (entry, status, adminId, { reason, mode = null, result, auditId = null }) =>
  PlatformUndoAction.findOneAndUpdate({ _id: entry._id, status: UNDO_STATUS.ACTIVE }, { $set: { status, resolution: { at: new Date(), byAdminId: adminId, reason, mode, result, auditId } } }, { new: true }).lean();

async function top() {
  for (let i = 0; i < 25; i += 1) {
    const entry = await PlatformUndoAction.findOne({ status: UNDO_STATUS.ACTIVE }).sort(newestFirst).lean();
    if (!entry) return { entry: null };
    const check = await checkEntry(entry);
    if (!check.superseded) return { entry, check };
    await settle(entry, UNDO_STATUS.SUPERSEDED, null, { reason: check.reason ?? 'Already reversed' });
  }
  return { entry: null };
}

async function serialize(entries, checks = new Map()) {
  const ids = [...new Set(entries.flatMap((e) => [e.createdByAdminId, e.resolution?.byAdminId]).filter(Boolean).map(String))];
  const admins = new Map((await PlatformAdmin.find({ _id: { $in: ids } }).select('name').lean()).map((a) => [String(a._id), { id: a._id, name: a.name }]));
  return entries.map((e) => {
    const handler = HANDLERS.get(e.type);
    const check = checks.get(String(e._id));
    return {
      id: e._id,
      scope: 'platform',
      type: e.type,
      title: handler?.title ?? e.type,
      mode: handler?.mode ?? null,
      recordType: e.recordType,
      recordId: e.recordId,
      organisationId: e.organisationId,
      label: e.label,
      createdBy: admins.get(String(e.createdByAdminId)) ?? null,
      createdAt: e.createdAt,
      status: e.status,
      resolution: e.resolution ? { ...e.resolution, by: admins.get(String(e.resolution.byAdminId)) ?? null } : null,
      ...(check && { canUndo: Boolean(check.ok), effect: check.effect ?? null, blockedBy: check.ok ? null : (check.reason ?? 'It cannot be undone safely.') }),
    };
  });
}

/** The platform's latest action that can still be undone (or why not). */
export async function platformLatest() {
  const { entry, check } = await top();
  return entry ? (await serialize([entry], new Map([[String(entry._id), check]])))[0] : null;
}

async function loadTop(id) {
  const entry = await PlatformUndoAction.findById(id).lean();
  if (!entry) throw ApiError.notFound('Action');
  if (entry.status !== UNDO_STATUS.ACTIVE) throw ApiError.conflict('This action was already undone or closed.', 'UNDO_ALREADY_DONE');
  const { entry: newest, check } = await top();
  if (!newest) throw ApiError.conflict('This action was already reversed another way.', 'UNDO_SUPERSEDED');
  if (String(newest._id) !== String(entry._id)) throw ApiError.conflict('Undo the newer action first — only the latest action can be undone.', 'UNDO_NOT_LATEST');
  return { entry, check, handler: HANDLERS.get(entry.type) };
}

export async function platformUndo(id, { reason }, admin, meta) {
  const { entry, check, handler } = await loadTop(id);
  if (!handler || !check.ok) throw ApiError.conflict(check.reason ?? 'It cannot be undone safely.', 'UNDO_BLOCKED');
  const undoMeta = { ...meta, undoRun: true };
  await withTransaction(async () => {
    const claimed = await settle(entry, UNDO_STATUS.UNDONE, admin.adminId, { reason, mode: handler.mode });
    if (!claimed) throw ApiError.conflict('This action was already undone.', 'UNDO_ALREADY_DONE');
    const again = await checkEntry(entry);
    if (!again.ok) throw ApiError.conflict(again.reason ?? 'It cannot be undone safely.', 'UNDO_BLOCKED');
    const ran = await handler.run(entry, { reason, admin, meta: undoMeta });
    const result = ran && typeof ran === 'object' && ran.id ? { id: ran.id, name: ran.name ?? null } : undefined;
    const audit = await recordPlatformAudit({ adminId: admin.adminId, action: 'undo', organisationId: entry.organisationId, changes: { undoOf: entry._id, type: entry.type, title: handler.title, label: entry.label, reason } }, undoMeta);
    await PlatformUndoAction.updateOne({ _id: entry._id }, { $set: { 'resolution.result': result, 'resolution.auditId': audit._id } });
  });
  return (await serialize([await PlatformUndoAction.findById(id).lean()]))[0];
}

export async function platformDismiss(id, { reason }, admin, meta) {
  const { entry, check } = await loadTop(id);
  if (check.ok) throw ApiError.conflict('This action can be undone — undo it instead of keeping it.', 'UNDO_POSSIBLE');
  const audit = await recordPlatformAudit({ adminId: admin.adminId, action: 'undo_dismiss', organisationId: entry.organisationId, changes: { undoOf: entry._id, type: entry.type, label: entry.label, reason, blockedBy: check.reason } }, meta);
  const done = await settle(entry, UNDO_STATUS.DISMISSED, admin.adminId, { reason, result: { blockedBy: check.reason }, auditId: audit._id });
  if (!done) throw ApiError.conflict('This action was already closed.', 'UNDO_ALREADY_DONE');
  return (await serialize([done]))[0];
}

export async function platformUndoHistory({ page, limit, status }) {
  const filter = status ? { status } : {};
  const { items, meta } = await paginate(PlatformUndoAction.find(filter).sort(newestFirst), PlatformUndoAction.countDocuments(filter), { page, limit });
  return { items: await serialize(items), meta };
}
