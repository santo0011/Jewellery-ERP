import { applyBps, fineWeightMg, roundHalfAwayFromZero } from './units.js';

/**
 * What one piece of old gold (or old silver) bought from a customer is worth: the net weight (gross less stones and
 * dirt) at the rate offered for its tested purity, less the melting-loss deduction.
 * The server is the authority; the UI uses this only for a live preview.
 *
 *   net       = gross − less                       (mg)
 *   gross val = net × ratePerGram / 1000           (paise)
 *   deduction = gross val × deductionBps / 10000   (paise)
 *   value     = gross val − deduction
 */
export function valueOldGold({ grossWeightMg, lessWeightMg = 0, purity, ratePerGramPaise, deductionBps = 0 }) {
  const netWeightMg = Math.max(0, grossWeightMg - lessWeightMg);
  const grossValuePaise = roundHalfAwayFromZero((netWeightMg * ratePerGramPaise) / 1000);
  const deductionPaise = applyBps(grossValuePaise, deductionBps);
  return { netWeightMg, fineWeightMg: fineWeightMg(netWeightMg, purity), grossValuePaise, deductionPaise, valuePaise: grossValuePaise - deductionPaise };
}
