import { describe, expect, it } from 'vitest';
import { valueOldGold } from './oldGold.js';
import { oldGoldLineSchema } from './schemas/oldGold.js';

describe('valueOldGold', () => {
  it('values the net weight at the rate, less the deduction', () => {
    expect(valueOldGold({ grossWeightMg: 10000, lessWeightMg: 500, purity: 916, ratePerGramPaise: 680000, deductionBps: 200 })).toEqual({
      netWeightMg: 9500,
      fineWeightMg: 8702,
      grossValuePaise: 6460000,
      deductionPaise: 129200,
      valuePaise: 6330800,
    });
  });

  it('defaults to no stones and no deduction', () => {
    expect(valueOldGold({ grossWeightMg: 1234, purity: 999, ratePerGramPaise: 700000 })).toMatchObject({ netWeightMg: 1234, valuePaise: 863800, deductionPaise: 0 });
  });
});

describe('oldGoldLineSchema', () => {
  const line = { description: 'Ring', metal: 'gold', purity: 916, grossWeightMg: 5000, ratePerGramPaise: 600000 };
  it('accepts a listed purity and fills defaults', () => {
    expect(oldGoldLineSchema.parse(line)).toMatchObject({ lessWeightMg: 0, deductionBps: 0 });
  });
  it('rejects unknown purities and stones heavier than the piece', () => {
    expect(oldGoldLineSchema.safeParse({ ...line, purity: 900 }).success).toBe(false);
    expect(oldGoldLineSchema.safeParse({ ...line, lessWeightMg: 5000 }).success).toBe(false);
  });
});
