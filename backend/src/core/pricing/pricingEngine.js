import { applyBps, roundHalfAwayFromZero } from '@jerp/shared';

/**
 * Pure jewellery pricing. All money in paise, weights in mg (stones: mct or mg), rates in paise/gram, percentages in bps.
 *
 * metal    = net weight × rate
 * wastage  = wastage weight × rate        (wastage weight: % of net, or fixed mg)
 * making   = per gram × net | % of metal value | fixed × pieces
 * stones   = Σ weight × stone rate        (rate per carat or per gram)
 * subtotal = metal + wastage + making + stones + other       (or the fixed price for fixed-price items)
 * discount is applied to making first, then to the rest
 * GST      = jewellery rate on the goods part (+ separate rate on making when configured)
 */

const valueOfWeight = (weightThousandths, ratePerUnit) => roundHalfAwayFromZero((weightThousandths * ratePerUnit) / 1000);

export function priceLine(item, { ratePerGramPaise, tax }) {
  const qty = item.stockType === 'lot' ? item.quantity : 1;
  const discountPaise = item.discountPaise ?? 0;

  let metalPaise = 0;
  let wastageMg = 0;
  let wastagePaise = 0;
  let makingPaise = 0;
  let stonePaise = 0;
  const otherPaise = item.otherChargePaise ?? 0;

  if (item.pricingMode === 'fixed') {
    if (!item.fixedPricePaise) throw new Error('Fixed price missing');
  } else {
    if (!ratePerGramPaise) throw new Error('Rate missing');
    metalPaise = valueOfWeight(item.netWeightMg, ratePerGramPaise);
    if (item.wastage.mode === 'percent') wastageMg = applyBps(item.netWeightMg, item.wastage.value);
    else if (item.wastage.mode === 'weight') wastageMg = item.wastage.value;
    wastagePaise = valueOfWeight(wastageMg, ratePerGramPaise);

    if (item.making.type === 'per_gram') makingPaise = valueOfWeight(item.netWeightMg, item.making.value);
    else if (item.making.type === 'percent') makingPaise = applyBps(metalPaise, item.making.value);
    else makingPaise = item.making.value * qty;

    stonePaise = (item.stones ?? []).reduce((sum, s) => sum + valueOfWeight(s.weight, s.ratePaise ?? 0), 0);
  }

  const subtotalPaise = item.pricingMode === 'fixed' ? item.fixedPricePaise : metalPaise + wastagePaise + makingPaise + stonePaise + otherPaise;
  if (discountPaise > subtotalPaise) throw new RangeError('Discount exceeds the item value');

  const makingDiscount = Math.min(discountPaise, makingPaise);
  const makingTaxable = makingPaise - makingDiscount;
  const taxablePaise = subtotalPaise - discountPaise;
  const goodsTaxable = taxablePaise - makingTaxable;

  let gstPaise = 0;
  if (tax.gstEnabled) {
    gstPaise = tax.separateMakingGst
      ? applyBps(goodsTaxable, tax.jewelleryGstBps) + applyBps(makingTaxable, tax.makingGstBps)
      : applyBps(taxablePaise, tax.jewelleryGstBps);
  }

  return {
    ratePerGramPaise: item.pricingMode === 'fixed' ? null : ratePerGramPaise,
    wastageMg,
    metalPaise,
    wastagePaise,
    makingPaise,
    stonePaise,
    otherPaise: item.pricingMode === 'fixed' ? 0 : otherPaise,
    subtotalPaise,
    discountPaise,
    taxablePaise,
    gstPaise,
    totalPaise: taxablePaise + gstPaise,
  };
}

const ROUNDING = { none: 1, nearest_rupee: 100, nearest_ten: 1000 };

export function priceInvoice(lines, { interState, roundOff }) {
  const sum = (key) => lines.reduce((s, l) => s + l[key], 0);
  const subtotalPaise = sum('subtotalPaise');
  const discountPaise = sum('discountPaise');
  const taxablePaise = sum('taxablePaise');
  const gstPaise = sum('gstPaise');
  const beforeRound = taxablePaise + gstPaise;
  const unit = ROUNDING[roundOff] ?? 1;
  const grandTotalPaise = roundHalfAwayFromZero(beforeRound / unit) * unit;
  const cgstPaise = interState ? 0 : Math.floor(gstPaise / 2);
  return {
    subtotalPaise,
    discountPaise,
    taxablePaise,
    cgstPaise,
    sgstPaise: interState ? 0 : gstPaise - cgstPaise,
    igstPaise: interState ? gstPaise : 0,
    gstPaise,
    roundOffPaise: grandTotalPaise - beforeRound,
    grandTotalPaise,
  };
}
