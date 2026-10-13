import mongoose from 'mongoose';

/** The platform's outgoing mail server (one record, managed by the Super Admin). Not tenant data. */
const emailSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'smtp', unique: true },
    enabled: { type: Boolean, default: false },
    host: { type: String, default: '' },
    port: { type: Number, default: 587 },
    security: { type: String, enum: ['starttls', 'ssl', 'none'], default: 'starttls' }, // 587 STARTTLS, 465 SSL/TLS
    username: { type: String, default: '' },
    passwordSealed: { type: String, default: null }, // AES-GCM (utils/secretBox) — never sent to the browser
    fromName: { type: String, default: '' },
    fromEmail: { type: String, default: '' },
    replyTo: { type: String, default: '' },
    lastTest: {
      at: { type: Date, default: null },
      ok: { type: Boolean, default: null },
      to: { type: String, default: null },
      error: { type: String, default: null },
    },
    updatedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'PlatformAdmin', default: null },
  },
  { timestamps: true },
);

export const EmailSettings = mongoose.model('EmailSettings', emailSettingsSchema);
