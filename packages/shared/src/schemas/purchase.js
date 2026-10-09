import { z } from 'zod';
import { METAL_OPTIONS, METAL_POOL_KINDS, PURITIES } from '../enums.js';
import { listQuerySchema, objectIdSchema, optionalText } from './common.js';

const values = (list) => list.map((o) => o.value);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const paise = (label, { min = 0 } = {}) => z.number({ error: `${label} is required` }).int().min(min, min ? `${label} must be more than zero` : `${label} cannot be negative`).max(1e13);
const mg = (label) => z.number({ error: `${label} is required` }).int().min(1, `${label} must be more than zero`).max(1e9);
const validPurity = (metal, purity) => (PURITIES[metal] ?? []).some((p) => p.fineness === purity);

export const PURCHASE_PAY_MODES = ['cash', 'bank', 'upi'];

/** A tagged piece bought on this bill (created first as a draft product), at its bill cost. */
const purchaseItemSchema = z.object({ productId: objectIdSchema, costPaise: paise('Cost', { min: 1 }) });

/** A new piece on this bill, made from a catalogue item: only what differs per piece is entered here. */
const newPieceSchema = z.object({
  itemId: objectIdSchema,
  grossWeightMg: mg('Weight'),
  huid: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6}$/, 'HUID is 6 letters or digits').optional().or(z.literal('').transform(() => undefined)),
  costPaise: paise('Cost', { min: 1 }),
});

/** Loose metal bought by weight (bullion, old gold, scrap). */
const purchaseMetalSchema = z
  .object({
    metal: z.enum(values(METAL_OPTIONS)),
    purity: z.number().int(),
    kind: z.enum(values(METAL_POOL_KINDS)),
    grossWeightMg: mg('Weight'),
    valuePaise: paise('Value', { min: 1 }),
  })
  .refine((l) => validPurity(l.metal, l.purity), { path: ['purity'], message: 'Unknown purity' });

export const purchaseSchema = z
  .object({
    supplierId: objectIdSchema,
    branchId: objectIdSchema,
    billNo: z.string().trim().min(1, 'Enter the supplier’s bill number').max(40),
    billDate: isoDate,
    orderId: objectIdSchema.optional(),
    items: z.array(purchaseItemSchema).max(300).default([]),
    newPieces: z.array(newPieceSchema).max(300).default([]),
    metalLines: z.array(purchaseMetalSchema).max(30).default([]),
    gstPaise: paise('GST'),
    otherChargesPaise: paise('Other charges').default(0),
    paidNow: z.object({ amountPaise: paise('Paid'), mode: z.enum(PURCHASE_PAY_MODES), reference: optionalText(60) }).optional(),
    note: optionalText(300),
  })
  .refine((v) => v.items.length + v.newPieces.length + v.metalLines.length > 0, { path: ['items'], message: 'Add at least one item or metal line' })
  .refine((v) => new Set(v.items.map((i) => i.productId)).size === v.items.length, { path: ['items'], message: 'An item is listed twice' });

export const purchasePaymentSchema = z.object({ amountPaise: paise('Amount', { min: 1 }), mode: z.enum(PURCHASE_PAY_MODES), reference: optionalText(60), date: isoDate.optional() });

export const purchaseListQuerySchema = listQuerySchema.extend({
  supplierId: objectIdSchema.optional(),
  branchId: objectIdSchema.optional(),
  payment: z.enum(['paid', 'partly_paid', 'due']).optional(),
});

/** What is being ordered from a supplier: free text with metal, purity and approximate weight. */
const orderLineSchema = z
  .object({
    description: z.string().trim().min(2, 'Describe the item').max(120),
    metal: z.enum(values(METAL_OPTIONS)),
    purity: z.number().int(),
    quantity: z.number().int().min(1).max(10000).default(1),
    weightMg: z.number().int().min(0).max(1e9).default(0),
    amountPaise: paise('Estimated amount').default(0),
  })
  .refine((l) => validPurity(l.metal, l.purity), { path: ['purity'], message: 'Unknown purity' });

export const purchaseOrderSchema = z.object({
  supplierId: objectIdSchema,
  branchId: objectIdSchema,
  expectedDate: isoDate.optional(),
  lines: z.array(orderLineSchema).min(1, 'Add at least one line').max(100),
  note: optionalText(300),
});

export const purchaseOrderCancelSchema = z.object({ reason: z.string().trim().min(3, 'Give a reason').max(200) });

export const purchaseOrderListQuerySchema = listQuerySchema.extend({
  supplierId: objectIdSchema.optional(),
  branchId: objectIdSchema.optional(),
  status: z.enum(['open', 'received', 'cancelled']).optional(),
});
