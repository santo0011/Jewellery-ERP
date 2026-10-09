import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

const consoleProvider = {
  name: 'console',
  async send({ to, subject, text }) {
    logger.info({ to, subject }, `Email (console provider)\n${text}`);
    return { status: 'sent', providerRef: null };
  },
};

const providers = new Map([[consoleProvider.name, consoleProvider]]);

export function registerEmailProvider(provider) {
  providers.set(provider.name, provider);
}

const templates = {
  passwordReset: ({ name, link, minutes }) => ({
    subject: 'Reset your password',
    text: `Hello ${name},\n\nUse the link below to reset your password. It expires in ${minutes} minutes.\n\n${link}\n\nIf you did not request this, you can ignore this email.`,
  }),
};

export async function sendEmail({ to, template, data }) {
  const render = templates[template];
  if (!render) throw new Error(`Unknown email template: ${template}`);
  const provider = providers.get(env.EMAIL_PROVIDER);
  return provider.send({ to, ...render(data) });
}
