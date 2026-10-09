import mongoose from 'mongoose';
import { BRANCH_STATUS } from '@jerp/shared';
import { addressSchema } from '../../core/schemas/address.schema.js';
import { tenantPlugin } from '../../core/tenancy/tenantPlugin.js';

const branchSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, default: null },
    email: { type: String, default: null },
    gstin: { type: String, default: null },
    address: { type: addressSchema, default: () => ({}) },
    isHeadOffice: { type: Boolean, default: false },
    allowedPermissions: { type: [String], default: undefined },
    status: { type: String, enum: Object.values(BRANCH_STATUS), default: BRANCH_STATUS.ACTIVE },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

branchSchema.plugin(tenantPlugin);
branchSchema.index({ organisationId: 1, code: 1 }, { unique: true });
branchSchema.index({ organisationId: 1, status: 1, name: 1 });

export const Branch = mongoose.model('Branch', branchSchema);
