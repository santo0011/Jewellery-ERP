import mongoose from 'mongoose';
import { tenantPlugin } from '../../core/tenancy/tenantPlugin.js';

const section = { type: mongoose.Schema.Types.Mixed, required: true };

const settingsSchema = new mongoose.Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organisation', required: true, immutable: true, unique: true },
    invoice: section,
    tax: section,
    jewellery: section,
    barcode: section,
    approvals: { type: mongoose.Schema.Types.Mixed, default: undefined },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, minimize: false },
);

settingsSchema.plugin(tenantPlugin);

export const Settings = mongoose.model('Settings', settingsSchema);
