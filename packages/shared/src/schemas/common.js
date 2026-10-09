import { z } from 'zod';
import { STATE_CODES } from '../enums.js';
import { GSTIN_REGEX, MOBILE_REGEX, OBJECT_ID_REGEX, PAN_REGEX, PINCODE_REGEX } from '../patterns.js';

const emptyToNull = (v) => (typeof v === 'string' && v.trim() === '' ? null : v);

export const optional = (schema) => z.preprocess(emptyToNull, schema.nullable().optional());

export const requiredText = (label, { min = 1, max = 120 } = {}) => {
  let schema = z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`);
  if (min > 1) schema = schema.min(min, `${label} must be at least ${min} characters`);
  return schema.max(max, `${label} must be at most ${max} characters`);
};

export const optionalText = (max = 200) => optional(z.string().trim().max(max, `Must be at most ${max} characters`));

export const emailSchema = z
  .string({ error: 'Email is required' })
  .trim()
  .toLowerCase()
  .min(1, 'Email is required')
  .pipe(z.email('Enter a valid email address'));

export const mobileSchema = z
  .string({ error: 'Mobile number is required' })
  .trim()
  .regex(MOBILE_REGEX, 'Enter a valid 10-digit mobile number');

export const gstinSchema = z.string().trim().toUpperCase().regex(GSTIN_REGEX, 'Enter a valid 15-character GSTIN');

export const panSchema = z.string().trim().toUpperCase().regex(PAN_REGEX, 'Enter a valid PAN (e.g. ABCDE1234F)');

export const stateCodeSchema = z.enum(STATE_CODES, { error: 'Select a state' });

export const objectIdSchema = z.string().regex(OBJECT_ID_REGEX, 'Invalid id');

export const passwordSchema = z
  .string({ error: 'Password is required' })
  .min(6, 'Password must be at least 6 characters')
  .max(128, 'Password must be at most 128 characters');

export const addressSchema = z.object({
  line1: optionalText(200),
  line2: optionalText(200),
  city: optionalText(80),
  stateCode: optional(stateCodeSchema),
  pincode: optional(z.string().trim().regex(PINCODE_REGEX, 'Enter a valid 6-digit PIN code')),
});

export const idParamsSchema = z.object({ id: objectIdSchema });

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
});
