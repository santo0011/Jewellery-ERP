import mongoose from 'mongoose';
import { tenantPlugin } from '../../core/tenancy/tenantPlugin.js';

const metalRateSchema = new mongoose.Schema(
  {
    metal: { type: String, required: true },
    purity: { type: Number, required: true },
    ratePerGramPaise: { type: Number, required: true },
    effectiveAt: { type: Date, required: true },
    businessDate: { type: String, required: true },
    source: { type: String, default: 'manual' },
    note: { type: String, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Withdrawn by Undo (entered by mistake): kept in the history, never used for prices again.
    withdrawnAt: { type: Date, default: null },
    withdrawnBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    withdrawReason: { type: String, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, versionKey: false },
);

metalRateSchema.plugin(tenantPlugin);
metalRateSchema.index({ organisationId: 1, metal: 1, purity: 1, effectiveAt: -1 });
metalRateSchema.index({ organisationId: 1, businessDate: -1 });

export const MetalRate = mongoose.model('MetalRate', metalRateSchema);

/** Rates in use: withdrawn ones are left out of prices. */
export const LIVE_RATE = Object.freeze({ withdrawnAt: null });
