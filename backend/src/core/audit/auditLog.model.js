import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organisation', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    action: { type: String, required: true },
    module: { type: String, required: true },
    recordType: { type: String, default: null },
    recordId: { type: mongoose.Schema.Types.ObjectId, default: null },
    changes: { type: [{ _id: false, field: String, from: mongoose.Schema.Types.Mixed, to: mongoose.Schema.Types.Mixed }], default: undefined },
    meta: { type: mongoose.Schema.Types.Mixed, default: undefined },
    ip: String,
    userAgent: String,
    requestId: String,
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

auditLogSchema.index({ organisationId: 1, createdAt: -1 });
auditLogSchema.index({ organisationId: 1, recordId: 1, createdAt: -1 });
auditLogSchema.index({ organisationId: 1, userId: 1, createdAt: -1 });

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
