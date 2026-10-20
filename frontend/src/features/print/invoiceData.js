import { formatINR, formatWeight, rupeesInWords, STONE_TYPES, stateName } from '@jerp/shared';
import { formatDateTime } from '../../utils/format.js';
import { paymentLabel } from '../orders/orderUi.jsx';
import { purityLabel } from '../products/productForm.js';
import { billLabels } from '../sales/billLabels.js';

export const fullAddress = (a) => (a ? [a.line1, a.line2, a.city, stateName(a.stateCode), a.pincode].filter(Boolean).join(', ') : '');

// Table cells: the ₹ sign is in the column heading, so A4 tables stay narrow.
const plain = (paise, decimals = 2) => formatINR(paise, { decimals, symbol: false });

const stoneLabel = (type) => STONE_TYPES.find((t) => t.value === type)?.label ?? type;
const stoneWeight = (s) => (s.weightUnit === 'ct' ? `${(s.weight / 1000).toFixed(3)} ct` : formatWeight(s.weight));

/**
 * Everything a printed invoice shows, worked out once from the bill so every design prints the same numbers:
 * items with their metal / making / stone break-up, the totals column, payments and what is still due.
 */
export function invoiceData(sale) {
  const { totals } = sale;
  const labels = billLabels(totals);
  const paidNow = sale.payments.filter((p) => p.mode !== 'credit').reduce((s, p) => s + p.amountPaise, 0);
  const duePaise = sale.duePaise ?? 0;
  const collectedLater = sale.collectedLaterPaise ?? 0;
  const advances = (sale.advanceAdjustedPaise ?? 0) + (sale.customerAdvancePaise ?? 0) + (sale.oldGoldPaise ?? 0);
  const oldGoldNet = (sale.oldGold?.lines ?? []).reduce((s, l) => s + l.netWeightMg, 0);

  const items = sale.items.map((i, n) => {
    const b = i.breakdown;
    return {
      n: n + 1,
      name: i.name,
      sku: i.sku,
      purity: purityLabel(i.metal, i.purity),
      huid: i.huid,
      hsn: i.hsnCode,
      returned: Boolean(i.returned),
      gross: formatWeight(i.grossWeightMg),
      stoneWt: i.stoneWeightMg ? formatWeight(i.stoneWeightMg) : null,
      net: formatWeight(i.netWeightMg),
      rate: b.ratePerGramPaise != null ? formatINR(b.ratePerGramPaise, { decimals: 0 }) : 'Fixed',
      metal: formatINR(b.metalPaise + b.wastagePaise),
      making: b.makingPaise ? formatINR(b.makingPaise) : '—',
      stone: b.stonePaise ? formatINR(b.stonePaise) : '—',
      other: b.otherPaise ? formatINR(b.otherPaise) : null,
      discount: b.discountPaise ? formatINR(b.discountPaise) : null,
      taxable: formatINR(b.taxablePaise),
      cells: {
        rate: b.ratePerGramPaise != null ? plain(b.ratePerGramPaise, 0) : 'Fixed',
        metal: plain(b.metalPaise + b.wastagePaise),
        making: b.makingPaise ? plain(b.makingPaise) : '—',
        stone: b.stonePaise ? plain(b.stonePaise) : '—',
        taxable: plain(b.taxablePaise),
      },
      stones: (i.pricingInputs?.stones ?? []).map((s) => ({
        label: stoneLabel(s.type),
        weight: stoneWeight(s),
        rate: s.ratePaise ? `${formatINR(s.ratePaise, { decimals: 0 })}/${s.weightUnit === 'ct' ? 'ct' : 'g'}` : null,
      })),
    };
  });

  const tax = sale.interState
    ? [{ label: labels.igst, value: formatINR(totals.igstPaise) }]
    : [
        { label: labels.cgst, value: formatINR(totals.cgstPaise) },
        { label: labels.sgst, value: formatINR(totals.sgstPaise) },
      ];

  const summary = [
    totals.discountPaise > 0 && { label: labels.discount, value: `− ${formatINR(totals.discountPaise)}` },
    { label: 'Taxable value', value: formatINR(totals.taxablePaise) },
    ...tax,
    totals.roundOffPaise !== 0 && { label: 'Round off', value: formatINR(totals.roundOffPaise) },
  ].filter(Boolean);

  const settlement = [
    sale.advanceAdjustedPaise > 0 && { label: 'Order advance', value: formatINR(sale.advanceAdjustedPaise) },
    sale.customerAdvancePaise > 0 && { label: 'Advance paid earlier', value: formatINR(sale.customerAdvancePaise) },
    sale.oldGoldPaise > 0 && { label: `Old gold ${sale.oldGold.docNo} (${formatWeight(oldGoldNet)} net)`, value: formatINR(sale.oldGoldPaise) },
    { label: advances > 0 ? 'Paid now' : 'Paid', value: formatINR(paidNow) },
    collectedLater > 0 && { label: 'Collected later', value: formatINR(collectedLater) },
  ].filter(Boolean);

  // Today's rate for each metal and purity on the bill.
  const rates = [];
  for (const i of sale.items) {
    const rate = i.breakdown.ratePerGramPaise;
    const label = `${i.metal ? i.metal[0].toUpperCase() + i.metal.slice(1) : ''} ${purityLabel(i.metal, i.purity)}`.trim();
    if (rate != null && !rates.some((r) => r.label === label)) rates.push({ label, value: `${formatINR(rate, { decimals: 0 })}/g` });
  }

  return {
    seller: { ...sale.seller, fullAddress: fullAddress(sale.seller.address) },
    customer: sale.customer && { ...sale.customer, fullAddress: fullAddress(sale.customer.address) },
    invoiceNo: sale.invoiceNo,
    date: formatDateTime(sale.createdAt),
    cancelled: sale.status === 'cancelled',
    orderNo: sale.order?.orderNo ?? null,
    placeOfSupply: stateName(sale.placeOfSupply) || null,
    items,
    summary,
    grandTotal: formatINR(totals.grandTotalPaise),
    words: rupeesInWords(totals.grandTotalPaise),
    settlement,
    due: duePaise > 0 ? formatINR(duePaise) : null,
    payments: sale.payments.filter((p) => p.mode !== 'credit').map((p) => ({ label: paymentLabel(p.mode), value: formatINR(p.amountPaise), reference: p.reference })),
    rates,
    notes: sale.notes,
  };
}
