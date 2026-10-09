import mongoose from 'mongoose';
import { ORDER_STATUS } from '@jerp/shared';
import { tenantPlugin } from '../../core/tenancy/tenantPlugin.js';

const { ObjectId, Mixed } = mongoose.Schema.Types;

const orderItemSchema = new mongoose.Schema(
  {
    description: { type: String, required: true },
    categoryId: { type: ObjectId, ref: 'Category', default: null },
    jewelleryType: { type: String, default: null },
    metal: { type: String, required: true },
    purity: { type: Number, default: null },
    approxWeightMg: { type: Number, default: null },
    size: { type: String, default: null },
    quantity: { type: Number, default: 1 },
    stones: { type: [Mixed], default: [] },
    wastage: { type: Mixed, default: null },
    making: { type: Mixed, default: null },
    otherChargePaise: { type: Number, default: 0 },
    pricingMode: { type: String, default: 'rate_based' },
    fixedPricePaise: { type: Number, default: null },
    estimatedPaise: { type: Number, default: 0 },
    huid: { type: String, default: null },
    notes: { type: String, default: null },
    // The finished, tagged piece made for this line (set by "Finish item"); it is what goes on the bill.
    productId: { type: ObjectId, ref: 'Product', default: null },
  },
  { _id: false },
);

/** Money received against the order. A negative amount is a refund on cancellation. */
const advanceSchema = new mongoose.Schema(
  {
    receiptNo: { type: String, required: true },
    mode: { type: String, required: true },
    amountPaise: { type: Number, required: true },
    reference: { type: String, default: null },
    at: { type: Date, required: true },
    by: { type: ObjectId, ref: 'User', required: true },
  },
  { _id: true },
);

const timelineSchema = new mongoose.Schema(
  { status: { type: String, required: true }, at: { type: Date, required: true }, by: { type: ObjectId, ref: 'User', default: null }, note: { type: String, default: null } },
  { _id: false },
);

const orderSchema = new mongoose.Schema(
  {
    orderNo: { type: String, required: true },
    branchId: { type: ObjectId, ref: 'Branch', required: true },
    customerId: { type: ObjectId, ref: 'Customer', required: true },
    customer: { type: Mixed, required: true },
    businessDate: { type: String, required: true },
    items: { type: [orderItemSchema], validate: [(v) => v.length > 0, 'At least one item'] },
    estimatedPaise: { type: Number, default: 0 },
    advances: { type: [advanceSchema], default: [] },
    advancePaise: { type: Number, default: 0 },
    expectedDate: { type: String, default: null },
    priority: { type: String, enum: ['normal', 'urgent'], default: 'normal' },
    // Reference photos of the design the customer wants.
    images: { type: [{ _id: false, fileId: { type: ObjectId, ref: 'FileAsset' } }], default: [] },
    status: { type: String, enum: Object.values(ORDER_STATUS), default: ORDER_STATUS.BOOKED },
    timeline: { type: [timelineSchema], default: [] },
    notes: { type: String, default: null },
    saleId: { type: ObjectId, ref: 'Sale', default: null },
    invoiceNo: { type: String, default: null },
    deliveredAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, default: null },
    createdBy: { type: ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

orderSchema.plugin(tenantPlugin);
orderSchema.index({ organisationId: 1, orderNo: 1 }, { unique: true });
orderSchema.index({ organisationId: 1, branchId: 1, status: 1, createdAt: -1 });
orderSchema.index({ organisationId: 1, customerId: 1, status: 1 });

export const Order = mongoose.model('Order', orderSchema);
