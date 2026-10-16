import { z } from 'zod';
import { BRANCH_STATUS } from '../enums.js';
import { BRANCH_CODE_REGEX } from '../patterns.js';
import { addressSchema, emailSchema, gstinSchema, listQuerySchema, mobileSchema, objectIdSchema, optional, passwordSchema, requiredText } from './common.js';

export const branchSchema = z.object({
  code: z
    .string({ error: 'Code is required' })
    .trim()
    .toUpperCase()
    .regex(BRANCH_CODE_REGEX, 'Use 2–10 letters, numbers or hyphens'),
  name: requiredText('Branch name', { min: 2, max: 80 }),
  phone: optional(mobileSchema),
  email: optional(emailSchema),
  gstin: optional(gstinSchema),
  address: addressSchema,
});

// A branch's own login. It signs in with the branch email; only the password is set here.
// The branch's own login: a password (required to create it) and/or its role. Either can be changed on its own.
export const branchLoginSchema = z
  .object({ password: passwordSchema.optional(), roleId: objectIdSchema.optional() })
  .refine((v) => v.password || v.roleId, { path: ['password'], message: 'Enter a password' });

export const branchStatusSchema = z.object({
  status: z.enum(Object.values(BRANCH_STATUS)),
});

export const branchListQuerySchema = listQuerySchema.extend({
  status: z.enum(Object.values(BRANCH_STATUS)).optional(),
  // 'exclude': only the other branches (the Branches page does not list the head office).
  headOffice: z.enum(['exclude']).optional(),
});