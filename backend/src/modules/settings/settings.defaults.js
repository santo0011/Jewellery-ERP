import { PURITIES } from '@jerp/shared';

export const DEFAULT_SETTINGS = Object.freeze({
  invoice: {
    invoicePrefix: 'INV',
    estimatePrefix: 'EST',
    defaultFormat: 'a4',
    copies: 1,
    showHsn: true,
    showHuid: true,
    showWeightBreakup: true,
    showRateTable: true,
    signatoryLabel: 'Authorised Signatory',
    terms: 'Goods once sold will be exchanged as per store policy. Old gold is accepted at the prevailing rate after purity testing.',
    footerNote: 'Thank you for your purchase.',
  },
  tax: {
    gstEnabled: true,
    jewelleryGstBps: 300,
    separateMakingGst: false,
    makingGstBps: 500,
    hsnJewellery: '7113',
    hsnBullion: '7108',
    hsnSilverArticles: '7114',
    roundOff: 'nearest_rupee',
  },
  jewellery: {
    enabledPurities: {
      gold: [916, 750],
      silver: PURITIES.silver.map((p) => p.fineness),
      platinum: [],
    },
    defaultWastageMode: 'percent',
    defaultMakingChargeType: 'per_gram',
    huidMandatory: true,
    panRequiredAbovePaise: 20000000,
    cashLimitPaise: 19999900,
    cashLimitAction: 'block',
    allowNegativeStock: false,
  },
  barcode: {
    symbology: 'code128',
    skuPrefix: 'JW',
    labelWidthMm: 50,
    labelHeightMm: 25,
    showName: true,
    showWeight: true,
    showPurity: true,
    showPrice: false,
  },
  approvals: {
    stockAdjustments: true,
  },
});
