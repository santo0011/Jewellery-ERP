export const roundHalfAwayFromZero = (n) => (n < 0 ? -Math.round(-n) : Math.round(n));

export function decimalToScaledInt(value, scale) {
  if (value === null || value === undefined || value === '') return null;
  const str = typeof value === 'number' ? numberToPlainString(value) : String(value).trim().replace(/,/g, '');
  const match = /^([+-])?(\d*)(?:\.(\d*))?$/.exec(str);
  if (!match || (match[2] === '' && (match[3] ?? '') === '')) throw new RangeError(`Invalid decimal value: ${value}`);
  const [, sign, intPart, fracPart = ''] = match;
  const padded = (fracPart + '0'.repeat(scale + 1)).slice(0, scale + 1);
  let scaled = Number(BigInt((intPart || '0') + padded.slice(0, scale)));
  if (Number(padded[scale]) >= 5) scaled += 1;
  if (!Number.isSafeInteger(scaled)) throw new RangeError(`Value out of range: ${value}`);
  return sign === '-' && scaled !== 0 ? -scaled : scaled;
}

function numberToPlainString(n) {
  if (!Number.isFinite(n)) throw new RangeError(`Invalid number: ${n}`);
  const s = String(n);
  if (!/e/i.test(s)) return s;
  return n.toFixed(20).replace(/\.?0+$/, '');
}

export const scaledIntToNumber = (int, scale) => (int === null || int === undefined ? null : int / 10 ** scale);

export const toPaise = (rupees) => decimalToScaledInt(rupees, 2);
export const fromPaise = (paise) => scaledIntToNumber(paise, 2);

export const toMg = (grams) => decimalToScaledInt(grams, 3);
export const fromMg = (mg) => scaledIntToNumber(mg, 3);

export const toMilliCarat = (carats) => decimalToScaledInt(carats, 3);
export const fromMilliCarat = (mct) => scaledIntToNumber(mct, 3);

export const toBps = (percent) => decimalToScaledInt(percent, 2);
export const fromBps = (bps) => scaledIntToNumber(bps, 2);

export const applyBps = (amount, bps) => roundHalfAwayFromZero((amount * bps) / 10000);

export const fineWeightMg = (netMg, fineness) => roundHalfAwayFromZero((netMg * fineness) / 1000);

const inrFormatters = new Map();
export function formatINR(paise, { decimals = 2, symbol = true } = {}) {
  if (paise === null || paise === undefined) return '—';
  const key = `${decimals}:${symbol}`;
  if (!inrFormatters.has(key)) {
    inrFormatters.set(
      key,
      new Intl.NumberFormat('en-IN', {
        style: symbol ? 'currency' : 'decimal',
        currency: 'INR',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }),
    );
  }
  return inrFormatters.get(key).format(paise / 100);
}

export function formatWeight(mg, { decimals = 3, unit = 'g' } = {}) {
  if (mg === null || mg === undefined) return '—';
  return `${(mg / 1000).toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} ${unit}`;
}

export function formatPercent(bps, { decimals = 2 } = {}) {
  if (bps === null || bps === undefined) return '—';
  return `${(bps / 100).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: decimals })}%`;
}
