import { z } from 'zod';
import { TIMEZONES } from '../enums.js';
import { addressSchema, emailSchema, gstinSchema, mobileSchema, optional, optionalText, panSchema, requiredText } from './common.js';

export const updateOrganisationSchema = z.object({
  name: requiredText('Business name', { min: 2, max: 120 }),
  legalName: optionalText(160),
  gstin: optional(gstinSchema),
  pan: optional(panSchema),
  phone: optional(mobileSchema),
  email: optional(emailSchema),
  timezone: z.enum(TIMEZONES, { error: 'Select a timezone' }),
  address: addressSchema,
});
