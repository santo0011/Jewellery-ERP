import mongoose from 'mongoose';
import { tenantPlugin } from '../../core/tenancy/tenantPlugin.js';

const { ObjectId } = mongoose.Schema.Types;

/** Where a payment went: the supplier's old balance (purchaseId null) or a purchase bill still unpaid. */
const allocationSchema = new mongoose.Schema(
  { purchaseId: { type: ObjectId, ref: 'Purchase', default: null }, purchaseNo: { type: String, default: null }, billNo: { type: String, default: null }, amountPaise: { type: Number, required: true } },
  { _id: false },
);

/**
 * Money paid to a supplier on their account (the Payment button), not against one bill: it clears the old balance
 * first, then the oldest bills. Each bill it reaches also lists it among its own payments (with this paymentNo).
 */
const supplierPaymentSchema = new mongoose.Schema(
  {
    paymentNo: { type: String, required: true },
    supplierId: { type: ObjectId, ref: 'Supplier', required: true },
    supplier: { type: mongoose.Schema.Types.Mixed, required: true },
    branchId: { type: ObjectId, ref: 'Branch', required: true },
    date: { type: String, required: true },
    mode: { type: String, required: true },
    amountPaise: { type: Number, required: true },
    reference: { type: String, default: null },
    note: { type: String, default: null },
    allocations: { type: [allocationSchema], default: [] },
    createdBy: { type: ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

supplierPaymentSchema.plugin(tenantPlugin);
supplierPaymentSchema.index({ organisationId: 1, paymentNo: 1 }, { unique: true });
supplierPaymentSchema.index({ organisationId: 1, supplierId: 1, createdAt: -1 });

export const SupplierPayment = mongoose.model('SupplierPayment', supplierPaymentSchema);
