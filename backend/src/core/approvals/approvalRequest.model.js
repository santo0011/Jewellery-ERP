import mongoose from 'mongoose';
import { APPROVAL_STATUS } from '@jerp/shared';
import { tenantPlugin } from '../tenancy/tenantPlugin.js';

const { ObjectId } = mongoose.Schema.Types;

const approvalRequestSchema = new mongoose.Schema(
  {
    docType: { type: String, required: true },
    docId: { type: ObjectId, required: true },
    docNo: { type: String, required: true },
    branchId: { type: ObjectId, ref: 'Branch', default: null },
    summary: { type: String, required: true },
    status: { type: String, enum: Object.values(APPROVAL_STATUS), default: APPROVAL_STATUS.PENDING },
    requestedBy: { type: ObjectId, ref: 'User', required: true },
    decidedBy: { type: ObjectId, ref: 'User', default: null },
    decidedAt: { type: Date, default: null },
    comment: { type: String, default: null },
  },
  { timestamps: true },
);

approvalRequestSchema.plugin(tenantPlugin);
approvalRequestSchema.index({ organisationId: 1, status: 1, createdAt: -1 });
approvalRequestSchema.index({ organisationId: 1, docType: 1, docId: 1 });

export const ApprovalRequest = mongoose.model('ApprovalRequest', approvalRequestSchema);
