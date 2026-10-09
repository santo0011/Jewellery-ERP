import mongoose from 'mongoose';
import { PRODUCT_STATUS } from '@jerp/shared';
import { tenantPlugin } from '../../core/tenancy/tenantPlugin.js';

const { ObjectId } = mongoose.Schema.Types;

const stoneSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },
    name: { type: String, default: null },
    count: { type: Number, required: true },
    weight: { type: Number, required: true },
    weightUnit: { type: String, enum: ['ct', 'g'], required: true },
    ratePaise: { type: Number, default: 0 },
  },
  { _id: false },
);

const productSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true },
    barcode: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    categoryId: { type: ObjectId, ref: 'Category', required: true },
    subcategoryId: { type: ObjectId, ref: 'Category', default: null },
    jewelleryType: { type: String, required: true },
    metal: { type: String, required: true },
    purity: { type: Number, required: true },
    stockType: { type: String, enum: ['tagged', 'lot'], default: 'tagged' },
    quantity: { type: Number, default: 1 },
    grossWeightMg: { type: Number, required: true },
    stoneWeightMg: { type: Number, default: 0 },
    netWeightMg: { type: Number, required: true },
    fineWeightMg: { type: Number, required: true },
    stones: { type: [stoneSchema], default: [] },
    wastage: { mode: { type: String, required: true }, value: { type: Number, default: 0 } },
    making: { type: { type: String, required: true }, value: { type: Number, default: 0 } },
    otherChargePaise: { type: Number, default: 0 },
    hsnCode: { type: String, default: null },
    costPricePaise: { type: Number, default: null },
    pricingMode: { type: String, enum: ['rate_based', 'fixed'], default: 'rate_based' },
    fixedPricePaise: { type: Number, default: null },
    huid: { type: String, default: null },
    hallmarkCentre: { type: String, default: null },
    hallmarkDate: { type: Date, default: null },
    certificateNo: { type: String, default: null },
    supplierId: { type: ObjectId, ref: 'Supplier', default: null },
    branchId: { type: ObjectId, ref: 'Branch', required: true },
    description: { type: String, default: null },
    tags: { type: [String], default: [] },
    images: { type: [{ _id: false, fileId: { type: ObjectId, ref: 'FileAsset' } }], default: [] },
    status: { type: String, enum: Object.values(PRODUCT_STATUS), default: PRODUCT_STATUS.DRAFT },
    isDeleted: { type: Boolean, default: false },
    createdBy: { type: ObjectId, ref: 'User', default: null },
    updatedBy: { type: ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

productSchema.plugin(tenantPlugin);
productSchema.index({ organisationId: 1, sku: 1 }, { unique: true });
productSchema.index({ organisationId: 1, barcode: 1 }, { unique: true });
productSchema.index({ organisationId: 1, huid: 1 }, { unique: true, partialFilterExpression: { isDeleted: false, huid: { $type: 'string' } } });
productSchema.index({ organisationId: 1, isDeleted: 1, branchId: 1, status: 1 });
productSchema.index({ organisationId: 1, categoryId: 1 });
productSchema.index({ organisationId: 1, metal: 1, purity: 1 });

export const Product = mongoose.model('Product', productSchema);
