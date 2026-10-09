import { z } from 'zod';
import { PAYMENT_MODES } from '../enums.js';
import { HUID_REGEX } from '../patterns.js';
import { listQuerySchema, objectIdSchema, optional, optionalText } from './common.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const paise = (label) => z.number({ error: `${label} is required` }).int().min(0, `${label} cannot be negative`).max(1e12);

const lineSchema = z.object({
  productId: objectIdSchema,
  discountPaise: paise('Discount').default(0),
});

export const quoteSchema = z.object({
  branchId: objectIdSchema,
  customerId: optional(objectIdSchema),
  // Billing a customer order: its advance is deducted from what the customer pays now.
  orderId: optional(objectIdSchema),
  items: z
    .array(lineSchema)
    .min(1, 'Add at least one item')
    .max(100)
    .refine((list) => new Set(list.map((l) => l.productId)).size === list.length, 'An item is added twice'),
});

export const paymentSchema = z.object({
  mode: z.enum(PAYMENT_MODES.map((m) => m.value)),
  amountPaise: z.number({ error: 'Amount is required' }).int().min(1, 'Amount must be more than zero').max(1e12),
  reference: optionalText(60),
});

export const saleSchema = quoteSchema.extend({
  payments: z.array(paymentSchema).max(10).default([]),
  notes: optionalText(500),
});

export const saleCancelSchema = z.object({ reason: z.string().trim().min(5, 'Give a reason (at least 5 characters)').max(300) });

export const salesReturnSchema = z.object({
  productIds: z.array(objectIdSchema).min(1, 'Select at least one item').max(100),
  refundMode: z.enum(['cash', 'bank', 'credit']),
  reason: z.string().trim().min(5, 'Give a reason (at least 5 characters)').max(300),
});

export const saleListQuerySchema = listQuerySchema.extend({
  status: z.enum(['completed', 'cancelled']).optional(),
  branchId: objectIdSchema.optional(),
  customerId: objectIdSchema.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export const productLookupParamsSchema = z.object({ code: z.string().trim().min(3).max(40) });

/** Adding a missing HUID at the counter, without opening the full product form. */
export const productHuidSchema = z.object({ huid: z.string({ error: 'Enter the HUID' }).trim().toUpperCase().regex(HUID_REGEX, 'HUID is 6 letters or digits') });
