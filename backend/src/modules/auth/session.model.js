import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    realm: { type: String, enum: ['tenant', 'platform'], default: 'tenant' },
    organisationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organisation', default: null },
    tokenHash: { type: String, required: true },
    rememberMe: { type: Boolean, default: false },
    userAgent: { type: String, default: null },
    ip: { type: String, default: null },
    lastUsedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokedReason: { type: String, default: null },
  },
  { timestamps: true },
);

sessionSchema.index({ userId: 1, revokedAt: 1 });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = mongoose.model('Session', sessionSchema);
