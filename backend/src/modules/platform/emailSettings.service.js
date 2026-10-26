import { env } from '../../config/env.js';
import { EmailSettings } from '../../core/notifications/emailSettings.model.js';
import { formatFrom, smtpTransport } from '../../core/notifications/email.service.js';
import { templates } from '../../core/notifications/emailTemplates.js';
import { ApiError } from '../../utils/ApiError.js';
import { open, seal } from '../../utils/secretBox.js';
import { recordPlatformAudit } from './platformAuth.service.js';

const FIELDS = ['enabled', 'host', 'port', 'security', 'username', 'fromName', 'fromEmail', 'replyTo'];

/** The settings as the panel sees them: never the password itself, only whether one is saved. */
function serialize(s) {
  const active = Boolean(s?.enabled && s.host && s.fromEmail);
  return {
    enabled: Boolean(s?.enabled),
    host: s?.host ?? '',
    port: s?.port ?? 587,
    security: s?.security ?? 'starttls',
    username: s?.username ?? '',
    hasPassword: Boolean(s?.passwordSealed),
    fromName: s?.fromName ?? env.APP_NAME,
    fromEmail: s?.fromEmail ?? '',
    replyTo: s?.replyTo ?? '',
    lastTest: s?.lastTest?.at ? s.lastTest : null,
    // What happens to email right now: real delivery, or written to the server log.
    delivery: active ? 'smtp' : 'log',
    updatedAt: s?.updatedAt ?? null,
  };
}

export async function getEmailSettings() {
  return serialize(await EmailSettings.findOne({ key: 'smtp' }).lean());
}

export async function saveEmailSettings(input, admin, meta) {
  const current = await EmailSettings.findOne({ key: 'smtp' }).lean();
  const next = Object.fromEntries(FIELDS.map((f) => [f, input[f]]));
  if (input.password) next.passwordSealed = seal(input.password);
  if (input.enabled && !input.password && !current?.passwordSealed && input.username) {
    throw ApiError.badRequest('Enter the SMTP password', [{ path: 'password', message: 'Enter the password for this username' }], 'VALIDATION_ERROR');
  }
  const changed = FIELDS.filter((f) => String(current?.[f] ?? '') !== String(next[f] ?? '')).concat(input.password ? ['password'] : []);
  const snapshot = (s) => (s ? Object.fromEntries([...FIELDS, 'passwordSealed'].map((f) => [f, s[f] ?? null])) : null);
  const saved = await EmailSettings.findOneAndUpdate({ key: 'smtp' }, { $set: { ...next, updatedByAdminId: admin.adminId } }, { upsert: true, returnDocument: 'after' }).lean();
  if (changed.length) {
    await recordPlatformAudit(
      { adminId: admin.adminId, action: 'email_settings_update', changes: { fields: changed, enabled: saved.enabled, host: saved.host }, undo: { type: 'platform.emailSettings', recordType: 'EmailSettings', label: 'Email (SMTP) settings', data: { before: snapshot(current), after: snapshot(saved) } } },
      meta,
    );
  }
  return serialize(saved);
}

/** Connects with the given values (saved or not) and sends a branded test email; the result is kept on the settings. */
export async function sendTestEmail(input, admin) {
  const current = await EmailSettings.findOne({ key: 'smtp' }).lean();
  const password = input.password || open(current?.passwordSealed);
  const transport = smtpTransport({ ...input, password });
  const message = templates.smtpTest({ host: `${input.host}:${input.port}`, fromEmail: input.fromEmail, sentBy: admin.name });
  const record = (ok, error = null) => EmailSettings.updateOne({ key: 'smtp' }, { $set: { lastTest: { at: new Date(), ok, to: input.to, error } } }, { upsert: true });
  try {
    await transport.verify();
    await transport.sendMail({ from: formatFrom(input), to: input.to, ...(input.replyTo && { replyTo: input.replyTo }), subject: message.subject, text: message.text, html: message.html });
  } catch (err) {
    await record(false, err.message?.slice(0, 300) ?? 'Failed');
    throw ApiError.badRequest(`The mail server said: ${err.message ?? 'connection failed'}`, undefined, 'SMTP_FAILED');
  } finally {
    transport.close();
  }
  await record(true);
  return { sent: true, to: input.to };
}

/** Sample data per template, for the settings page's preview (nothing is sent). */
const SAMPLES = {
  organisationWelcome: { name: 'Rina Paul', organisationName: 'Sonar Bangla Jewellers', email: 'owner@sonarbangla.in', otp: '482915' },
  loginOtp: { name: 'Rina Paul', organisationName: 'Sonar Bangla Jewellers', email: 'owner@sonarbangla.in', otp: '730264' },
  passwordReset: { name: 'Rina Paul', otp: '519306', minutes: env.PASSWORD_RESET_MINUTES },
  smtpTest: { host: 'smtp.example.com:587', fromEmail: 'noreply@example.com', sentBy: 'Super Admin' },
};
export const PREVIEW_TEMPLATES = Object.keys(SAMPLES);

export function previewEmail(template) {
  const data = { ...SAMPLES[template], loginUrl: `${env.APP_URL}/login`, link: `${env.APP_URL}/reset-password?token=preview` };
  const { subject, html } = templates[template](data);
  return { template, subject, html };
}
