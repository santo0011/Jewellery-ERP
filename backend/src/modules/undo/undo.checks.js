import { MetalStock } from '../../core/stock/metalStock.model.js';
import { Product } from '../products/product.model.js';

/* Dependency checks shared by reversals: is the stock an entry brought in still here to take out again? */

const grams = (mg) => `${(mg / 1000).toFixed(3)} g`;

/**
 * Is there enough raw metal at a branch to take these lines out again? [{ metal, purity, kind, grossWeightMg }] →
 * a reason when short (the metal was used or moved since), else null.
 */
export async function metalShortfall(branchId, lines) {
  const need = new Map();
  for (const l of lines) {
    const key = `${l.metal}|${l.purity}|${l.kind}`;
    need.set(key, (need.get(key) ?? 0) + l.grossWeightMg);
  }
  for (const [key, mg] of need) {
    const [metal, purity, kind] = key.split('|');
    const pool = await MetalStock.findOne({ branchId, metal, purity: Number(purity), kind }).select('grossMg').lean();
    if ((pool?.grossMg ?? 0) < mg) return `Only ${grams(pool?.grossMg ?? 0)} of ${metal} ${purity} ${kind.replace('_', ' ')} is left (${grams(mg)} needed) — it has been used or moved since.`;
  }
  return null;
}

/** Pieces that are no longer in stock at a branch (sold, moved, …): a reason naming them, else null. */
export async function piecesGone(productIds, branchId, status = 'in_stock') {
  const gone = await Product.find({ _id: { $in: productIds }, $or: [{ status: { $ne: status } }, { branchId: { $ne: branchId } }, { isDeleted: true }] }).select('sku status').lean();
  return gone.length ? `${gone.map((p) => `${p.sku} (${p.status.replace('_', ' ')})`).slice(0, 5).join(', ')}${gone.length > 5 ? '…' : ''} ${gone.length === 1 ? 'is' : 'are'} no longer in stock here.` : null;
}
