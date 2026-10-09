import mongoose from 'mongoose';
import { tenantPlugin } from '../../core/tenancy/tenantPlugin.js';

const { ObjectId } = mongoose.Schema.Types;

const supplierSnapshot = { id: ObjectId, code: String, name: String, gstin: String, mobile: String };

const purchaseItemSchema = new mongoose.Schema(
  { productId: { type: ObjectId, ref: 'Product', required: true }, sku: String, name: String, metal: String, purity: Number, grossWeightMg: Number, fineWeightMg: Number, costPaise: { type: Number, required: true } },
  { _id: false },
);

const purchaseMetalSchema = new mongoose.Schema(
  { metal: String, purity: Number, kind: String, grossWeightMg: Number, fineWeightMg: Number, valuePaise: Number },
  { _id: false },
);

const supplierPaymentSchema = new mongoose.Schema(
  { date: String, at: Date, mode: String, amountPaise: Number, reference: { type: String, default: null }, by: { type: ObjectId, ref: 'User' } },
  { _id: false },
);

/** A supplier's bill: what came into stock, what it cost, and what has been paid against it. */
const purchaseSchema = new mongoose.Schema(
  {
    purchaseNo: { type: String, required: true },
    branchId: { type: ObjectId, ref: 'Branch', required: true },
    supplierId: { type: ObjectId, ref: 'Supplier', required: true },
    supplier: supplierSnapshot,
    billNo: { type: String, required: true },
    billDate: { type: String, required: true },
    orderId: { type: ObjectId, ref: 'PurchaseOrder', default: null },
    orderNo: { type: String, default: null },
    items: { type: [purchaseItemSchema], default: [] },
    metalLines: { type: [purchaseMetalSchema], default: [] },
    totals: {
      pieces: Number,
      grossMg: Number,
      fineMg: Number,
      goodsPaise: Number,
      otherChargesPaise: Number,
      gstPaise: Number,
      totalPaise: Number,
    },
    payments: { type: [supplierPaymentSchema], default: [] },
    paidPaise: { type: Number, default: 0 },
    paymentStatus: { type: String, enum: ['due', 'partly_paid', 'paid'], default: 'due' },
    businessDate: { type: String, required: true }, // day it was entered
    note: { type: String, default: null },
    createdBy: { type: ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);
purchaseSchema.plugin(tenantPlugin);
purchaseSchema.index({ organisationId: 1, purchaseNo: 1 }, { unique: true });
purchaseSchema.index({ organisationId: 1, supplierId: 1, billNo: 1 }, { unique: true });
purchaseSchema.index({ organisationId: 1, branchId: 1, billDate: -1 });
purchaseSchema.index({ organisationId: 1, paymentStatus: 1 });

export const Purchase = mongoose.model('Purchase', purchaseSchema);

const orderLineSchema = new mongoose.Schema(
  { description: String, metal: String, purity: Number, quantity: Number, weightMg: Number, amountPaise: Number },
  { _id: false },
);

/** An order placed with a supplier — open until the goods arrive on a purchase bill, or it is cancelled. */
const purchaseOrderSchema = new mongoose.Schema(
  {
    orderNo: { type: String, required: true },
    branchId: { type: ObjectId, ref: 'Branch', required: true },
    supplierId: { type: ObjectId, ref: 'Supplier', required: true },
    supplier: supplierSnapshot,
    orderDate: { type: String, required: true },
    expectedDate: { type: String, default: null },
    lines: { type: [orderLineSchema], default: [] },
    totals: { quantity: Number, weightMg: Number, amountPaise: Number },
    status: { type: String, enum: ['open', 'received', 'cancelled'], default: 'open' },
    purchaseId: { type: ObjectId, ref: 'Purchase', default: null },
    purchaseNo: { type: String, default: null },
    timeline: { type: [new mongoose.Schema({ status: String, at: Date, by: { type: ObjectId, ref: 'User' }, note: String }, { _id: false })], default: [] },
    note: { type: String, default: null },
    createdBy: { type: ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);
purchaseOrderSchema.plugin(tenantPlugin);
purchaseOrderSchema.index({ organisationId: 1, orderNo: 1 }, { unique: true });
purchaseOrderSchema.index({ organisationId: 1, status: 1, expectedDate: 1 });

export const PurchaseOrder = mongoose.model('PurchaseOrder', purchaseOrderSchema);
