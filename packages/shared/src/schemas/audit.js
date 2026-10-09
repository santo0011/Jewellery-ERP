import { z } from 'zod';
import { AUDIT_MODULES } from '../enums.js';
import { listQuerySchema, objectIdSchema } from './common.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const auditListQuerySchema = listQuerySchema
  .extend({
    module: z.enum(AUDIT_MODULES).optional(),
    action: z.string().trim().max(40).optional(),
    userId: objectIdSchema.optional(),
    recordId: objectIdSchema.optional(),
    from: isoDate.optional(),
    to: isoDate.optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { path: ['to'], message: 'End date must be after start date' });
