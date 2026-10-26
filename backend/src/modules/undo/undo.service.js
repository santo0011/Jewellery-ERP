import { hasPermission } from '@jerp/shared';
import { withTransaction } from '../../config/db.js';
import { AUDIT_ACTIONS, recordAudit } from '../../core/audit/audit.service.js';
import { getContext, requireContext, runWithContext } from '../../core/context/requestContext.js';
import { UNDO_STATUS, UndoAction } from '../../core/undo/undoAction.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { paginate } from '../../utils/pagination.js';
import { Branch } from '../branches/branch.model.js';
import { canAccessBranch, nameMaps, oid, pick } from '../inventory/inventory.helpers.js';
import { handlerFor } from './undo.registry.js';

/*
 * Undo, for the organisation and branch panels. Every action that can be taken back sits on a stack: the
 * organisation's (shared records — settings, users, customers …) or one branch's (its bills, stock, expenses …).
 * Only the newest action still active on a stack can be undone; once it is, the one before it comes up.
 *
 * Each kind of action has a handler (undo.registry.js) that checks whether it is still safe to take back (nothing
 * has been built on it since) and then takes it back — by putting the record back as it was (mode 'undo') or, for
 * money and stock, through the module's own reversing workflow, which adds a reversing entry and keeps the original
 * (mode 'reversal'). The undo runs in one transaction with the handler, so it all happens or none of it does.
 * Nothing is deleted from the record of what happened: the action stays, marked with who undid it, when and why.
 */

const MAX_SKIP = 25; // superseded actions skipped per look at a stack

const stackOf = (e) => ({ scope: e.scope, branchId: e.scope === 'branch' ? oid(e.branchId) : null });
const newestFirst = { createdAt: -1, _id: -1 };

function canUseStack(scope, branchId) {
  const { branchAccess } = requireContext();
  return scope === 'organisation' ? Boolean(branchAccess?.all) : Boolean(branchId) && canAccessBranch(branchId);
}

function assertStack(scope, branchId) {
  if (!canUseStack(scope, branchId)) throw ApiError.forbidden('You cannot undo actions of this panel', 'UNDO_FORBIDDEN');
}

/** The permissions the handler needs, as a list. */
const neededPermissions = (handler) => [handler.permission ?? []].flat();
const allowed = (handler) => {
  const { permissions } = requireContext();
  return neededPermissions(handler).every((p) => hasPermission(permissions, p));
};

async function settle(entry, status, { reason, mode = null, result, auditLogId = null }) {
  const { userId } = getContext() ?? {};
  return UndoAction.findOneAndUpdate(
    { _id: entry._id, status: UNDO_STATUS.ACTIVE },
    { $set: { status, resolution: { at: new Date(), by: userId ?? null, reason, mode, result, auditLogId } } },
    { new: true },
  ).lean();
}

/** Asks the handler whether the action can still be taken back. A missing handler means it cannot. */
async function checkEntry(entry) {
  const handler = handlerFor(entry.type);
  if (!handler) return { ok: false, reason: 'This action can no longer be undone.' };
  try {
    return await handler.check(entry);
  } catch (err) {
    if (err instanceof ApiError && err.status < 500) return { ok: false, reason: err.message };
    throw err;
  }
}

/**
 * The newest active action of a stack. Ones already reversed some other way (an invoice cancelled from its own
 * page, a customer deleted …) are marked superseded on the way, so the stack moves on to the one before.
 */
async function topOf(scope, branchId) {
  const stack = { scope, branchId: scope === 'branch' ? oid(branchId) : null };
  for (let i = 0; i < MAX_SKIP; i += 1) {
    const entry = await UndoAction.findOne({ ...stack, status: UNDO_STATUS.ACTIVE }).sort(newestFirst).lean();
    if (!entry) return { entry: null };
    const check = await checkEntry(entry);
    if (!check.superseded) return { entry, check };
    await settle(entry, UNDO_STATUS.SUPERSEDED, { reason: check.reason ?? 'Already reversed' });
  }
  return { entry: null };
}

async function serialize(entries, checks = new Map()) {
  const maps = await nameMaps({ branchIds: entries.map((e) => e.branchId), userIds: entries.flatMap((e) => [e.createdBy, e.resolution?.by]) });
  return entries.map((e) => {
    const handler = handlerFor(e.type);
    const check = checks.get(String(e._id));
    return {
      id: e._id,
      scope: e.scope,
      branch: e.branchId ? (pick(maps.branches, e.branchId) ?? { id: e.branchId }) : null,
      type: e.type,
      module: e.module,
      title: handler?.title ?? e.type,
      mode: handler?.mode ?? null,
      recordType: e.recordType,
      recordId: e.recordId,
      label: e.label,
      createdBy: pick(maps.users, e.createdBy) ?? null,
      createdAt: e.createdAt,
      status: e.status,
      resolution: e.resolution ? { ...e.resolution, by: pick(maps.users, e.resolution.by) ?? null } : null,
      ...(check && {
        canUndo: Boolean(check.ok) && allowed(handler),
        effect: check.effect ?? null,
        blockedBy: check.ok ? (allowed(handler) ? null : 'You do not have permission to undo this action.') : (check.reason ?? 'It cannot be undone safely.'),
      }),
    };
  });
}

/** The latest action of every stack this person can undo in: the organisation's (if they see every branch) and each of their branches'. */
export async function listStacks() {
  const { branchAccess } = requireContext();
  const branches = await Branch.find(branchAccess?.all ? {} : { _id: { $in: (branchAccess?.branchIds ?? []).map(oid) } })
    .select('name code isHeadOffice')
    .sort({ isHeadOffice: -1, name: 1 })
    .lean();
  const stacks = [...(branchAccess?.all ? [{ scope: 'organisation', branchId: null, branch: null }] : []), ...branches.map((b) => ({ scope: 'branch', branchId: b._id, branch: { id: b._id, name: b.name, code: b.code } }))];
  const out = [];
  for (const s of stacks) {
    const { entry, check } = await topOf(s.scope, s.branchId);
    const [latest] = entry ? await serialize([entry], new Map([[String(entry._id), check]])) : [null];
    out.push({ scope: s.scope, branch: s.branch, latest });
  }
  return out;
}

async function loadTop(id) {
  const entry = await UndoAction.findById(id).lean();
  if (!entry) throw ApiError.notFound('Action');
  assertStack(entry.scope, entry.branchId);
  if (entry.status !== UNDO_STATUS.ACTIVE) throw ApiError.conflict('This action was already undone or closed.', 'UNDO_ALREADY_DONE');
  const { entry: top, check } = await topOf(entry.scope, entry.branchId);
  if (!top) throw ApiError.conflict('This action was already reversed another way.', 'UNDO_SUPERSEDED');
  if (String(top._id) !== String(entry._id)) throw ApiError.conflict('Undo the newer action first — only the latest action can be undone.', 'UNDO_NOT_LATEST');
  return { entry, check, handler: handlerFor(entry.type) };
}

export async function undoAction(id, { reason }) {
  const { entry, check, handler } = await loadTop(id);
  if (!handler) throw ApiError.conflict('This action can no longer be undone.', 'UNDO_BLOCKED');
  if (!allowed(handler)) throw ApiError.forbidden('You do not have permission to undo this action.', 'UNDO_FORBIDDEN');
  if (!check.ok) throw ApiError.conflict(check.reason ?? 'It cannot be undone safely.', 'UNDO_BLOCKED');

  // Inside the undo, actions the handler does (a cancellation, a reversing entry …) are not put on a stack again.
  await runWithContext({ ...requireContext(), undoRun: true }, () =>
    withTransaction(async () => {
      const claimed = await settle(entry, UNDO_STATUS.UNDONE, { reason, mode: handler.mode });
      if (!claimed) throw ApiError.conflict('This action was already undone.', 'UNDO_ALREADY_DONE');
      // Checked again inside the transaction: something may have changed since.
      const again = await checkEntry(entry);
      if (!again.ok) throw ApiError.conflict(again.reason ?? 'It cannot be undone safely.', 'UNDO_BLOCKED');
      const result = (await handler.run(entry, { reason })) ?? undefined;
      const log = await recordAudit({
        action: AUDIT_ACTIONS.UNDO,
        module: entry.module,
        recordType: entry.recordType,
        recordId: entry.recordId,
        meta: { name: entry.label, undoOf: entry._id, type: entry.type, title: handler.title, mode: handler.mode, reason, ...(result && { result }) },
      });
      await UndoAction.updateOne({ _id: entry._id }, { $set: { 'resolution.result': result, 'resolution.auditLogId': log?._id ?? null } });
    }),
  );
  return getUndoAction(id);
}

/** Keeps an action that cannot be undone safely and moves the stack on to the one before it. */
export async function dismissAction(id, { reason }) {
  const { entry, check } = await loadTop(id);
  if (check.ok) throw ApiError.conflict('This action can be undone — undo it instead of keeping it.', 'UNDO_POSSIBLE');
  await withTransaction(async () => {
    const log = await recordAudit({ action: AUDIT_ACTIONS.UNDO_DISMISS, module: entry.module, recordType: entry.recordType, recordId: entry.recordId, meta: { name: entry.label, undoOf: entry._id, type: entry.type, reason, blockedBy: check.reason } });
    const done = await settle(entry, UNDO_STATUS.DISMISSED, { reason, result: { blockedBy: check.reason }, auditLogId: log?._id ?? null });
    if (!done) throw ApiError.conflict('This action was already closed.', 'UNDO_ALREADY_DONE');
  });
  return getUndoAction(id);
}

export async function getUndoAction(id) {
  const entry = await UndoAction.findById(id).lean();
  if (!entry || !canUseStack(entry.scope, entry.branchId)) throw ApiError.notFound('Action');
  return (await serialize([entry]))[0];
}

/** Everything that went on a stack, newest first: still active, undone, kept or reversed another way. */
export async function listHistory({ page, limit, scope, branchId, status, module }) {
  const { branchAccess } = requireContext();
  const filter = {
    ...(branchAccess?.all ? {} : { scope: 'branch', branchId: { $in: (branchAccess?.branchIds ?? []).map(oid) } }),
    ...(scope && { scope }),
    ...(branchId && { branchId: oid(branchId) }),
    ...(status && { status }),
    ...(module && { module }),
  };
  if (branchId && !canAccessBranch(branchId)) return { items: [], meta: { page, limit, total: 0, pages: 0 } };
  const { items, meta } = await paginate(UndoAction.find(filter).sort(newestFirst), UndoAction.countDocuments(filter), { page, limit });
  return { items: await serialize(items), meta };
}

export { stackOf };
