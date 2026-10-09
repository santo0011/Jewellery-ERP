import mongoose from 'mongoose';
import { PLATFORM_ROLES } from '@jerp/shared';

const platformAdminSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true, unique: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: Object.values(PLATFORM_ROLES), default: PLATFORM_ROLES.SUPER_ADMIN },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    tokenVersion: { type: Number, default: 0 },
    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

export const PlatformAdmin = mongoose.model('PlatformAdmin', platformAdminSchema);

const platformAuditSchema = new mongoose.Schema(
  {
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'PlatformAdmin', default: null },
    action: { type: String, required: true },
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organisation', default: null },
    changes: { type: mongoose.Schema.Types.Mixed, default: undefined },
    ip: String,
    userAgent: String,
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

platformAuditSchema.index({ createdAt: -1 });
platformAuditSchema.index({ organisationId: 1, createdAt: -1 });

export const PlatformAudit = mongoose.model('PlatformAudit', platformAuditSchema);
