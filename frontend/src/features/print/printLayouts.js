import { PRINT_DESIGNS } from '@jerp/shared';
import { t } from '../../i18n/index.js';

/**
 * Paper sizes an invoice prints on. `widthMm` is the width the invoice is laid out at: the paper less the page margin
 * (`marginMm`, set by @page). `base` is the body font size in pt that the design scales from.
 */
export const PRINT_SIZES = {
  a4: { label: t('A4'), caption: t('210 × 297 mm · laser / inkjet'), widthMm: 186, marginMm: 12, page: 'A4', base: 9.5 },
  thermal80: { label: t('80 mm thermal'), caption: t('3-inch receipt roll'), widthMm: 72, marginMm: 4, page: '80mm auto', base: 8.5 },
  thermal58: { label: t('58 mm thermal'), caption: t('2-inch receipt roll'), widthMm: 48, marginMm: 5, page: '58mm auto', base: 7.5 },
};

export const DESIGN_INFO = {
  a4: {
    classic: { label: t('Classic'), description: t('Balanced tax invoice with a gold accent line. Suits every store.') },
    royal: { label: t('Royal'), description: t('Double gold border, serif lettering and a crest-style header.') },
    modern: { label: t('Modern'), description: t('Clean and minimal, with a solid header band and bold totals.') },
  },
  thermal80: {
    standard: { label: t('Standard'), description: t('Items, weights and totals in a clear receipt.') },
    detailed: { label: t('Detailed'), description: t('Adds the metal, making and stone break-up for every item.') },
  },
  thermal58: {
    standard: { label: t('Standard'), description: t('Name, weight and amount for each item, with full totals.') },
    compact: { label: t('Compact'), description: t('One line per item — the shortest receipt.') },
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
