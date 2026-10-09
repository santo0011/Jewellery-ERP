import mongoose from 'mongoose';
import { tenantPlugin } from '../tenancy/tenantPlugin.js';

const accountSchema = new mongoose.Schema(
  {
    code: { type: String, required: true },
    name: { type: String, required: true },
    group: { type: String, enum: ['asset', 'liability', 'equity', 'income', 'expense'], required: true },
    subGroup: { type: String, required: true },
    systemKey: { type: String, default: null },
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true },
);

accountSchema.plugin(tenantPlugin);
accountSchema.index({ organisationId: 1, code: 1 }, { unique: true });
accountSchema.index({ organisationId: 1, systemKey: 1 }, { unique: true, partialFilterExpression: { systemKey: { $type: 'string' } } });

export const Account = mongoose.model('Account', accountSchema);
