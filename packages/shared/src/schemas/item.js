import { z } from 'zod';
import { JEWELLERY_TYPES, MAKING_CHARGE_TYPES, METAL_OPTIONS, PURITIES, WASTAGE_MODES } from '../enums.js';
import { listQuerySchema, objectIdSchema, optionalText } from './common.js';

const values = (list) => list.map((o) => o.value);
const int = (label, { min = 0, max = 1e10 } = {}) => z.number({ error: `${label} is required` }).int().min(min).max(max);

/**
 * A reusable catalogue item: everything about a design except the piece's own weight, HUID and cost.
 * Picked on purchases (and orders) so the same details are never typed twice.
 */
export const itemSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter the item name').max(120),
    categoryId: objectIdSchema,
    jewelleryType: z.enum(values(JEWELLERY_TYPES)),
    metal: z.enum(values(METAL_OPTIONS)),
    purity: z.number({ error: 'Select a purity' }).int(),
    wastage: z.object({ mode: z.enum(Object.values(WASTAGE_MODES)), value: int('Wastage', { max: 1e8 }) }).default({ mode: 'none', value: 0 }),
    making: z.object({ type: z.enum(Object.values(MAKING_CHARGE_TYPES)), value: int('Making charge') }).default({ type: 'per_gram', value: 0 }),
    hsnCode: z.string().trim().regex(/^\d{4,8}$/, 'HSN is 4 to 8 digits').optional().or(z.literal('').transform(() => undefined)),
    description: optionalText(300),
  })
  .refine((v) => (PURITIES[v.metal] ?? []).some((p) => p.fineness === v.purity), { path: ['purity'], message: 'Select a valid purity for this metal' });

export const itemStatusSchema = z.object({ status: z.enum(['active', 'inactive']) });

export const itemListQuerySchema = listQuerySchema.extend({
  status: z.enum(['active', 'inactive']).optional(),
  metal: z.enum(values(METAL_OPTIONS)).optional(),
});
