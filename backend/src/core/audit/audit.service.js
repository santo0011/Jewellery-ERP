import { logger } from '../../config/logger.js';
import { getContext } from '../context/requestContext.js';
import { UndoAction } from '../undo/undoAction.model.js';
import { AuditLog } from './auditLog.model.js';

export const AUDIT_ACTIONS = Object.freeze({
  LOGIN: 'login',
  LOGIN_FAILED: 'login_failed',
  LOGOUT: 'logout',
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  STATUS_CHANGE: 'status_change',
  PASSWORD_CHANGE: 'password_change',
  PASSWORD_RESET: 'password_reset',
  SESSION_REVOKE: 'session_revoke',
  TOKEN_REUSE: 'token_reuse',
  SUBMIT: 'submit',
  APPROVE: 'approve',
  REJECT: 'reject',
  POST: 'post',
  DISPATCH: 'dispatch',
  RECEIVE: 'receive',
  CANCEL: 'cancel',
  RETURN: 'return',
  UNDO: 'undo',
  UNDO_DISMISS: 'undo_dismiss',
});

export async function recordAudit(entry, { session, actor } = {}) {
  const ctx = { ...getContext(), ...actor };
  const doc = {
    organisationId: entry.organisationId ?? ctx.organisationId,
    userId: entry.userId ?? ctx.userId ?? null,
    action: entry.action,
    module: entry.module,
    recordType: entry.recordType ?? null,
    recordId: entry.recordId ?? null,
    changes: entry.changes?.length ? entry.changes : undefined,
    meta: entry.meta,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    requestId: ctx.requestId,
  };
  if (!doc.organisationId) {
    logger.warn({ entry }, 'Audit entry skipped: no organisation');
    return;
  }
  const [log] = await AuditLog.create([doc], { session });
  if (entry.undo && !ctx.undoRun) await registerUndo(entry, log, ctx, session);
  return log;
}

/**
 * Puts an action on its Undo stack, in the same transaction as the action itself. `entry.undo`:
 * { type, label?, data?, branchId?, recordType?, recordId? } — `type` names the handler that can take it back
 * (modules/undo/undo.registry.js); recordType/recordId when the action's own record is not the audit entry's
 * (a receipt recorded on the customer's history, say).
 * The stack is the record's branch; records shared by the organisation go on the organisation's stack, unless the
 * person works in particular branches only — then on the branch they were working in.
 * Actions done by an undo itself (ctx.undoRun) are never put on a stack.
 */
async function registerUndo(entry, log, ctx, session) {
  const { type, label = entry.meta?.name ?? null, data, branchId: own, recordType = entry.recordType ?? null, recordId = entry.recordId ?? null } = entry.undo;
  const branchId = own !== undefined ? own : ctx.branchAccess?.all ? null : (ctx.branchId ?? null);
  await UndoAction.create(
    [
      {
        organisationId: log.organisationId,
        scope: branchId ? 'branch' : 'organisation',
        branchId,
        type,
        module: entry.module,
        recordType,
        recordId,
        label,
        data,
        auditLogId: log._id,
        createdBy: log.userId,
      },
    ],
    { session },
  );
}
