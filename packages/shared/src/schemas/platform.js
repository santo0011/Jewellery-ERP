import { z } from 'zod';
import { ORG_STATUS } from '../enums.js';
import { emailSchema, listQuerySchema, mobileSchema, optional, passwordSchema, requiredText, stateCodeSchema } from './common.js';

export const branchLimitSchema = z.object({
  branchLimit: z.number({ error: 'Branch limit is required' }).int('Whole number only').min(1, 'At least 1 branch').max(500, 'At most 500 branches'),
});

// Free days count from the day the organisation was created.
const freeDaysSchema = z.coerce.number({ error: 'Enter the free days' }).int('Whole days only').min(0, 'Cannot be negative').max(365, 'At most 365 days');

export const platformCreateOrganisationSchema = z.object({
  organisationName: requiredText('Business name', { min: 2, max: 120 }),
  ownerName: requiredText('Owner name', { min: 2, max: 80 }),
  email: emailSchema,
  mobile: mobileSchema,
  stateCode: stateCodeSchema,
  password: passwordSchema,
  branchLimit: branchLimitSchema.shape.branchLimit,
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
  branchLimit: branchLimitSchema.shape.branchLimit,
  freeDays: freeDaysSchema.optional(), // only while it is still on its free period
});

export const platformOrgStatusSchema = z.object({ status: z.enum(Object.values(ORG_STATUS)) });

export const platformOrgListQuerySchema = listQuerySchema.extend({ status: z.enum(Object.values(ORG_STATUS)).optional() });
