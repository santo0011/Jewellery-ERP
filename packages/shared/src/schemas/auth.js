import { z } from 'zod';
import { emailSchema, mobileSchema, passwordSchema, requiredText, stateCodeSchema } from './common.js';

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ error: 'Password is required' }).min(1, 'Password is required').max(128),
  rememberMe: z.boolean().default(false),
});

export const registerOrganisationSchema = z.object({
  organisationName: requiredText('Business name', { min: 2, max: 120 }),
  ownerName: requiredText('Your name', { min: 2, max: 80 }),
  email: emailSchema,
  mobile: mobileSchema,
  stateCode: stateCodeSchema,
  password: passwordSchema,
});

export const forgotPasswordSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(20, 'Invalid or expired reset link').max(200),
  password: passwordSchema,
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required').max(128),
    newPassword: passwordSchema,
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    path: ['newPassword'],
    message: 'New password must be different from the current password',
  });

export const updateProfileSchema = z.object({
  name: requiredText('Name', { min: 2, max: 80 }),
  mobile: mobileSchema,
});
