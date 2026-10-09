import mongoose from 'mongoose';
import { USER_STATUS } from '@jerp/shared';
import { tenantPlugin } from '../../core/tenancy/tenantPlugin.js';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    mobile: { type: String, default: null },
    passwordHash: { type: String, required: true, select: false },
    roleIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Role' }],
    branchAccess: {
      all: { type: Boolean, default: false },
      branchIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Branch' }],
    },
    defaultBranchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
    isOwner: { type: Boolean, default: false },
    status: { type: String, enum: Object.values(USER_STATUS), default: USER_STATUS.ACTIVE },
    tokenVersion: { type: Number, default: 0 },
    passwordChangedAt: { type: Date, default: null },
    mustChangePassword: { type: Boolean, default: false },
    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    passwordReset: {
      type: new mongoose.Schema({ tokenHash: String, expiresAt: Date }, { _id: false }),
      default: null,
      select: false,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Set when this account is a branch's own login (managed from the Branches page).
    branchLoginFor: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null },
  },
  { timestamps: true },
);

userSchema.plugin(tenantPlugin);
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ organisationId: 1, roleIds: 1 });
userSchema.index({ organisationId: 1, branchLoginFor: 1 }, { unique: true, partialFilterExpression: { branchLoginFor: { $type: 'objectId' } } });

export const User = mongoose.model('User', userSchema);
