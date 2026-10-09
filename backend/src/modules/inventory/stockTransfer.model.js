import mongoose from 'mongoose';
import { TRANSFER_STATUS } from '@jerp/shared';
import { tenantPlugin } from '../../core/tenancy/tenantPlugin.js';

const { ObjectId } = mongoose.Schema.Types;

const stockTransferSchema = new mongoose.Schema(
  {
    docNo: { type: String, required: true },
    fromBranchId: { type: ObjectId, ref: 'Branch', required: true },
    toBranchId: { type: ObjectId, ref: 'Branch', required: true },
    productIds: [{ type: ObjectId, ref: 'Product' }],
    totals: {
      pieces: { type: Number, default: 0 },
      grossMg: { type: Number, default: 0 },
      fineMg: { type: Number, default: 0 },
      valuePaise: { type: Number, default: 0 },
    },
    status: { type: String, enum: Object.values(TRANSFER_STATUS), required: true },
    businessDate: { type: String, required: true },
    note: { type: String, default: null },
    dispatchedBy: { type: ObjectId, ref: 'User', required: true },
    dispatchedAt: { type: Date, required: true },
    closedBy: { type: ObjectId, ref: 'User', default: null },
    closedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: null },
  },
  { timestamps: true },
);

stockTransferSchema.plugin(tenantPlugin);
stockTransferSchema.index({ organisationId: 1, docNo: 1 }, { unique: true });
stockTransferSchema.index({ organisationId: 1, status: 1, createdAt: -1 });

export const StockTransfer = mongoose.model('StockTransfer', stockTransferSchema);
