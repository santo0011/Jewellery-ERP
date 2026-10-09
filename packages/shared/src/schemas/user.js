import { z } from 'zod';
import { USER_STATUS } from '../enums.js';
import { emailSchema, listQuerySchema, mobileSchema, objectIdSchema, optional, passwordSchema, requiredText } from './common.js';

const branchAccessSchema = z
  .object({
    all: z.boolean(),
    branchIds: z.array(objectIdSchema).max(200).default([]),
  })
  .refine((v) => v.all || v.branchIds.length > 0, { path: ['branchIds'], message: 'Select at least one branch' });

const userFields = {
  name: requiredText('Name', { min: 2, max: 80 }),
  mobile: optional(mobileSchema),
  roleIds: z.array(objectIdSchema).min(1, 'Select at least one role').max(10),
  branchAccess: branchAccessSchema,
  defaultBranchId: optional(objectIdSchema),
};

const defaultBranchWithinAccess = (v) => !v.defaultBranchId || v.branchAccess.all || v.branchAccess.branchIds.includes(v.defaultBranchId);
const defaultBranchIssue = { path: ['defaultBranchId'], message: 'Default branch must be one of the assigned branches' };

export const createUserSchema = z
  .object({ ...userFields, email: emailSchema, password: passwordSchema })
  .refine(defaultBranchWithinAccess, defaultBranchIssue);

export const updateUserSchema = z.object(userFields).refine(defaultBranchWithinAccess, defaultBranchIssue);

export const userStatusSchema = z.object({ status: z.enum(Object.values(USER_STATUS)) });

export const adminResetPasswordSchema = z.object({ password: passwordSchema });

export const userListQuerySchema = listQuerySchema.extend({
  status: z.enum(Object.values(USER_STATUS)).optional(),
  roleId: objectIdSchema.optional(),
  branchId: objectIdSchema.optional(),
});
