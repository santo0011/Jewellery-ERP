import { describe, expect, it } from 'vitest';
import { productSchema } from './schemas/masters.js';
import { deriveWeights, stoneWeightToMg } from './weights.js';

describe('deriveWeights', () => {
  it('converts carats to milligrams (1 ct = 200 mg)', () => {
    expect(stoneWeightToMg({ weight: 1000, weightUnit: 'ct' })).toBe(200);
    expect(stoneWeightToMg({ weight: 250, weightUnit: 'ct' })).toBe(50);
    expect(stoneWeightToMg({ weight: 1234, weightUnit: 'g' })).toBe(1234);
  });

  it('derives stone, net and fine weight', () => {
    const w = deriveWeights({
      grossWeightMg: 12450,
      purity: 916,
      stones: [
        { weight: 500, weightUnit: 'ct' },
        { weight: 350, weightUnit: 'g' },
      ],
    });
    expect(w).toEqual({ stoneWeightMg: 450, netWeightMg: 12000, fineWeightMg: 10992 });
  });

  it('plain gold has net = gross', () => {
    expect(deriveWeights({ grossWeightMg: 10000, purity: 750 })).toEqual({ stoneWeightMg: 0, netWeightMg: 10000, fineWeightMg: 7500 });
  });
});

describe('productSchema', () => {
  const base = {
    name: 'Bridal Ring',
    categoryId: 'a'.repeat(24),
    jewelleryType: 'plain_gold',
    metal: 'gold',
    purity: 916,
    grossWeightMg: 5000,
    wastage: { mode: 'percent', value: 800 },
    making: { type: 'per_gram', value: 50000 },
    branchId: 'b'.repeat(24),
  };

  it('accepts a minimal tagged gold item', () => {
    expect(productSchema.parse(base)).toMatchObject({ stockType: 'tagged', quantity: 1, pricingMode: 'rate_based' });
  });

  it('rejects stones heavier than the item', () => {
    const r = productSchema.safeParse({ ...base, stones: [{ type: 'diamond', count: 1, weight: 25000, weightUnit: 'ct' }] });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].path).toEqual(['grossWeightMg']);
  });

  it('requires a fixed price in fixed mode and validates HUID', () => {
    expect(productSchema.safeParse({ ...base, pricingMode: 'fixed' }).success).toBe(false);
    expect(productSchema.safeParse({ ...base, huid: 'ab12' }).success).toBe(false);
    expect(productSchema.parse({ ...base, huid: 'ab12cd' }).huid).toBe('AB12CD');
  });
});
