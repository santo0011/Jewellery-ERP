import { describe, expect, it } from 'vitest';
import { priceInvoice, priceLine } from '../src/core/pricing/pricingEngine.js';

const tax = { gstEnabled: true, jewelleryGstBps: 300, separateMakingGst: false, makingGstBps: 500 };
const base = {
  pricingMode: 'rate_based',
  stockType: 'tagged',
  netWeightMg: 10000,
  wastage: { mode: 'percent', value: 800 },
  making: { type: 'per_gram', value: 50000 },
  stones: [],
  otherChargePaise: 0,
};

describe('priceLine', () => {
  it('prices a 10 g 22K chain at ₹7,250/g with 8% wastage and ₹500/g making', () => {
    const r = priceLine(base, { ratePerGramPaise: 725000, tax });
    expect(r).toMatchObject({
      metalPaise: 7250000,
      wastageMg: 800,
      wastagePaise: 580000,
      makingPaise: 500000,
      subtotalPaise: 8330000,
      taxablePaise: 8330000,
      gstPaise: 249900,
      totalPaise: 8579900,
    });
  });

  it('handles milligram weights without floating point drift', () => {
    const r = priceLine({ ...base, netWeightMg: 6237, wastage: { mode: 'weight', value: 333 } }, { ratePerGramPaise: 725050, tax });
    expect(r.metalPaise).toBe(4522137);
    expect(r.wastagePaise).toBe(241442);
    expect(Number.isInteger(r.totalPaise)).toBe(true);
  });

  it('supports percentage and fixed making, stones and other charges', () => {
    const pct = priceLine({ ...base, making: { type: 'percent', value: 1200 } }, { ratePerGramPaise: 725000, tax });
    expect(pct.makingPaise).toBe(870000);

    const fixed = priceLine(
      { ...base, making: { type: 'fixed', value: 150000 }, stones: [{ weight: 250, weightUnit: 'ct', ratePaise: 6500000 }, { weight: 1500, weightUnit: 'g', ratePaise: 20000 }], otherChargePaise: 4500 },
      { ratePerGramPaise: 725000, tax },
    );
    expect(fixed.makingPaise).toBe(150000);
    expect(fixed.stonePaise).toBe(1625000 + 30000);
    expect(fixed.subtotalPaise).toBe(7250000 + 580000 + 150000 + 1655000 + 4500);
  });

  it('applies discount to making first and taxes separately when configured', () => {
    const r = priceLine({ ...base, discountPaise: 600000 }, { ratePerGramPaise: 725000, tax: { ...tax, separateMakingGst: true } });
    expect(r.taxablePaise).toBe(7730000);
    expect(r.gstPaise).toBe(Math.round((7730000 * 300) / 10000));
    const r2 = priceLine({ ...base, discountPaise: 100000 }, { ratePerGramPaise: 725000, tax: { ...tax, separateMakingGst: true } });
    expect(r2.gstPaise).toBe(Math.round((7830000 * 300) / 10000) + Math.round((400000 * 500) / 10000));
  });

  it('prices fixed-price items without a rate and rejects excessive discounts', () => {
    const r = priceLine({ ...base, pricingMode: 'fixed', fixedPricePaise: 250000 }, { ratePerGramPaise: null, tax });
    expect(r).toMatchObject({ metalPaise: 0, subtotalPaise: 250000, gstPaise: 7500, ratePerGramPaise: null });
    expect(() => priceLine({ ...base, discountPaise: 99999999 }, { ratePerGramPaise: 725000, tax })).toThrow(RangeError);
    expect(() => priceLine(base, { ratePerGramPaise: null, tax })).toThrow(/Rate missing/);
  });

  it('skips GST when disabled and multiplies fixed making for lots', () => {
    const r = priceLine({ ...base, stockType: 'lot', quantity: 5, making: { type: 'fixed', value: 10000 } }, { ratePerGramPaise: 725000, tax: { ...tax, gstEnabled: false } });
    expect(r.makingPaise).toBe(50000);
    expect(r.gstPaise).toBe(0);
  });
});

describe('priceInvoice', () => {
  const lines = [
    { subtotalPaise: 8330000, discountPaise: 0, taxablePaise: 8330000, gstPaise: 249901 },
    { subtotalPaise: 100000, discountPaise: 5000, taxablePaise: 95000, gstPaise: 2850 },
  ];

  it('splits intra-state GST into CGST and SGST and rounds to the rupee', () => {
    const t = priceInvoice(lines, { interState: false, roundOff: 'nearest_rupee' });
    expect(t.gstPaise).toBe(252751);
    expect(t.cgstPaise + t.sgstPaise).toBe(252751);
    expect(t.igstPaise).toBe(0);
    expect(t.grandTotalPaise % 100).toBe(0);
    expect(t.grandTotalPaise - t.roundOffPaise).toBe(8425000 + 252751);
  });

  it('uses IGST for inter-state supply and supports no rounding', () => {
    const t = priceInvoice(lines, { interState: true, roundOff: 'none' });
    expect(t).toMatchObject({ igstPaise: 252751, cgstPaise: 0, sgstPaise: 0, roundOffPaise: 0, grandTotalPaise: 8677751 });
  });
});
