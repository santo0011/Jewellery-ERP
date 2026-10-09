import { z } from 'zod';
import { ADJUSTMENT_REASONS, METAL_OPTIONS, METAL_POOL_KINDS, PURITIES } from '../enums.js';
import { listQuerySchema, objectIdSchema, optionalText } from './common.js';

const values = (list) => list.map((o) => o.value);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const mg = (label) => z.number({ error: `${label} is required` }).int().min(1, `${label} must be more than zero`).max(1e9, `${label} is too large`);
const paise = z.number().int().min(0).max(1e13);
const validPurity = (metal, purity) => PURITIES[metal]?.some((p) => p.fineness === purity);

export const rateBatchSchema = z.object({
  rates: z
    .array(
      z
        .object({
          metal: z.enum(values(METAL_OPTIONS)),
          purity: z.number().int(),
          ratePerGramPaise: z.number({ error: 'Rate is required' }).int().min(100, 'Rate looks too low').max(1e9, 'Rate looks too high'),
        })
        .refine((r) => validPurity(r.metal, r.purity), { path: ['purity'], message: 'Unknown purity' }),
    )
    .min(1, 'Enter at least one rate')
    .max(20)
    .refine((list) => new Set(list.map((r) => `${r.metal}:${r.purity}`)).size === list.length, 'Each purity can appear once'),
  note: optionalText(200),
});

export const rateHistoryQuerySchema = listQuerySchema.extend({
  metal: z.enum(values(METAL_OPTIONS)).optional(),
  purity: z.coerce.number().int().optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

const metalLineSchema = z
  .object({
    metal: z.enum(values(METAL_OPTIONS)),
    purity: z.number().int(),
    kind: z.enum(values(METAL_POOL_KINDS)),
    direction: z.enum(['in', 'out']).default('in'),
    grossWeightMg: mg('Weight'),
    valuePaise: paise.default(0),
  })
  .refine((l) => validPurity(l.metal, l.purity), { path: ['purity'], message: 'Unknown purity' });

export const openingStockSchema = z
  .object({
    branchId: objectIdSchema,
    productIds: z.array(objectIdSchema).max(500).default([]),
    metalLines: z.array(metalLineSchema.refine((l) => l.direction === 'in', { path: ['direction'], message: 'Opening stock only adds metal' })).max(50).default([]),
    note: optionalText(300),
  })
  .refine((v) => v.productIds.length + v.metalLines.length > 0, { path: ['productIds'], message: 'Add at least one product or metal line' })
  .refine((v) => new Set(v.productIds).size === v.productIds.length, { path: ['productIds'], message: 'A product is listed twice' });

export const adjustmentSchema = z
  .object({
    branchId: objectIdSchema,
    reason: z.enum(values(ADJUSTMENT_REASONS)),
    productIds: z.array(objectIdSchema).max(200).default([]),
    metalLines: z.array(metalLineSchema).max(50).default([]),
    note: z.string().trim().min(5, 'Explain the adjustment in a few words').max(500),
  })
  .refine((v) => v.productIds.length + v.metalLines.length > 0, { path: ['productIds'], message: 'Add at least one product or metal line' })
  .refine((v) => new Set(v.productIds).size === v.productIds.length, { path: ['productIds'], message: 'A product is listed twice' });

export const transferSchema = z
  .object({
    fromBranchId: objectIdSchema,
    toBranchId: objectIdSchema,
    productIds: z.array(objectIdSchema).min(1, 'Add at least one item').max(500),
    note: optionalText(300),
  })
  .refine((v) => v.fromBranchId !== v.toBranchId, { path: ['toBranchId'], message: 'Choose a different destination branch' })
  .refine((v) => new Set(v.productIds).size === v.productIds.length, { path: ['productIds'], message: 'An item is listed twice' });

export const transferRejectSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason').max(300) });

export const stockDocListQuerySchema = listQuerySchema.extend({
  status: z.string().max(30).optional(),
  branchId: objectIdSchema.optional(),
});

export const movementListQuerySchema = listQuerySchema.extend({
  branchId: objectIdSchema.optional(),
  productId: objectIdSchema.optional(),
  type: z.string().max(30).optional(),
  metal: z.enum(values(METAL_OPTIONS)).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export const stockSummaryQuerySchema = z.object({ branchId: objectIdSchema.optional() });

export const approvalDecisionSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  comment: optionalText(300),
});

export const approvalListQuerySchema = listQuerySchema.extend({ status: z.enum(['pending', 'approved', 'rejected']).optional() });

export const approvalSettingsSchema = z.object({ stockAdjustments: z.boolean() });
