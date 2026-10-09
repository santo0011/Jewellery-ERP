import mongoose from 'mongoose';
import { tenantPlugin } from '../tenancy/tenantPlugin.js';

const { ObjectId } = mongoose.Schema.Types;

const stockMovementSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    direction: { type: Number, enum: [1, -1], required: true },
    productId: { type: ObjectId, ref: 'Product', default: null },
    metalStockId: { type: ObjectId, ref: 'MetalStock', default: null },
    branchId: { type: ObjectId, ref: 'Branch', required: true },
    metal: { type: String, required: true },
    purity: { type: Number, required: true },
    kind: { type: String, default: null },
    qty: { type: Number, default: 1 },
    grossMg: { type: Number, required: true },
    netMg: { type: Number, required: true },
    fineMg: { type: Number, required: true },
    valuePaise: { type: Number, default: 0 },
    statusBefore: { type: String, default: null },
    statusAfter: { type: String, default: null },
    source: { docType: { type: String, required: true }, docId: { type: ObjectId, required: true }, docNo: { type: String, required: true } },
    businessDate: { type: String, required: true },
    note: { type: String, default: null },
    createdBy: { type: ObjectId, ref: 'User', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

stockMovementSchema.plugin(tenantPlugin);
stockMovementSchema.index({ organisationId: 1, productId: 1, createdAt: -1 });
stockMovementSchema.index({ organisationId: 1, branchId: 1, businessDate: -1 });
stockMovementSchema.index({ organisationId: 1, 'source.docId': 1 });

stockMovementSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete', 'replaceOne'], function immutable() {
  throw new Error('Stock movements are immutable; post a reversing movement instead');
});

export const StockMovement = mongoose.model('StockMovement', stockMovementSchema);
