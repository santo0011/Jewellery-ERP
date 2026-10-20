import mongoose from 'mongoose';
import { tenantPlugin } from '../../core/tenancy/tenantPlugin.js';

const { ObjectId, Mixed } = mongoose.Schema.Types;

const lineSchema = new mongoose.Schema(
  {
    description: { type: String, required: true },
    metal: { type: String, required: true },
    purity: { type: Number, required: true },
    grossWeightMg: { type: Number, required: true },
    lessWeightMg: { type: Number, default: 0 },
    netWeightMg: { type: Number, required: true },
    fineWeightMg: { type: Number, required: true },
    ratePerGramPaise: { type: Number, required: true },
    deductionBps: { type: Number, default: 0 },
    grossValuePaise: { type: Number, required: true },
    deductionPaise: { type: Number, default: 0 },
    valuePaise: { type: Number, required: true },
  },
  { _id: false },
);

/**
 * Old gold (or silver) taken from a customer. `exchange`: handed over against a bill, its value taken off what the
 * customer paid (`saleId`). `purchase`: bought for money, paid out to the customer. Either way the metal goes into the
 * branch's old-gold pool (Raw materials) at its value, ready to melt or make into jewellery.
 */
const oldGoldSchema = new mongoose.Schema(
  {
    docNo: { type: String, required: true },
    type: { type: String, enum: ['purchase', 'exchange'], required: true },
    status: { type: String, enum: ['completed', 'cancelled'], default: 'completed' },
    branchId: { type: ObjectId, ref: 'Branch', required: true },
    businessDate: { type: String, required: true },
    customerId: { type: ObjectId, ref: 'Customer', default: null },
    customer: { type: Mixed, default: null },
    lines: { type: [lineSchema], validate: [(v) => v.length > 0, 'At least one piece'] },
    totalPaise: { type: Number, required: true },
    saleId: { type: ObjectId, ref: 'Sale', default: null },
    invoiceNo: { type: String, default: null },
    payout: { mode: { type: String, default: null }, reference: { type: String, default: null } },
    note: { type: String, default: null },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: ObjectId, ref: 'User', default: null },
    cancelReason: { type: String, default: null },
    createdBy: { type: ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

oldGoldSchema.plugin(tenantPlugin);
oldGoldSchema.index({ organisationId: 1, docNo: 1 }, { unique: true });
oldGoldSchema.index({ organisationId: 1, branchId: 1, businessDate: -1 });
oldGoldSchema.index({ organisationId: 1, customerId: 1, createdAt: -1 });
oldGoldSchema.index({ organisationId: 1, saleId: 1 }, { partialFilterExpression: { saleId: { $type: 'objectId' } } });

export const OldGold = mongoose.model('OldGold', oldGoldSchema);
