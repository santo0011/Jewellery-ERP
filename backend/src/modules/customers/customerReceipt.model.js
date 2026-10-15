import mongoose from 'mongoose';
import { tenantPlugin } from '../../core/tenancy/tenantPlugin.js';

const { ObjectId } = mongoose.Schema.Types;

/** Where a due payment went: the customer's old due (saleId null) or a bill left partly unpaid. */
const allocationSchema = new mongoose.Schema(
  { saleId: { type: ObjectId, ref: 'Sale', default: null }, invoiceNo: { type: String, default: null }, amountPaise: { type: Number, required: true } },
  { _id: false },
);

/**
 * Money a customer paid on their account: 'due' — later, against what they owe (bills on credit and old due);
 * 'advance' — an advance paid when the customer was added or edited (part of their minus opening balance).
 */
const customerReceiptSchema = new mongoose.Schema(
  {
    receiptNo: { type: String, required: true },
    kind: { type: String, enum: ['due', 'advance'], default: 'due' },
    customerId: { type: ObjectId, ref: 'Customer', required: true },
    customer: { type: mongoose.Schema.Types.Mixed, required: true },
    branchId: { type: ObjectId, ref: 'Branch', required: true },
    businessDate: { type: String, required: true },
    mode: { type: String, required: true },
    amountPaise: { type: Number, required: true },
    reference: { type: String, default: null },
    note: { type: String, default: null },
    allocations: { type: [allocationSchema], default: [] },
    createdBy: { type: ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

customerReceiptSchema.plugin(tenantPlugin);
customerReceiptSchema.index({ organisationId: 1, receiptNo: 1 }, { unique: true });
customerReceiptSchema.index({ organisationId: 1, customerId: 1, createdAt: -1 });
customerReceiptSchema.index({ organisationId: 1, branchId: 1, businessDate: -1 });

export const CustomerReceipt = mongoose.model('CustomerReceipt', customerReceiptSchema);
