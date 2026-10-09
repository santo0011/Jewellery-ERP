import { APPROVAL_STATUS, hasPermission } from '@jerp/shared';
import { withTransaction } from '../../config/db.js';
import { User } from '../../modules/users/user.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { AUDIT_ACTIONS, recordAudit } from '../audit/audit.service.js';
import { requireContext } from '../context/requestContext.js';
import { ApprovalRequest } from './approvalRequest.model.js';

/**
 * Modules register a handler per document type:
 *   { permission, label, approve(docId, ctx, { session }), reject(docId, ctx, { session }) }
 */
const handlers = new Map();

export function registerApprovalHandler(docType, handler) {
  handlers.set(docType, handler);
}

const allowedDocTypes = (permissions) => [...handlers.entries()].filter(([, h]) => hasPermission(permissions, h.permission)).map(([type]) => type);

export async function requestApproval({ docType, docId, docNo, branchId, summary }, { session }) {
  if (!handlers.has(docType)) throw new Error(`No approval handler for ${docType}`);
  const [request] = await ApprovalRequest.create([{ docType, docId, docNo, branchId, summary, requestedBy: requireContext().userId }], { session });
  await recordAudit({ action: AUDIT_ACTIONS.SUBMIT, module: 'approval', recordType: 'ApprovalRequest', recordId: docId, meta: { docType, docNo, name: docNo } }, { session });
  return request;
}

export async function listApprovals({ page, limit, status }) {
  const { permissions } = requireContext();
  const filter = { docType: { $in: allowedDocTypes(permissions) } };
  if (status) filter.status = status;
  const [items, total] = await Promise.all([
    ApprovalRequest.find(filter).sort({ status: 1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    ApprovalRequest.countDocuments(filter),
  ]);
  const ids = [...new Set(items.flatMap((i) => [i.requestedBy, i.decidedBy]).filter(Boolean).map(String))];
  const users = new Map((await User.find({ _id: { $in: ids } }).select('name').lean()).map((u) => [String(u._id), { id: u._id, name: u.name }]));
  return {
    items: items.map((i) => ({
      id: i._id,
      docType: i.docType,
      docTypeLabel: handlers.get(i.docType)?.label ?? i.docType,
      docId: i.docId,
      docNo: i.docNo,
      summary: i.summary,
      status: i.status,
      requestedBy: users.get(String(i.requestedBy)) ?? null,
      decidedBy: i.decidedBy ? (users.get(String(i.decidedBy)) ?? null) : null,
      decidedAt: i.decidedAt,
      comment: i.comment,
      createdAt: i.createdAt,
    })),
    meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  };
}

export async function pendingCount() {
  const { permissions } = requireContext();
  return ApprovalRequest.countDocuments({ status: APPROVAL_STATUS.PENDING, docType: { $in: allowedDocTypes(permissions) } });
}

export async function decide(id, { decision, comment }) {
  const ctx = requireContext();
  const request = await ApprovalRequest.findById(id);
  if (!request) throw ApiError.notFound('Approval request');
  const handler = handlers.get(request.docType);
  if (!handler || !hasPermission(ctx.permissions, handler.permission)) throw ApiError.forbidden();
  if (request.status !== APPROVAL_STATUS.PENDING) throw ApiError.conflict(`This request was already ${request.status}`, 'ALREADY_DECIDED');
  if (String(request.requestedBy) === ctx.userId && !ctx.fullAccess) {
    throw ApiError.forbidden('You cannot approve your own request. Ask another approver.', 'SELF_APPROVAL');
  }

  await withTransaction(async (session) => {
    const claimed = await ApprovalRequest.findOneAndUpdate(
      { _id: request._id, status: APPROVAL_STATUS.PENDING },
      { $set: { status: decision === 'approve' ? APPROVAL_STATUS.APPROVED : APPROVAL_STATUS.REJECTED, decidedBy: ctx.userId, decidedAt: new Date(), comment: comment ?? null } },
      { session, returnDocument: 'after' },
    );
    if (!claimed) throw ApiError.conflict('This request was already decided', 'ALREADY_DECIDED');
    if (decision === 'approve') await handler.approve(request.docId, { session });
    else await handler.reject(request.docId, { session, comment });
    await recordAudit(
      { action: decision === 'approve' ? AUDIT_ACTIONS.APPROVE : AUDIT_ACTIONS.REJECT, module: 'approval', recordType: 'ApprovalRequest', recordId: request.docId, meta: { docType: request.docType, docNo: request.docNo, name: request.docNo, comment } },
      { session },
    );
  });
  return { id: request._id, status: decision === 'approve' ? APPROVAL_STATUS.APPROVED : APPROVAL_STATUS.REJECTED };
}
