import { z } from 'zod';
import { METAL_OPTIONS, PURITIES } from '../enums.js';
import { listQuerySchema, objectIdSchema, optional, optionalText } from './common.js';

const validPurity = (metal, purity) => (PURITIES[metal] ?? []).some((p) => p.fineness === purity);

export const OLD_GOLD_PAYOUT_MODES = ['cash', 'bank', 'upi'];

/** One piece of old metal taken from a customer: its tested purity, weights and the rate offered. */
export const oldGoldLineSchema = z
  .object({
    description: z.string().trim().min(2, 'Describe the piece').max(80),
    metal: z.enum(METAL_OPTIONS.map((o) => o.value)),
    purity: z.number().int(),
    grossWeightMg: z.number({ error: 'Weight is required' }).int().min(1, 'Weight must be more than zero').max(1e8),
    // Stones, lac and dirt that do not melt into metal.
    lessWeightMg: z.number().int().min(0).max(1e8).default(0),
    // Melting loss / buy-back deduction, in basis points (2% = 200).
    deductionBps: z.number().int().min(0).max(5000, 'Deduction can be at most 50%').default(0),
    ratePerGramPaise: z.number({ error: 'Rate is required' }).int().min(1, 'Enter the rate').max(1e9),
  })
  .refine((l) => validPurity(l.metal, l.purity), { path: ['purity'], message: 'Unknown purity' })
  .refine((l) => l.lessWeightMg < l.grossWeightMg, { path: ['lessWeightMg'], message: 'Less weight must be below the gross weight' });

export const oldGoldLinesSchema = z.array(oldGoldLineSchema).max(30);

/** Old gold bought for money (not against a bill): the customer is paid out. */
export const oldGoldPurchaseSchema = z.object({
  branchId: objectIdSchema,
  customerId: objectIdSchema,
  lines: oldGoldLinesSchema.min(1, 'Add at least one piece'),
  payout: z.object({ mode: z.enum(OLD_GOLD_PAYOUT_MODES, { error: 'Select how the customer was paid' }), reference: optionalText(60) }),
  note: optionalText(300),
});

export const oldGoldListQuerySchema = listQuerySchema.extend({
  type: z.enum(['purchase', 'exchange']).optional(),
  status: z.enum(['completed', 'cancelled']).optional(),
  branchId: objectIdSchema.optional(),
  customerId: optional(objectIdSchema),
});

export const oldGoldCancelSchema = z.object({ reason: z.string().trim().min(5, 'Give a reason (at least 5 characters)').max(300) });
