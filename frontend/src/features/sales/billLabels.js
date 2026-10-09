/** "1.5%", "0.25%" — share of `base`; the rate is read off the bill itself, so it is right even with mixed GST rates. */
export function percentOf(part, base) {
  if (!part || !base) return null;
  const pct = (part / base) * 100;
  return pct < 0.01 ? '<0.01%' : `${Number(pct.toFixed(2))}%`;
}

const withPct = (label, part, base) => {
  const pct = percentOf(part, base);
  return pct ? `${label} (${pct})` : label;
};

/** Labels for the totals block: discount against the value before discount, taxes against the taxable value. */
export const billLabels = (totals) => ({
  discount: withPct('Discount', totals.discountPaise, totals.subtotalPaise),
  cgst: withPct('CGST', totals.cgstPaise, totals.taxablePaise),
  sgst: withPct('SGST', totals.sgstPaise, totals.taxablePaise),
  igst: withPct('IGST', totals.igstPaise, totals.taxablePaise),
});
