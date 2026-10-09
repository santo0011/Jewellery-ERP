import mongoose from 'mongoose';
import { CURRENCIES, ORG_STATUS } from '@jerp/shared';
import { addressSchema } from '../../core/schemas/address.schema.js';

const organisationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    legalName: { type: String, default: null },
    gstin: { type: String, default: null },
    pan: { type: String, default: null },
    phone: { type: String, default: null },
    email: { type: String, default: null },
    address: { type: addressSchema, default: () => ({}) },
    currency: { type: String, enum: CURRENCIES, default: 'INR' },
    timezone: { type: String, default: 'Asia/Kolkata' },
    fyStartMonth: { type: Number, min: 1, max: 12, default: 4 },
    logoFileId: { type: mongoose.Schema.Types.ObjectId, default: null },
    status: { type: String, enum: Object.values(ORG_STATUS), default: ORG_STATUS.ACTIVE },
    branchLimit: { type: Number, min: 1, default: 2 },
    createdByPlatformAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'PlatformAdmin', default: null },
    ownerUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

export const Organisation = mongoose.model('Organisation', organisationSchema);
