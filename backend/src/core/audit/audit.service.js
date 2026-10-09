import { logger } from '../../config/logger.js';
import { getContext } from '../context/requestContext.js';
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
  await AuditLog.create([doc], { session });
}
