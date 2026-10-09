import { z } from 'zod';
import { listQuerySchema, objectIdSchema, optionalText } from './common.js';

const limit = z.number().int().min(1).max(100000).nullable(); // null = unlimited

/** A subscription plan the Super Admin sells: price per period and usage limits (free days are set per organisation). */
export const planSchema = z.object({
  name: z.string().trim().min(2, 'Enter the plan name').max(60),
  description: optionalText(200),
  pricePaise: z.number({ error: 'Enter the price' }).int().min(0).max(1e10),
  durationMonths: z.number().int().refine((v) => [1, 3, 6, 12, 24].includes(v), 'Pick 1, 3, 6, 12 or 24 months'),
  limits: z.object({ users: limit, branches: limit, products: limit }),
  features: z.array(z.string().trim().min(1).max(80)).max(12).default([]),
  isActive: z.boolean().default(true),
  isDefault: z.boolean().default(false), // new organisations start on this plan during their free days
  isPopular: z.boolean().default(false), // highlighted on the pricing cards
  sortOrder: z.number().int().min(0).max(999).default(0),
});

/**
 * Super Admin puts an organisation on a plan:
 *   trial  - a free period of `days` (TRIAL_DAYS if not given)
 *   manual - paid outside the app (cash / bank): records the payment and starts the period
 *   extend - add days to the current period without a payment (goodwill, correction)
 */
export const assignPlanSchema = z
  .object({
    planId: objectIdSchema,
    mode: z.enum(['trial', 'manual', 'extend']),
    days: z.number().int().min(1).max(3650).optional(),
    months: z.number().int().min(1).max(60).optional(),
    amountPaise: z.number().int().min(0).max(1e10).optional(),
    paymentMode: z.enum(['cash', 'bank', 'upi', 'cheque', 'other']).optional(),
    reference: optionalText(80),
    note: optionalText(200),
  })
  .refine((v) => v.mode !== 'extend' || v.days, { path: ['days'], message: 'Enter the number of days' });

/** Which payment methods Cashfree's page offers for this checkout ('all' = everything enabled on the account). */
export const CHECKOUT_METHODS = ['all', 'upi', 'cards', 'netbanking', 'wallets', 'paylater'];
export const checkoutSchema = z.object({ planId: objectIdSchema, methods: z.enum(CHECKOUT_METHODS).default('all') });

/** Pay a UPI checkout inside the app: a QR to scan, links that open UPI apps, or a request to a UPI ID. */
export const upiPaySchema = z
  .object({
    method: z.enum(['qr', 'apps', 'upi_id']),
    upiId: z.string().trim().toLowerCase().regex(/^[a-z0-9._-]{2,256}@[a-z][a-z0-9.-]{1,63}$/, 'Enter a UPI ID like name@okhdfcbank').optional(),
  })
  .refine((v) => v.method !== 'upi_id' || v.upiId, { path: ['upiId'], message: 'Enter your UPI ID' });

export const billingPaymentListQuerySchema = listQuerySchema.extend({
  status: z.enum(['created', 'paid', 'failed', 'expired']).optional(),
  organisationId: objectIdSchema.optional(),
  source: z.enum(['cashfree', 'manual']).optional(),
});

export const orderIdParamsSchema = z.object({ orderId: z.string().regex(/^[A-Za-z0-9_-]{6,50}$/) });
