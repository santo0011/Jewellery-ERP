import mongoose from 'mongoose';
import { PLAN_KEYS, PLAN_LIMITS, SUBSCRIPTION_STATUS } from '@jerp/shared';
import { tenantPlugin } from '../../core/tenancy/tenantPlugin.js';

const subscriptionSchema = new mongoose.Schema(
  {
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organisation', required: true, immutable: true, unique: true },
    plan: { type: String, enum: Object.values(PLAN_KEYS), required: true },
    status: { type: String, enum: Object.values(SUBSCRIPTION_STATUS), required: true },
    trialEndsAt: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },
  },
  { timestamps: true },
);

subscriptionSchema.plugin(tenantPlugin);

subscriptionSchema.virtual('limits').get(function limits() {
  return PLAN_LIMITS[this.plan];
});

export const Subscription = mongoose.model('Subscription', subscriptionSchema);
