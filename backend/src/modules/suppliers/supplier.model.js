import mongoose from 'mongoose';
import { RECORD_STATUS } from '@jerp/shared';
import { addressSchema } from '../../core/schemas/address.schema.js';
import { tenantPlugin } from '../../core/tenancy/tenantPlugin.js';

const supplierSchema = new mongoose.Schema(
  {
    code: { type: String, required: true },
    companyName: { type: String, required: true, trim: true },
    contactPerson: { type: String, default: null },
    mobile: { type: String, required: true },
    alternateMobile: { type: String, default: null },
    email: { type: String, default: null },
    gstin: { type: String, default: null },
    pan: { type: String, default: null },
    address: { type: addressSchema, default: () => ({}) },
    bankDetails: {
      accountName: { type: String, default: null },
      accountNumber: { type: String, default: null },
      ifsc: { type: String, default: null },
      bankName: { type: String, default: null },
      branchName: { type: String, default: null },
      upiId: { type: String, default: null },
    },
    supplies: { type: [String], default: [] },
    paymentTermsDays: { type: Number, default: 0 },
    openingBalancePaise: { type: Number, default: 0 },
    openingFineGoldMg: { type: Number, default: 0 },
    openingFineSilverMg: { type: Number, default: 0 },
    notes: { type: String, default: null },
    status: { type: String, enum: Object.values(RECORD_STATUS), default: RECORD_STATUS.ACTIVE },
    isDeleted: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

supplierSchema.plugin(tenantPlugin);
supplierSchema.index({ organisationId: 1, code: 1 }, { unique: true });
supplierSchema.index({ organisationId: 1, gstin: 1 }, { unique: true, partialFilterExpression: { isDeleted: false, gstin: { $type: 'string' } } });
supplierSchema.index({ organisationId: 1, isDeleted: 1, companyName: 1 });

export const Supplier = mongoose.model('Supplier', supplierSchema);
