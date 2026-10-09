import { z } from 'zod';
import { ADVANCE_PAYMENT_MODES, JEWELLERY_TYPES, MAKING_CHARGE_TYPES, METAL_OPTIONS, OPEN_ORDER_STATUSES, ORDER_STATUS, PRICING_MODES, PURITIES, WASTAGE_MODES } from '../enums.js';
import { stoneWeightToMg } from '../weights.js';
import { stoneSchema } from './masters.js';
import { listQuerySchema, objectIdSchema, optional, optionalText, requiredText } from './common.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const paise = (label, { min = 0 } = {}) => z.number({ error: `${label} is required` }).int(`${label} must be a whole number`).min(min, min ? `${label} must be more than zero` : `${label} cannot be negative`).max(1e12);

// What is being made, as agreed with the customer. Wastage, making, stones and pricing carry over to the finished piece.
const orderItemFields = {
    description: requiredText('Item description', { min: 2, max: 200 }),
    categoryId: optional(objectIdSchema),
    jewelleryType: z.enum(JEWELLERY_TYPES.map((t) => t.value)).optional(),
    metal: z.enum(METAL_OPTIONS.map((m) => m.value), { error: 'Select a metal' }),
    purity: optional(z.number().int()),
    approxWeightMg: optional(z.number().int().min(1, 'Weight must be more than zero').max(1e8)),
    size: optionalText(40),
    quantity: z.number().int().min(1, 'At least 1').max(1000).default(1),
    stones: z.array(stoneSchema).max(30).default([]),
    wastage: z.object({ mode: z.enum(Object.values(WASTAGE_MODES)), value: z.number().int().min(0).max(1e8) }).optional(),
    making: z.object({ type: z.enum(Object.values(MAKING_CHARGE_TYPES)), value: z.number().int().min(0).max(1e12) }).optional(),
    otherChargePaise: paise('Other charges').default(0),
    pricingMode: z.enum(Object.values(PRICING_MODES)).default('rate_based'),
    fixedPricePaise: optional(paise('Fixed price', { min: 1 })),
};

const itemRules = (i, ctx) => {
  if (i.pricingMode === 'fixed' && !i.fixedPricePaise) ctx.addIssue({ code: 'custom', path: ['fixedPricePaise'], message: 'Enter the agreed price' });
  if (i.wastage?.mode === 'percent' && i.wastage.value > 5000) ctx.addIssue({ code: 'custom', path: ['wastage', 'value'], message: 'Wastage above 50% is not allowed' });
  if (i.making?.type === 'percent' && i.making.value > 10000) ctx.addIssue({ code: 'custom', path: ['making', 'value'], message: 'Making above 100% is not allowed' });
  const stoneMg = (i.stones ?? []).reduce((sum, s) => sum + stoneWeightToMg(s), 0);
  if (i.approxWeightMg && stoneMg >= i.approxWeightMg) ctx.addIssue({ code: 'custom', path: ['approxWeightMg'], message: 'Stone weight must be less than the weight' });
};

const orderItemSchema = z
  .object({
    ...orderItemFields,
    estimatedPaise: paise('Estimated price').default(0),
    // Known up front for a ready hallmarked piece; used when the item is finished.
    huid: optional(z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6}$/, 'HUID is 6 letters or digits')),
    notes: optionalText(500),
  })
  .refine((i) => i.purity == null || PURITIES[i.metal]?.some((p) => p.fineness === i.purity), { path: ['purity'], message: 'Unknown purity for this metal' })
  .superRefine(itemRules);

export const advanceSchema = z.object({
  mode: z.enum(ADVANCE_PAYMENT_MODES, { error: 'Select how the advance was paid' }),
  amountPaise: paise('Advance', { min: 1 }),
  reference: optionalText(60),
});

export const orderSchema = z.object({
  branchId: objectIdSchema,
  customerId: objectIdSchema,
  items: z.array(orderItemSchema).min(1, 'Add at least one item').max(50),
  expectedDate: optional(isoDate),
  priority: z.enum(['normal', 'urgent']).default('normal'),
  advance: advanceSchema.optional(),
  notes: optionalText(1000),
});

export const orderStatusSchema = z.object({
  status: z.enum([ORDER_STATUS.BOOKED, ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.READY]),
  note: optionalText(300),
});

export const orderCancelSchema = z.object({
  reason: z.string().trim().min(5, 'Give a reason (at least 5 characters)').max(300),
  refundMode: z.enum(ADVANCE_PAYMENT_MODES).optional(),
});

export const orderListQuerySchema = listQuerySchema.extend({
  status: z.enum([...Object.values(ORDER_STATUS), 'open']).optional(),
  branchId: objectIdSchema.optional(),
  customerId: objectIdSchema.optional(),
});

export const isOpenOrder = (status) => OPEN_ORDER_STATUSES.includes(status);

/** The finished piece for one order line: it becomes a tagged stock item at the order's branch, ready to bill. */
export const orderFinishSchema = z.object({
  name: optionalText(120),
  categoryId: optional(objectIdSchema),
  purity: optional(z.number().int()),
  grossWeightMg: z.number({ error: 'Enter the final weight' }).int().min(1, 'Weight must be more than zero').max(1e8),
  huid: optional(z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6}$/, 'HUID is 6 letters or digits')),
  wastage: z.object({ mode: z.enum(['percent', 'weight', 'none']), value: z.number().int().min(0).max(1e8) }),
  making: z.object({ type: z.enum(['per_gram', 'percent', 'fixed']), value: z.number().int().min(0).max(1e12) }),
  costPricePaise: optional(z.number().int().min(0).max(1e12)),
});

export const orderItemParamsSchema = z.object({ id: objectIdSchema, index: z.coerce.number().int().min(0).max(49) });

/** Price the items at today's rate before booking (same engine as the bill). */
export const orderEstimateSchema = z.object({
  branchId: objectIdSchema,
  items: z.array(z.object(orderItemFields).superRefine(itemRules)).min(1).max(50),
});
