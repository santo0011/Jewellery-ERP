import mongoose from 'mongoose';
import { SUBSCRIPTION_STATUS } from '@jerp/shared';
import { tenantPlugin } from '../../core/tenancy/tenantPlugin.js';

const subscriptionSchema = new mongoose.Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organisation', required: true, immutable: true, unique: true },
    // Plan code ('trial', 'basic' … or a plan the Super Admin created). Older records only have this.
    plan: { type: String, required: true },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', default: null },
    planName: { type: String, default: null },
    // Limits copied from the plan when it was taken; null = unlimited.
    limits: { users: { type: Number, default: undefined }, branches: { type: Number, default: undefined }, products: { type: Number, default: undefined } },
    status: { type: String, enum: Object.values(SUBSCRIPTION_STATUS), required: true },
    trialEndsAt: { type: Date, default: null },
    currentPeriodStart: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },
    lastPaymentAt: { type: Date, default: null },
  },
  { timestamps: true },
);

subscriptionSchema.plugin(tenantPlugin);

export const Subscription = mongoose.model('Subscription', subscriptionSchema);
