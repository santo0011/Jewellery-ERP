import mongoose from 'mongoose';

export const addressSchema = new mongoose.Schema(
  {
    line1: { type: String, default: null },
    line2: { type: String, default: null },
    city: { type: String, default: null },
    stateCode: { type: String, default: null },
    pincode: { type: String, default: null },
  },
  { _id: false },
);
