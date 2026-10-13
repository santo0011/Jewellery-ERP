import nodemailer from 'nodemailer';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { open } from '../../utils/secretBox.js';
import { EmailSettings } from './emailSettings.model.js';
import { templates } from './emailTemplates.js';

/**
 * Outgoing email. When the Super Admin has set up and switched on SMTP (Email settings), mail goes out through it;
 * otherwise the EMAIL_PROVIDER fallback ('console') writes it to the log, so development needs no mail server.
 */

const consoleProvider = {
  name: 'console',
  async send({ to, subject, text }) {
    logger.info({ to, subject }, `Email (console provider)\n${text}`);
    return { status: 'logged', provider: 'console' };
  },
};

const providers = new Map([[consoleProvider.name, consoleProvider]]);

export function registerEmailProvider(provider) {
  providers.set(provider.name, provider);
}

/** A nodemailer transport for the settings (also used by "send test email" with unsaved values). */
export function smtpTransport({ host, port, security, username, password }) {
  return nodemailer.createTransport({
    host,
    port,
    secure: security === 'ssl',
    requireTLS: security === 'starttls',
    ignoreTLS: security === 'none',
    auth: username ? { user: username, pass: password ?? '' } : undefined,
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });
}

const formatFrom = (s) => (s.fromName ? `"${s.fromName.replace(/"/g, "'")}" <${s.fromEmail}>` : s.fromEmail);

// The transport is rebuilt only when the saved settings change.
let cached = { stamp: null, transport: null };

/** The SMTP setup in use, or null when it is off or incomplete. */
async function activeSmtp() {
  const s = await EmailSettings.findOne({ key: 'smtp' }).lean();
  if (!s?.enabled || !s.host || !s.fromEmail) return null;
  const stamp = String(s.updatedAt?.getTime?.() ?? '');
  if (cached.stamp !== stamp) {
    cached = { stamp, transport: smtpTransport({ ...s, password: open(s.passwordSealed) }) };
  }
  return { settings: s, transport: cached.transport };
}

/** Renders a template and sends it. Returns { status: 'sent' | 'logged', provider }; throws when the SMTP server refuses. */
export async function sendEmail({ to, template, data }) {
  const render = templates[template];
  if (!render) throw new Error(`Unknown email template: ${template}`);
  const message = render(data);
  const smtp = await activeSmtp();
  if (!smtp) return providers.get(env.EMAIL_PROVIDER).send({ to, ...message });
  const info = await smtp.transport.sendMail({
    from: formatFrom(smtp.settings),
    to,
    ...(smtp.settings.replyTo && { replyTo: smtp.settings.replyTo }),
    subject: message.subject,
    text: message.text,
    html: message.html,
  });
  logger.info({ to, subject: message.subject, messageId: info.messageId }, 'Email sent');
  return { status: 'sent', provider: 'smtp' };
}

/** Like sendEmail, but never throws: a failed email must not undo the action that sent it. */
export async function trySendEmail(args) {
  try {
    return await sendEmail(args);
  } catch (err) {
    logger.error({ err, to: args.to, template: args.template }, 'Email could not be sent');
    return { status: 'failed', provider: 'smtp', error: err.message };
  }
}

export { formatFrom };
