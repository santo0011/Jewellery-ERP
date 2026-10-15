import mongoose from 'mongoose';

export const addressSchema = new mongoose.Schema(
  {
    line1: { type: String, default: null }, // house / shop number and building
    line2: { type: String, default: null }, // area / street
    landmark: { type: String, default: null },
    postOffice: { type: String, default: null },
    city: { type: String, default: null },
    district: { type: String, default: null },
    stateCode: { type: String, default: null },
    pincode: { type: String, default: null },
  },
  { _id: false },
);
