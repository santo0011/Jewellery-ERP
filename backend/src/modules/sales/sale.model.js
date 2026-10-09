import mongoose from 'mongoose';
import { SALE_STATUS } from '@jerp/shared';
import { tenantPlugin } from '../../core/tenancy/tenantPlugin.js';

const { ObjectId, Mixed } = mongoose.Schema.Types;

const saleItemSchema = new mongoose.Schema(
  {
    productId: { type: ObjectId, ref: 'Product', required: true },
    sku: String,
    name: String,
    hsnCode: String,
    huid: String,
    metal: String,
    purity: Number,
    stockType: String,
    quantity: Number,
    grossWeightMg: Number,
    stoneWeightMg: Number,
    netWeightMg: Number,
    fineWeightMg: Number,
    pricingInputs: { type: Mixed, required: true },
    rateId: { type: ObjectId, ref: 'MetalRate', default: null },
    breakdown: { type: Mixed, required: true },
    costPaise: { type: Number, default: 0 },
    returned: { type: Boolean, default: false },
  },
  { _id: false },
);

const paymentSchema = new mongoose.Schema(
  { mode: { type: String, required: true }, amountPaise: { type: Number, required: true }, reference: { type: String, default: null } },
  { _id: false },
);

const saleSchema = new mongoose.Schema(
  {
    invoiceNo: { type: String, required: true },
    branchId: { type: ObjectId, ref: 'Branch', required: true },
    businessDate: { type: String, required: true },
    customerId: { type: ObjectId, ref: 'Customer', default: null },
    customer: { type: Mixed, default: null },
    seller: { type: Mixed, required: true },
    placeOfSupply: { type: String, default: null },
    interState: { type: Boolean, default: false },
    items: { type: [saleItemSchema], validate: [(v) => v.length > 0, 'At least one item'] },
    totals: { type: Mixed, required: true },
    payments: { type: [paymentSchema], default: [] },
    taxSnapshot: { type: Mixed, required: true },
    status: { type: String, enum: Object.values(SALE_STATUS), default: SALE_STATUS.COMPLETED },
    notes: { type: String, default: null },
    // Set when this bill delivers a customer order; its advance was deducted from what was paid here.
    orderId: { type: ObjectId, ref: 'Order', default: null },
    orderNo: { type: String, default: null },
    advanceAdjustedPaise: { type: Number, default: 0 },
    idempotencyKey: { type: String, default: null },
    cancelledAt: { type: Date, default: null },
    cancelledBy: { type: ObjectId, ref: 'User', default: null },
    cancelReason: { type: String, default: null },
    createdBy: { type: ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

saleSchema.plugin(tenantPlugin);
saleSchema.index({ organisationId: 1, invoiceNo: 1 }, { unique: true });
saleSchema.index({ organisationId: 1, idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: 'string' } } });
saleSchema.index({ organisationId: 1, branchId: 1, businessDate: -1 });
saleSchema.index({ organisationId: 1, customerId: 1, createdAt: -1 });
saleSchema.index({ organisationId: 1, 'items.productId': 1 });

export const Sale = mongoose.model('Sale', saleSchema);

const salesReturnSchema = new mongoose.Schema(
  {
    creditNoteNo: { type: String, required: true },
    saleId: { type: ObjectId, ref: 'Sale', required: true },
    invoiceNo: { type: String, required: true },
    branchId: { type: ObjectId, ref: 'Branch', required: true },
    customerId: { type: ObjectId, ref: 'Customer', default: null },
    businessDate: { type: String, required: true },
    productIds: [{ type: ObjectId, ref: 'Product' }],
    taxablePaise: { type: Number, required: true },
    gstPaise: { type: Number, required: true },
    amountPaise: { type: Number, required: true },
    refundMode: { type: String, enum: ['cash', 'bank', 'credit'], required: true },
    reason: { type: String, required: true },
    createdBy: { type: ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

salesReturnSchema.plugin(tenantPlugin);
salesReturnSchema.index({ organisationId: 1, creditNoteNo: 1 }, { unique: true });
salesReturnSchema.index({ organisationId: 1, saleId: 1 });

export const SalesReturn = mongoose.model('SalesReturn', salesReturnSchema);
