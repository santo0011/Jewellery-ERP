import { z } from 'zod';
import { BRANCH_STATUS } from '../enums.js';
import { BRANCH_PERMISSIONS } from '../permissions.js';
import { BRANCH_CODE_REGEX } from '../patterns.js';
import { addressSchema, emailSchema, gstinSchema, listQuerySchema, mobileSchema, optional, passwordSchema, requiredText } from './common.js';

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
export const branchLoginSchema = z.object({ password: passwordSchema });

export const branchStatusSchema = z.object({
  status: z.enum(Object.values(BRANCH_STATUS)),
});

export const branchListQuerySchema = listQuerySchema.extend({
  status: z.enum(Object.values(BRANCH_STATUS)).optional(),
});

export const branchPermissionsSchema = z.object({
  permissions: z
    .array(z.enum(BRANCH_PERMISSIONS, { error: 'Not a branch permission' }))
    .max(BRANCH_PERMISSIONS.length)
    .transform((list) => [...new Set(list)]),
});
