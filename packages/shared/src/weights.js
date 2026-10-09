import { fineWeightMg, roundHalfAwayFromZero } from './units.js';

export const MG_PER_CARAT = 200;

export const stoneWeightToMg = ({ weight = 0, weightUnit }) => (weightUnit === 'ct' ? roundHalfAwayFromZero((weight * MG_PER_CARAT) / 1000) : weight);

export function deriveWeights({ grossWeightMg = 0, stones = [], purity = 0 }) {
  const stoneWeightMg = stones.reduce((sum, s) => sum + stoneWeightToMg(s), 0);
  const netWeightMg = grossWeightMg - stoneWeightMg;
  return { stoneWeightMg, netWeightMg, fineWeightMg: netWeightMg > 0 ? fineWeightMg(netWeightMg, purity) : 0 };
}
