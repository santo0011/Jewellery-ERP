import { z } from 'zod';
import {
  CUSTOMER_SEGMENTS,
  JEWELLERY_TYPES,
  KYC_DOC_TYPES,
  MAKING_CHARGE_TYPES,
  METAL_OPTIONS,
  PRICING_MODES,
  PRODUCT_STATUS,
  RECORD_STATUS,
  STOCK_TYPES,
  STONE_TYPES,
  SUPPLIER_SUPPLIES,
  WASTAGE_MODES,
} from '../enums.js';
import { HSN_REGEX, HUID_REGEX, IFSC_REGEX } from '../patterns.js';
import { stoneWeightToMg } from '../weights.js';
import {
  addressSchema,
  emailSchema,
  gstinSchema,
  listQuerySchema,
  mobileSchema,
  objectIdSchema,
  optional,
  optionalText,
  panSchema,
  requiredText,
} from './common.js';

const values = (list) => list.map((o) => o.value);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter a valid date');
const pastDate = isoDate.refine((d) => d <= new Date().toISOString().slice(0, 10), 'Date cannot be in the future');
const int = (label, { min = 0, max = 1e13 } = {}) =>
  z.number({ error: `${label} is required` }).int(`${label} must be a whole number`).min(min, `${label} must be at least ${min}`).max(max, `${label} is too large`);
const hsnSchema = z.string().trim().regex(HSN_REGEX, 'HSN must be 4–8 digits');
const tags = z.array(z.string().trim().min(1).max(30)).max(10).default([]);

export const recordStatusSchema = z.object({ status: z.enum(Object.values(RECORD_STATUS)) });

export const customerSchema = z.object({
  name: requiredText('Name', { min: 2, max: 100 }),
  mobile: mobileSchema,
  alternateMobile: optional(mobileSchema),
  email: optional(emailSchema),
  address: addressSchema,
  dob: optional(pastDate),
  anniversary: optional(pastDate),
  gstin: optional(gstinSchema),
  pan: optional(panSchema),
  kyc: z
    .object({
      type: optional(z.enum(values(KYC_DOC_TYPES))),
      number: optional(z.string().trim().toUpperCase().regex(/^[A-Z0-9 -]{4,20}$/, 'Enter a valid document number')),
      verified: z.boolean().default(false),
    })
    .refine((k) => Boolean(k.type) === Boolean(k.number), { path: ['number'], message: 'Enter both the document type and number' })
    .default({ verified: false }),
  segment: z.enum(values(CUSTOMER_SEGMENTS)).default('new'),
  preferredMetals: z.array(z.enum(values(METAL_OPTIONS))).max(3).default([]),
  tags,
  openingBalancePaise: int('Opening balance', { min: -1e12, max: 1e12 }).default(0),
  notes: optionalText(1000),
});

export const customerListQuerySchema = listQuerySchema.extend({
  segment: z.enum(values(CUSTOMER_SEGMENTS)).optional(),
  status: z.enum(Object.values(RECORD_STATUS)).optional(),
  due: z.enum(['due', 'clear']).optional(),
});

export const supplierSchema = z.object({
  companyName: requiredText('Company name', { min: 2, max: 120 }),
  contactPerson: optionalText(80),
  mobile: mobileSchema,
  alternateMobile: optional(mobileSchema),
  email: optional(emailSchema),
  gstin: optional(gstinSchema),
  pan: optional(panSchema),
  address: addressSchema,
  bankDetails: z
    .object({
      accountName: optionalText(100),
      accountNumber: optional(z.string().trim().regex(/^\d{6,20}$/, 'Account number must be 6–20 digits')),
      ifsc: optional(z.string().trim().toUpperCase().regex(IFSC_REGEX, 'Enter a valid IFSC (e.g. SBIN0001234)')),
      bankName: optionalText(80),
      branchName: optionalText(80),
      upiId: optional(z.string().trim().regex(/^[\w.-]{2,}@[a-zA-Z]{2,}$/, 'Enter a valid UPI ID')),
    })
    .default({}),
  supplies: z.array(z.enum(values(SUPPLIER_SUPPLIES))).max(8).default([]),
  paymentTermsDays: int('Payment terms', { max: 365 }).default(0),
  openingBalancePaise: int('Opening balance', { min: -1e12, max: 1e12 }).default(0),
  openingFineGoldMg: int('Opening gold', { min: -1e9, max: 1e9 }).default(0),
  openingFineSilverMg: int('Opening silver', { min: -1e10, max: 1e10 }).default(0),
  notes: optionalText(1000),
});

export const supplierListQuerySchema = listQuerySchema.extend({
  status: z.enum(Object.values(RECORD_STATUS)).optional(),
  supplies: z.enum(values(SUPPLIER_SUPPLIES)).optional(),
});

export const categorySchema = z.object({
  name: requiredText('Name', { min: 2, max: 60 }),
  parentId: optional(objectIdSchema),
  defaultMetal: optional(z.enum(values(METAL_OPTIONS))),
  hsnCode: optional(hsnSchema),
  sortOrder: int('Sort order', { max: 9999 }).default(0),
});

export const stoneSchema = z.object({
  type: z.enum(values(STONE_TYPES)),
  name: optionalText(60),
  count: int('Count', { min: 1, max: 100000 }),
  weight: int('Stone weight', { max: 1e9 }),
  weightUnit: z.enum(['ct', 'g']),
  ratePaise: int('Stone rate').default(0),
});

export const productSchema = z
  .object({
    name: requiredText('Product name', { min: 2, max: 120 }),
    categoryId: objectIdSchema,
    subcategoryId: optional(objectIdSchema),
    jewelleryType: z.enum(values(JEWELLERY_TYPES)),
    metal: z.enum(values(METAL_OPTIONS)),
    purity: z.number({ error: 'Select a purity' }).int(),
    stockType: z.enum(Object.values(STOCK_TYPES)).default('tagged'),
    quantity: int('Quantity', { min: 1, max: 100000 }).default(1),
    grossWeightMg: int('Gross weight', { min: 1, max: 1e8 }),
    stones: z.array(stoneSchema).max(30).default([]),
    wastage: z.object({ mode: z.enum(Object.values(WASTAGE_MODES)), value: int('Wastage', { max: 1e8 }) }),
    making: z.object({ type: z.enum(Object.values(MAKING_CHARGE_TYPES)), value: int('Making charge') }),
    otherChargePaise: int('Other charges').default(0),
    hsnCode: optional(hsnSchema),
    costPricePaise: optional(int('Cost price')),
    pricingMode: z.enum(Object.values(PRICING_MODES)).default('rate_based'),
    fixedPricePaise: optional(int('Fixed price')),
    huid: optional(z.string().trim().toUpperCase().regex(HUID_REGEX, 'HUID is 6 letters or digits')),
    hallmarkCentre: optionalText(100),
    hallmarkDate: optional(pastDate),
    certificateNo: optionalText(60),
    supplierId: optional(objectIdSchema),
    branchId: objectIdSchema,
    description: optionalText(1000),
    tags,
  })
  .superRefine((p, ctx) => {
    if (p.stockType === 'tagged' && p.quantity !== 1) ctx.addIssue({ code: 'custom', path: ['quantity'], message: 'A tagged item is a single piece' });
    if (p.pricingMode === 'fixed' && !p.fixedPricePaise) ctx.addIssue({ code: 'custom', path: ['fixedPricePaise'], message: 'Enter the fixed selling price' });
    if (p.wastage.mode === 'percent' && p.wastage.value > 5000) ctx.addIssue({ code: 'custom', path: ['wastage', 'value'], message: 'Wastage above 50% is not allowed' });
    if (p.making.type === 'percent' && p.making.value > 10000) ctx.addIssue({ code: 'custom', path: ['making', 'value'], message: 'Making above 100% is not allowed' });
    const stoneMg = p.stones.reduce((sum, s) => sum + stoneWeightToMg(s), 0);
    if (stoneMg >= p.grossWeightMg) ctx.addIssue({ code: 'custom', path: ['grossWeightMg'], message: 'Stone weight must be less than gross weight' });
  });

export const productListQuerySchema = listQuerySchema.extend({
  categoryId: objectIdSchema.optional(),
  metal: z.enum(values(METAL_OPTIONS)).optional(),
  purity: z.coerce.number().int().optional(),
  status: z.enum(Object.values(PRODUCT_STATUS)).optional(),
  branchId: objectIdSchema.optional(),
  supplierId: objectIdSchema.optional(),
});
