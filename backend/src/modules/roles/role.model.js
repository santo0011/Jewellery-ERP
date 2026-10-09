import mongoose from 'mongoose';
import { tenantPlugin } from '../../core/tenancy/tenantPlugin.js';

const roleSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    permissions: { type: [String], default: [] },
    isSystem: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

roleSchema.plugin(tenantPlugin);
roleSchema.index({ organisationId: 1, key: 1 }, { unique: true });
roleSchema.index({ organisationId: 1, name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

export const Role = mongoose.model('Role', roleSchema);
