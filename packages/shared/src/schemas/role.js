import { z } from 'zod';
import { ALL_PERMISSIONS } from '../permissions.js';
import { optionalText, requiredText } from './common.js';

export const roleSchema = z.object({
  name: requiredText('Role name', { min: 2, max: 60 }),
  description: optionalText(240),
  permissions: z
    .array(z.enum(ALL_PERMISSIONS, { error: 'Unknown permission' }))
    .min(1, 'Select at least one permission')
    .transform((list) => [...new Set(list)]),
});
