import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

// Platform-level records: these belong to the Super Admin, not to one organisation, so no tenant plugin.

/** A plan the platform sells. Organisations keep a snapshot of its limits when they subscribe. */
const planSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: null },
    pricePaise: { type: Number, required: true },
    durationMonths: { type: Number, required: true },
    limits: { users: { type: Number, default: null }, branches: { type: Number, default: null }, products: { type: Number, default: null } },
    features: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
    isPopular: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);
export const Plan = mongoose.model('Plan', planSchema);

/**
 * One payment for a subscription period: online through Cashfree (created -> paid / failed / expired) or
 * recorded by the Super Admin (manual, always paid). A paid payment extends the organisation's period once.
 */
const paymentSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, unique: true }, // our id, also Cashfree's order_id
    organisationId: { type: ObjectId, ref: 'Organisation', required: true, index: true },
    organisationName: String,
    planId: { type: ObjectId, ref: 'Plan', required: true },
    planName: String,
    months: { type: Number, required: true },
    amountPaise: { type: Number, required: true },
    status: { type: String, enum: ['created', 'paid', 'failed', 'expired'], default: 'created', index: true },
    source: { type: String, enum: ['cashfree', 'manual'], required: true },
    // Cashfree
    cfOrderId: { type: String, default: null },
    paymentSessionId: { type: String, default: null },
    cfPaymentId: { type: String, default: null },
    paymentMethod: { type: String, default: null }, // upi / card / netbanking … (or the manual mode)
    reference: { type: String, default: null },
    failureReason: { type: String, default: null },
    // What the payment bought
    periodStart: { type: Date, default: null },
    periodEnd: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    note: { type: String, default: null },
    createdByUserId: { type: ObjectId, ref: 'User', default: null }, // organisation user who started checkout
    createdByAdminId: { type: ObjectId, ref: 'PlatformAdmin', default: null }, // Super Admin who recorded it
  },
  { timestamps: true },
);
paymentSchema.index({ status: 1, paidAt: -1 });
export const SubscriptionPayment = mongoose.model('SubscriptionPayment', paymentSchema);
