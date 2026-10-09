import { z } from 'zod';
import { ORG_STATUS, PLAN_KEYS } from '../enums.js';
import { emailSchema, listQuerySchema, mobileSchema, optional, passwordSchema, requiredText, stateCodeSchema } from './common.js';

export const branchLimitSchema = z.object({
  branchLimit: z.number({ error: 'Branch limit is required' }).int('Whole number only').min(1, 'At least 1 branch').max(500, 'At most 500 branches'),
});

export const platformCreateOrganisationSchema = z.object({
  organisationName: requiredText('Business name', { min: 2, max: 120 }),
  ownerName: requiredText('Owner name', { min: 2, max: 80 }),
  email: emailSchema,
  mobile: mobileSchema,
  stateCode: stateCodeSchema,
  password: passwordSchema,
  branchLimit: branchLimitSchema.shape.branchLimit,
});

// `email` is the organisation's login email. A blank `password` keeps the current one.
export const platformUpdateOrganisationSchema = z.object({
  organisationName: requiredText('Business name', { min: 2, max: 120 }),
  email: emailSchema,
  password: optional(passwordSchema),
  plan: z.enum(Object.values(PLAN_KEYS), { error: 'Select a plan' }).optional(),
  mobile: mobileSchema,
  stateCode: stateCodeSchema,
  branchLimit: branchLimitSchema.shape.branchLimit,
});

export const platformOrgStatusSchema = z.object({ status: z.enum(Object.values(ORG_STATUS)) });

export const platformOrgListQuerySchema = listQuerySchema.extend({ status: z.enum(Object.values(ORG_STATUS)).optional() });
