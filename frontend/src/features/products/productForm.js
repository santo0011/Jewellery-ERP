import { decimalToScaledInt, fromBps, fromMg, fromPaise, PURITIES, toBps, toMg, toPaise } from '@jerp/shared';

export class FieldError extends Error {
  constructor(path, message = 'Enter a valid number') {
    super(message);
    this.path = path;
  }
}

const parse = (fn, path, value, { required = false } = {}) => {
  if (value === '' || value === null || value === undefined) {
    if (required) throw new FieldError(path, 'Required');
    return null;
  }
  try {
    const out = fn(value);
    if (out === null || out < 0) throw new FieldError(path);
    return out;
  } catch (err) {
    if (err instanceof FieldError) throw err;
    throw new FieldError(path);
  }
};

const str = (v) => (v === null || v === undefined ? '' : String(v));

export const purityLabel = (metal, fineness) => PURITIES[metal]?.find((p) => p.fineness === fineness)?.label ?? String(fineness);

const wastageToForm = ({ mode, value }) => (mode === 'percent' ? str(fromBps(value)) : mode === 'weight' ? str(fromMg(value)) : '');
const makingToForm = ({ type, value }) => (type === 'percent' ? str(fromBps(value)) : str(fromPaise(value)));

export function emptyProduct({ catalog, branchId }) {
  return {
    name: '',
    categoryId: '',
    subcategoryId: '',
    jewelleryType: 'plain_gold',
    metal: 'gold',
    purity: catalog.enabledPurities.gold[0] ?? '',
    stockType: 'tagged',
    quantity: '1',
    grossWeightMg: '',
    stones: [],
    wastage: { mode: catalog.defaultWastageMode, value: '' },
    making: { type: catalog.defaultMakingChargeType, value: '' },
    otherChargePaise: '',
    hsnCode: '',
    costPricePaise: '',
    pricingMode: 'rate_based',
    fixedPricePaise: '',
    huid: '',
    hallmarkCentre: '',
    hallmarkDate: '',
    certificateNo: '',
    supplierId: '',
    branchId: branchId ?? '',
    description: '',
    tags: [],
  };
}

export function productToForm(p) {
  return {
    name: p.name,
    categoryId: str(p.category?.id),
    subcategoryId: str(p.subcategory?.id),
    jewelleryType: p.jewelleryType,
    metal: p.metal,
    purity: p.purity,
    stockType: p.stockType,
    quantity: str(p.quantity),
    grossWeightMg: str(fromMg(p.grossWeightMg)),
    stones: p.stones.map((s) => ({ type: s.type, name: str(s.name), count: str(s.count), weight: str(s.weight / 1000), weightUnit: s.weightUnit, ratePaise: s.ratePaise ? str(fromPaise(s.ratePaise)) : '' })),
    wastage: { mode: p.wastage.mode, value: wastageToForm(p.wastage) },
    making: { type: p.making.type, value: makingToForm(p.making) },
    otherChargePaise: p.otherChargePaise ? str(fromPaise(p.otherChargePaise)) : '',
    hsnCode: str(p.hsnCode),
    costPricePaise: p.costPricePaise ? str(fromPaise(p.costPricePaise)) : '',
    pricingMode: p.pricingMode,
    fixedPricePaise: p.fixedPricePaise ? str(fromPaise(p.fixedPricePaise)) : '',
    huid: str(p.huid),
    hallmarkCentre: str(p.hallmarkCentre),
    hallmarkDate: str(p.hallmarkDate),
    certificateNo: str(p.certificateNo),
    supplierId: str(p.supplier?.id),
    branchId: str(p.branch?.id),
    description: str(p.description),
    tags: p.tags,
  };
}

export function formToProduct(v, { includeCost }) {
  const wastageValue = v.wastage.mode === 'percent' ? parse(toBps, 'wastage.value', v.wastage.value, { required: true }) : v.wastage.mode === 'weight' ? parse(toMg, 'wastage.value', v.wastage.value, { required: true }) : 0;
  const makingValue = v.making.type === 'percent' ? parse(toBps, 'making.value', v.making.value, { required: true }) : parse(toPaise, 'making.value', v.making.value, { required: true });

  const payload = {
    name: v.name,
    categoryId: v.categoryId,
    subcategoryId: v.subcategoryId || null,
    jewelleryType: v.jewelleryType,
    metal: v.metal,
    purity: Number(v.purity),
    stockType: v.stockType,
    quantity: v.stockType === 'tagged' ? 1 : parse(Number, 'quantity', v.quantity, { required: true }),
    grossWeightMg: parse(toMg, 'grossWeightMg', v.grossWeightMg, { required: true }),
    stones: v.stones.map((s, i) => ({
      type: s.type,
      name: s.name || null,
      count: parse(Number, `stones.${i}.count`, s.count, { required: true }),
      weight: parse((x) => decimalToScaledInt(x, 3), `stones.${i}.weight`, s.weight, { required: true }),
      weightUnit: s.weightUnit,
      ratePaise: parse(toPaise, `stones.${i}.ratePaise`, s.ratePaise) ?? 0,
    })),
    wastage: { mode: v.wastage.mode, value: wastageValue },
    making: { type: v.making.type, value: makingValue },
    otherChargePaise: parse(toPaise, 'otherChargePaise', v.otherChargePaise) ?? 0,
    hsnCode: v.hsnCode || null,
    pricingMode: v.pricingMode,
    fixedPricePaise: v.pricingMode === 'fixed' ? parse(toPaise, 'fixedPricePaise', v.fixedPricePaise, { required: true }) : null,
    huid: v.huid || null,
    hallmarkCentre: v.hallmarkCentre || null,
    hallmarkDate: v.hallmarkDate || null,
    certificateNo: v.certificateNo || null,
    supplierId: v.supplierId || null,
    branchId: v.branchId,
    description: v.description || null,
    tags: v.tags,
  };
  if (includeCost) payload.costPricePaise = parse(toPaise, 'costPricePaise', v.costPricePaise);
  return payload;
}

export function safeWeights(v) {
  try {
    return {
      grossWeightMg: toMg(v.grossWeightMg || '0') ?? 0,
      purity: Number(v.purity) || 0,
      stones: (v.stones ?? []).map((s) => ({ weight: decimalToScaledInt(s.weight || '0', 3) ?? 0, weightUnit: s.weightUnit })),
    };
  } catch {
    return null;
  }
}
