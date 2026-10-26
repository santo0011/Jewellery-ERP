import { z } from 'zod';
import {
  BARCODE_SYMBOLOGIES,
  CASH_LIMIT_ACTIONS,
  INVOICE_FORMATS,
  MAKING_CHARGE_TYPES,
  PRINT_DESIGNS,
  PURITIES,
  DEFAULT_MAX_ROUND_OFF_PAISE,
  ROUND_OFF_MODES,
  WASTAGE_MODES,
} from '../enums.js';
import { objectIdSchema, optionalText } from './common.js';
import { approvalSettingsSchema } from './inventory.js';

const prefix = (label) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{1,8}$/, 'Use 1–8 letters, numbers or hyphens');

const bps = (label, max = 10000) =>
  z.number({ error: `${label} is required` }).int().min(0, `${label} cannot be negative`).max(max, `${label} is too high`);

const paise = (label) => z.number({ error: `${label} is required` }).int().min(0, `${label} cannot be negative`).max(1e13);

const hsn = z
  .string()
  .trim()
  .regex(/^\d{4,8}$/, 'HSN must be 4–8 digits');

const purityList = (metal) =>
  z
    .array(z.number().int().refine((f) => PURITIES[metal].some((p) => p.fineness === f), 'Unknown purity'))
    .transform((list) => [...new Set(list)].sort((a, b) => b - a));

export const invoiceSettingsSchema = z.object({
  invoicePrefix: prefix('Invoice prefix'),
  estimatePrefix: prefix('Estimate prefix'),
  defaultFormat: z.enum(Object.values(INVOICE_FORMATS)),
  copies: z.number().int().min(1).max(3),
  showHsn: z.boolean(),
  showHuid: z.boolean(),
  showWeightBreakup: z.boolean(),
  showRateTable: z.boolean(),
  signatoryLabel: z.string().trim().min(1, 'Required').max(60),
  terms: optionalText(1000),
  footerNote: optionalText(200),
});

export const taxSettingsSchema = z
  .object({
    gstEnabled: z.boolean(),
    jewelleryGstBps: bps('GST rate', 2800),
    separateMakingGst: z.boolean(),
    makingGstBps: bps('Making charge GST', 2800),
    hsnJewellery: hsn,
    hsnBullion: hsn,
    hsnSilverArticles: hsn,
    roundOff: z.enum(Object.values(ROUND_OFF_MODES)),
    // The most a bill may be rounded by on the billing screen (more is a discount).
    maxRoundOffPaise: z.number({ error: 'Enter the limit' }).int().min(0, 'Cannot be negative').max(1e7).default(DEFAULT_MAX_ROUND_OFF_PAISE),
  })
  .refine((v) => v.gstEnabled || !v.separateMakingGst, { path: ['separateMakingGst'], message: 'Enable GST first' });

export const jewellerySettingsSchema = z
  .object({
    enabledPurities: z.object({ gold: purityList('gold'), silver: purityList('silver'), platinum: purityList('platinum') }),
    defaultWastageMode: z.enum(Object.values(WASTAGE_MODES)),
    defaultMakingChargeType: z.enum(Object.values(MAKING_CHARGE_TYPES)),
    huidMandatory: z.boolean(),
    panRequiredAbovePaise: paise('PAN threshold'),
    cashLimitPaise: paise('Cash limit'),
    cashLimitAction: z.enum(Object.values(CASH_LIMIT_ACTIONS)),
    allowNegativeStock: z.boolean(),
  })
  .refine((v) => v.enabledPurities.gold.length > 0, { path: ['enabledPurities', 'gold'], message: 'Enable at least one gold purity' });

export const barcodeSettingsSchema = z.object({
  symbology: z.enum(Object.values(BARCODE_SYMBOLOGIES)),
  skuPrefix: prefix('SKU prefix'),
  labelWidthMm: z.number().int().min(20, 'Minimum 20 mm').max(120, 'Maximum 120 mm'),
  labelHeightMm: z.number().int().min(10, 'Minimum 10 mm').max(80, 'Maximum 80 mm'),
  showName: z.boolean(),
  showWeight: z.boolean(),
  showPurity: z.boolean(),
  showPrice: z.boolean(),
});

const printChoice = {
  size: z.enum(Object.values(INVOICE_FORMATS), { error: 'Choose a paper size' }),
  design: z.string({ error: 'Choose a design' }),
};
const designFits = (v) => PRINT_DESIGNS[v.size]?.includes(v.design);
const designIssue = { path: ['design'], message: 'Choose a design for this paper size' };

/** Invoice print: the organisation's size and design, and any branch that prints differently. */
export const printSettingsSchema = z
  .object({
    ...printChoice,
    branches: z
      .array(z.object({ branchId: objectIdSchema, ...printChoice }).refine(designFits, designIssue))
      .max(500)
      .default([])
      .refine((list) => new Set(list.map((b) => b.branchId)).size === list.length, 'A branch is listed twice'),
  })
  .refine(designFits, designIssue);

/** One branch's own print choice, set from the branch; null goes back to the organisation's. */
export const branchPrintSchema = z.object({ choice: z.object(printChoice).refine(designFits, designIssue).nullable() });

export const SETTINGS_SCHEMAS = Object.freeze({
  invoice: invoiceSettingsSchema,
  tax: taxSettingsSchema,
  jewellery: jewellerySettingsSchema,
  barcode: barcodeSettingsSchema,
  approvals: approvalSettingsSchema,
  print: printSettingsSchema,
});
