import mongoose from 'mongoose';
import { tenantPlugin } from '../tenancy/tenantPlugin.js';

const fileAssetSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    purpose: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    originalName: { type: String, default: null },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

fileAssetSchema.plugin(tenantPlugin);
fileAssetSchema.index({ organisationId: 1, purpose: 1 });

export const FileAsset = mongoose.model('FileAsset', fileAssetSchema);
