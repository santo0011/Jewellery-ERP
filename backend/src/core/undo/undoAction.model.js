import mongoose from 'mongoose';
import { tenantPlugin } from '../tenancy/tenantPlugin.js';

const { ObjectId, Mixed } = mongoose.Schema.Types;

export const UNDO_STATUS = Object.freeze({
  ACTIVE: 'active', // can still be undone (when it is the newest in its stack)
  UNDONE: 'undone', // undone or reversed through Undo
  DISMISSED: 'dismissed', // could not be undone safely; someone chose to keep it and move on
  SUPERSEDED: 'superseded', // already reversed another way (cancelled on its own page, deleted, …)
});

/**
 * One action someone did that Undo can take back. Every action lives in a stack: the organisation's (records shared
 * by every branch) or one branch's. Only the newest active action of a stack can be undone; then the one before it.
 * The record is never deleted or rewritten — undoing it only adds who did it, when, why and what came of it.
 */
const resolutionSchema = new mongoose.Schema(
  {
    at: Date,
    by: { type: ObjectId, ref: 'User', default: null },
    reason: String,
    mode: String, // 'undo' (put back as it was) | 'reversal' (a reversing entry, e.g. a cancelled invoice)
    result: { type: Mixed, default: undefined }, // what the undo produced, e.g. { docNo: 'CN/HO/26-27/0001' }
    auditLogId: { type: ObjectId, ref: 'AuditLog', default: null },
  },
  { _id: false },
);

const undoActionSchema = new mongoose.Schema(
  {
    scope: { type: String, enum: ['organisation', 'branch'], required: true },
    branchId: { type: ObjectId, ref: 'Branch', default: null },
    type: { type: String, required: true }, // handler key, e.g. 'sale.create'
    module: { type: String, required: true },
    recordType: { type: String, default: null },
    recordId: { type: ObjectId, default: null },
    label: { type: String, default: null }, // what it is called on screen: an invoice no., a customer's name …
    data: { type: Mixed, default: undefined }, // what the handler needs to take it back (e.g. the record before an edit)
    auditLogId: { type: ObjectId, ref: 'AuditLog', default: null },
    createdBy: { type: ObjectId, ref: 'User', default: null },
    status: { type: String, enum: Object.values(UNDO_STATUS), default: UNDO_STATUS.ACTIVE },
    resolution: { type: resolutionSchema, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: true } },
);
undoActionSchema.plugin(tenantPlugin);
undoActionSchema.index({ organisationId: 1, scope: 1, branchId: 1, status: 1, createdAt: -1 });
undoActionSchema.index({ organisationId: 1, createdAt: -1 });
undoActionSchema.index({ organisationId: 1, recordId: 1 });

export const UndoAction = mongoose.model('UndoAction', undoActionSchema);
