import mongoose from 'mongoose';
import { tenantPlugin } from '../tenancy/tenantPlugin.js';

const metalStockSchema = new mongoose.Schema(
  {
    branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true },
    metal: { type: String, required: true },
    purity: { type: Number, required: true },
    kind: { type: String, required: true },
    grossMg: { type: Number, default: 0 },
    fineMg: { type: Number, default: 0 },
    valuePaise: { type: Number, default: 0 },
  },
  { timestamps: true },
);

metalStockSchema.plugin(tenantPlugin);
metalStockSchema.index({ organisationId: 1, branchId: 1, metal: 1, purity: 1, kind: 1 }, { unique: true });

export const MetalStock = mongoose.model('MetalStock', metalStockSchema);
