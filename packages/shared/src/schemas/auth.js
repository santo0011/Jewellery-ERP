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

/** The 6-digit code emailed for a password reset (digits only). */
export const resetCodeSchema = z.string().trim().regex(/^[0-9]{6}$/, 'Enter the 6-digit code');

/** Step 2 of forgot password: is this code right (without using it up)? */
export const verifyResetCodeSchema = z.object({ email: emailSchema, otp: resetCodeSchema });

/** Step 3: the code again, and the new password. */
export const resetPasswordSchema = z.object({ email: emailSchema, otp: resetCodeSchema, password: passwordSchema });

export const changePasswordSchema = z
  .object({
    // Optional only for a session opened with an emailed code (the server checks).
    currentPassword: z.string().max(128).optional().default(''),
    newPassword: passwordSchema,
  })
  .refine((d) => !d.currentPassword || d.currentPassword !== d.newPassword, {
    path: ['newPassword'],
    message: 'New password must be different from the current password',
  });

export const updateProfileSchema = z.object({
  name: requiredText('Name', { min: 2, max: 80 }),
  mobile: mobileSchema,
});
