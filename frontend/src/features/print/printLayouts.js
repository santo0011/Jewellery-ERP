import { PRINT_DESIGNS } from '@jerp/shared';

/**
 * Paper sizes an invoice prints on. `widthMm` is the width the invoice is laid out at: the paper less the page margin
 * (`marginMm`, set by @page). `base` is the body font size in pt that the design scales from.
 */
export const PRINT_SIZES = {
  a4: { label: 'A4', caption: '210 × 297 mm · laser / inkjet', widthMm: 186, marginMm: 12, page: 'A4', base: 9.5 },
  thermal80: { label: '80 mm thermal', caption: '3-inch receipt roll', widthMm: 72, marginMm: 4, page: '80mm auto', base: 8.5 },
  thermal58: { label: '58 mm thermal', caption: '2-inch receipt roll', widthMm: 48, marginMm: 5, page: '58mm auto', base: 7.5 },
};

export const DESIGN_INFO = {
  a4: {
    classic: { label: 'Classic', description: 'Balanced tax invoice with a gold accent line. Suits every store.' },
    royal: { label: 'Royal', description: 'Double gold border, serif lettering and a crest-style header.' },
    modern: { label: 'Modern', description: 'Clean and minimal, with a solid header band and bold totals.' },
  },
  thermal80: {
    standard: { label: 'Standard', description: 'Items, weights and totals in a clear receipt.' },
    detailed: { label: 'Detailed', description: 'Adds the metal, making and stone break-up for every item.' },
  },
  thermal58: {
    standard: { label: 'Standard', description: 'Name, weight and amount for each item, with full totals.' },
    compact: { label: 'Compact', description: 'One line per item — the shortest receipt.' },
  },
};

export const designsFor = (size) => PRINT_DESIGNS[size].map((key) => ({ key, ...DESIGN_INFO[size][key] }));

export const layoutLabel = ({ size, design }) => `${PRINT_SIZES[size]?.label ?? size} · ${DESIGN_INFO[size]?.[design]?.label ?? design}`;

/** What a bill prints with when the server sent no layout (the defaults of Invoice and Print settings). */
export const DEFAULT_LAYOUT = {
  size: 'a4',
  design: 'classic',
  copies: 1,
  showHsn: true,
  showHuid: true,
  showWeightBreakup: true,
  showRateTable: true,
  signatoryLabel: 'Authorised Signatory',
  terms: '',
  footerNote: 'Thank you for your purchase.',
};
