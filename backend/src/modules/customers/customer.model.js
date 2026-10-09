import mongoose from 'mongoose';
import { RECORD_STATUS } from '@jerp/shared';
import { addressSchema } from '../../core/schemas/address.schema.js';
import { tenantPlugin } from '../../core/tenancy/tenantPlugin.js';

const customerSchema = new mongoose.Schema(
  {
    code: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    mobile: { type: String, required: true },
    alternateMobile: { type: String, default: null },
    email: { type: String, default: null },
    address: { type: addressSchema, default: () => ({}) },
    dob: { type: Date, default: null },
    anniversary: { type: Date, default: null },
    gstin: { type: String, default: null },
    pan: { type: String, default: null },
    kyc: {
      type: { type: String, default: null },
      number: { type: String, default: null },
      verified: { type: Boolean, default: false },
      verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      verifiedAt: { type: Date, default: null },
    },
    segment: { type: String, default: 'new' },
    preferredMetals: { type: [String], default: [] },
    tags: { type: [String], default: [] },
    openingBalancePaise: { type: Number, default: 0 },
    notes: { type: String, default: null },
    status: { type: String, enum: Object.values(RECORD_STATUS), default: RECORD_STATUS.ACTIVE },
    isDeleted: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

customerSchema.plugin(tenantPlugin);
customerSchema.index({ organisationId: 1, code: 1 }, { unique: true });
customerSchema.index({ organisationId: 1, mobile: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });
customerSchema.index({ organisationId: 1, isDeleted: 1, name: 1 });
customerSchema.index({ organisationId: 1, segment: 1 });

export const Customer = mongoose.model('Customer', customerSchema);
