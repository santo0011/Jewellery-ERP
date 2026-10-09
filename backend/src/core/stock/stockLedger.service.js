import { fineWeightMg } from '@jerp/shared';
import { Product } from '../../modules/products/product.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { requireContext } from '../context/requestContext.js';
import { MetalStock } from './metalStock.model.js';
import { StockMovement } from './stockMovement.model.js';

/**
 * The only code path allowed to change product stock status or metal pool balances.
 * Every call writes an immutable StockMovement in the same session.
 */

const PRODUCT_TRANSITIONS = {
  opening: { from: ['draft'], to: 'in_stock', direction: 1 },
  purchase: { from: ['draft'], to: 'in_stock', direction: 1 },
  adjustment_out: { from: ['in_stock'], direction: -1 },
  transfer_out: { from: ['in_stock'], to: 'in_transit', direction: -1 },
  transfer_in: { from: ['in_transit'], to: 'in_stock', direction: 1 },
  transfer_return: { from: ['in_transit'], to: 'in_stock', direction: 1 },
  sale: { from: ['in_stock'], to: 'sold', direction: -1 },
  sale_cancel: { from: ['sold'], to: 'in_stock', direction: 1 },
  sales_return: { from: ['sold'], to: 'in_stock', direction: 1 },
};

const productValue = (p) => p.costPricePaise ?? 0;

export async function moveProducts({ type, productIds, branchId, expectedBranchId, toStatus, source, businessDate, note }, { session }) {
  const rule = PRODUCT_TRANSITIONS[type];
  if (!rule) throw new Error(`Unknown product movement ${type}`);
  const target = toStatus ?? rule.to;
  const { userId } = requireContext();

  const products = await Product.find({ _id: { $in: productIds }, isDeleted: false }).session(session).lean();
  if (products.length !== productIds.length) throw ApiError.badRequest('One or more products were not found', [{ path: 'productIds', message: 'Unknown product' }], 'VALIDATION_ERROR');

  const movements = [];
  for (const p of products) {
    if (!rule.from.includes(p.status)) {
      throw ApiError.conflict(`${p.sku} is ${p.status.replace('_', ' ')} and cannot be moved this way`, 'INVALID_STOCK_STATE', [{ path: 'productIds', message: `${p.sku}: ${p.status}` }]);
    }
    if (expectedBranchId && String(p.branchId) !== String(expectedBranchId)) {
      throw ApiError.conflict(`${p.sku} belongs to another branch`, 'WRONG_BRANCH', [{ path: 'productIds', message: `${p.sku} is at another branch` }]);
    }
    const update = { status: target, updatedBy: userId, ...(rule.direction === 1 && { branchId }) };
    const res = await Product.updateOne({ _id: p._id, status: p.status }, { $set: update }, { session });
    if (res.modifiedCount !== 1) throw ApiError.conflict(`${p.sku} was changed by someone else. Try again.`, 'CONCURRENT_UPDATE');

    movements.push({
      type,
      direction: rule.direction,
      productId: p._id,
      branchId: rule.direction === 1 ? branchId : p.branchId,
      metal: p.metal,
      purity: p.purity,
      qty: p.quantity,
      grossMg: p.grossWeightMg,
      netMg: p.netWeightMg,
      fineMg: p.fineWeightMg,
      valuePaise: productValue(p),
      statusBefore: p.status,
      statusAfter: target,
      source,
      businessDate,
      note: note ?? null,
      createdBy: userId,
    });
  }
  await StockMovement.create(movements, { session, ordered: true });
  return { products, totalValuePaise: movements.reduce((s, m) => s + m.valuePaise, 0) };
}

export async function moveMetal({ type, branchId, line, source, businessDate, note, allowNegative = false }, { session }) {
  const { userId } = requireContext();
  const direction = line.direction === 'out' ? -1 : 1;
  const fine = fineWeightMg(line.grossWeightMg, line.purity);
  const key = { branchId, metal: line.metal, purity: line.purity, kind: line.kind };

  let pool;
  if (direction === 1) {
    pool = await MetalStock.findOneAndUpdate(key, { $inc: { grossMg: line.grossWeightMg, fineMg: fine, valuePaise: line.valuePaise ?? 0 } }, { upsert: true, returnDocument: 'after', session });
  } else {
    const guard = allowNegative ? {} : { grossMg: { $gte: line.grossWeightMg } };
    pool = await MetalStock.findOneAndUpdate({ ...key, ...guard }, { $inc: { grossMg: -line.grossWeightMg, fineMg: -fine, valuePaise: -(line.valuePaise ?? 0) } }, { returnDocument: 'after', session, upsert: allowNegative });
    if (!pool) {
      throw ApiError.conflict(`Not enough ${line.metal} (${line.purity}) ${line.kind.replace('_', ' ')} at this branch`, 'INSUFFICIENT_STOCK', [{ path: 'metalLines', message: 'Insufficient metal' }]);
    }
  }

  await StockMovement.create(
    [
      {
        type,
        direction,
        metalStockId: pool._id,
        branchId,
        metal: line.metal,
        purity: line.purity,
        kind: line.kind,
        qty: 0,
        grossMg: line.grossWeightMg,
        netMg: line.grossWeightMg,
        fineMg: fine,
        valuePaise: line.valuePaise ?? 0,
        source,
        businessDate,
        note: note ?? null,
        createdBy: userId,
      },
    ],
    { session },
  );
  return { valuePaise: line.valuePaise ?? 0, fineMg: fine };
}
