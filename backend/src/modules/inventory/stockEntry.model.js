import mongoose from 'mongoose';
import { STOCK_DOC_STATUS } from '@jerp/shared';
import { tenantPlugin } from '../../core/tenancy/tenantPlugin.js';

const { ObjectId } = mongoose.Schema.Types;

const metalLineSchema = new mongoose.Schema(
  {
    metal: { type: String, required: true },
    purity: { type: Number, required: true },
    kind: { type: String, required: true },
    direction: { type: String, enum: ['in', 'out'], required: true },
    grossWeightMg: { type: Number, required: true },
    fineWeightMg: { type: Number, required: true },
    valuePaise: { type: Number, default: 0 },
  },
  { _id: false },
);

const stockEntrySchema = new mongoose.Schema(
  {
    docNo: { type: String, required: true },
    type: { type: String, enum: ['opening', 'adjustment'], required: true },
    branchId: { type: ObjectId, ref: 'Branch', required: true },
    reason: { type: String, default: null },
    productIds: [{ type: ObjectId, ref: 'Product' }],
    metalLines: { type: [metalLineSchema], default: [] },
    totals: {
      pieces: { type: Number, default: 0 },
      grossMg: { type: Number, default: 0 },
      fineMg: { type: Number, default: 0 },
      valuePaise: { type: Number, default: 0 },
    },
    status: { type: String, enum: Object.values(STOCK_DOC_STATUS), required: true },
    businessDate: { type: String, required: true },
    note: { type: String, default: null },
    createdBy: { type: ObjectId, ref: 'User', required: true },
    postedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null },
  },
  { timestamps: true },
);

stockEntrySchema.plugin(tenantPlugin);
stockEntrySchema.index({ organisationId: 1, docNo: 1 }, { unique: true });
stockEntrySchema.index({ organisationId: 1, type: 1, status: 1, createdAt: -1 });
stockEntrySchema.index({ organisationId: 1, productIds: 1, status: 1 });

export const StockEntry = mongoose.model('StockEntry', stockEntrySchema);
