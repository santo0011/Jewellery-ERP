import { z } from 'zod';
import { BILL_ROUND_OFF, PAYMENT_MODES, ROUND_OFF_UNITS } from '../enums.js';
import { HUID_REGEX } from '../patterns.js';
import { listQuerySchema, objectIdSchema, optional, optionalText } from './common.js';
import { oldGoldLinesSchema } from './oldGold.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const paise = (label) => z.number({ error: `${label} is required` }).int().min(0, `${label} cannot be negative`).max(1e12);

const lineSchema = z.object({
  productId: objectIdSchema,
  discountPaise: paise('Discount').default(0),
});

/** How this bill is rounded (see BILL_ROUND_OFF). Left out: the Tax settings' round-off, as before. */
export const billRoundOffSchema = z.object({
  mode: z.enum(Object.values(BILL_ROUND_OFF)).default(BILL_ROUND_OFF.AUTO),
  unitPaise: z.number().int().refine((v) => ROUND_OFF_UNITS.includes(v), 'Round to ₹1, ₹10, ₹50 or ₹100').default(100),
  // manual: added to the bill (+) or taken off it (−), in paise.
  adjustmentPaise: z.number({ error: 'Enter the adjustment' }).int().min(-1e8).max(1e8).default(0),
});

export const quoteSchema = z.object({
  branchId: objectIdSchema,
  customerId: optional(objectIdSchema),
  // Billing a customer order: its advance is deducted from what the customer pays now.
  orderId: optional(objectIdSchema),
  // The customer's balance from before, settled on this bill only when chosen (and confirmed) at the counter:
  // their advance from before (a minus old due) comes off it; their due from before is added to what is collected.
  useCustomerAdvance: z.boolean().default(false),
  addPreviousDue: z.boolean().default(false),
  // Old gold the customer hands over in exchange: its value is taken off what they pay now.
  oldGold: oldGoldLinesSchema.default([]),
  roundOff: billRoundOffSchema.optional(),
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

// A customer paying later against what they owe (bills left due, old due). `saleId`: settle this bill first.
export const duePaymentSchema = z.object({
  branchId: objectIdSchema,
  mode: z.enum(['cash', 'card', 'upi', 'bank'], { error: 'Select how it was paid' }),
  amountPaise: z.number({ error: 'Amount is required' }).int().min(1, 'Amount must be more than zero').max(1e12),
  reference: optionalText(60),
  note: optionalText(300),
  saleId: optional(objectIdSchema),
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
