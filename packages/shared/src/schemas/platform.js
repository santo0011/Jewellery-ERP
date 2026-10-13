import { z } from 'zod';
import { ORG_STATUS } from '../enums.js';
import { emailSchema, listQuerySchema, mobileSchema, optional, passwordSchema, requiredText, stateCodeSchema } from './common.js';

// Free days count from the day the organisation was created.
const freeDaysSchema = z.coerce.number({ error: 'Enter the free days' }).int('Whole days only').min(0, 'Cannot be negative').max(365, 'At most 365 days');

export const platformCreateOrganisationSchema = z.object({
  organisationName: requiredText('Business name', { min: 2, max: 120 }),
  ownerName: requiredText('Owner name', { min: 2, max: 80 }),
  email: emailSchema,
  mobile: mobileSchema,
  stateCode: stateCodeSchema,
  // Optional: when left out (the panel always does), a 6-digit code is emailed and becomes the first password.
  password: passwordSchema.optional(),
  // Branches are not set here: 2 (head office included) during the free trial, then whatever the plan allows.
  // How long the organisation may use the software free; after that it needs a subscription. 0 = pay before using.
  freeDays: freeDaysSchema.default(14),
});

// `email` is the organisation's login email. A blank `password` keeps the current one.
export const platformUpdateOrganisationSchema = z.object({
  organisationName: requiredText('Business name', { min: 2, max: 120 }),
  email: emailSchema,
  password: optional(passwordSchema),
  mobile: mobileSchema,
  stateCode: stateCodeSchema,
  freeDays: freeDaysSchema.optional(), // only while it is still on its free period
});

export const platformOrgStatusSchema = z.object({ status: z.enum(Object.values(ORG_STATUS)) });

export const platformOrgListQuerySchema = listQuerySchema.extend({ status: z.enum(Object.values(ORG_STATUS)).optional() });

// ---------------------------------------------------------------- email (SMTP) settings

export const SMTP_SECURITY = ['starttls', 'ssl', 'none'];
const optionalEmail = z.union([z.literal(''), emailSchema]);

/** Outgoing mail server. A blank or missing `password` keeps the one already saved. */
export const emailSettingsSchema = z
  .object({
    enabled: z.boolean(),
    host: z.string().trim().max(200).default(''),
    port: z.coerce.number({ error: 'Enter the port' }).int('Whole number only').min(1, 'Enter the port').max(65535, 'Port is at most 65535'),
    security: z.enum(SMTP_SECURITY),
    username: z.string().trim().max(200).default(''),
    password: z.string().max(500).optional(),
    fromName: z.string().trim().max(100).default(''),
    fromEmail: optionalEmail.default(''),
    replyTo: optionalEmail.default(''),
  })
  .superRefine((v, ctx) => {
    if (!v.enabled) return;
    if (!v.host) ctx.addIssue({ code: 'custom', path: ['host'], message: 'Enter the SMTP server' });
    if (!v.fromEmail) ctx.addIssue({ code: 'custom', path: ['fromEmail'], message: 'Enter the address emails are sent from' });
  });

/** "Send test email": the form's values (saved or not) and where to send it. */
export const emailTestSchema = z
  .object({
    to: emailSchema,
    host: z.string().trim().min(1, 'Enter the SMTP server').max(200),
    port: z.coerce.number().int().min(1).max(65535),
    security: z.enum(SMTP_SECURITY),
    username: z.string().trim().max(200).default(''),
    password: z.string().max(500).optional(),
    fromName: z.string().trim().max(100).default(''),
    fromEmail: emailSchema,
    replyTo: optionalEmail.default(''),
  });
