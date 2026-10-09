import { Counter } from './counter.model.js';

export async function nextSequence(key, { session } = {}) {
  const counter = await Counter.findOneAndUpdate({ key }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after', session });
  return counter.seq;
}

export const formatCode = (prefix, seq, width) => `${prefix}${String(seq).padStart(width, '0')}`;

export const nextCode = async (key, prefix, width, options) => formatCode(prefix, await nextSequence(key, options), width);

export async function nextDocumentNo({ prefix, branchCode, financialYear }, options) {
  const seq = await nextSequence(`${prefix}:${branchCode}:${financialYear}`, options);
  return `${prefix}/${branchCode}/${financialYear}/${String(seq).padStart(4, '0')}`;
}
