import mongoose from 'mongoose';
import { tenantPlugin } from '../../core/tenancy/tenantPlugin.js';

const { ObjectId } = mongoose.Schema.Types;

const metalUsedSchema = new mongoose.Schema(
  { metal: String, purity: Number, kind: String, grossWeightMg: Number, fineWeightMg: Number, valuePaise: Number },
  { _id: false },
);
const pieceSchema = new mongoose.Schema(
  { productId: { type: ObjectId, ref: 'Product' }, sku: String, name: String, metal: String, purity: Number, grossWeightMg: Number, fineWeightMg: Number, costPaise: Number },
  { _id: false },
);

/**
 * Jewellery made in-house from the raw metal stock: the metal used left the metal stock at its average cost, the pieces
 * made came into Products (ready to sell) carrying that cost plus the making charge, shared by weight.
 */
const productionSchema = new mongoose.Schema(
  {
    productionNo: { type: String, required: true },
    branchId: { type: ObjectId, ref: 'Branch', required: true },
    businessDate: { type: String, required: true },
    metalUsed: { type: [metalUsedSchema], default: [] },
    pieces: { type: [pieceSchema], default: [] },
    metalValuePaise: { type: Number, default: 0 },
    makingPaise: { type: Number, default: 0 },
    makingMode: { type: String, default: null },
    totalCostPaise: { type: Number, default: 0 },
    note: { type: String, default: null },
    createdBy: { type: ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);
productionSchema.plugin(tenantPlugin);
productionSchema.index({ organisationId: 1, productionNo: 1 }, { unique: true });
productionSchema.index({ organisationId: 1, branchId: 1, createdAt: -1 });

export const Production = mongoose.model('Production', productionSchema);
