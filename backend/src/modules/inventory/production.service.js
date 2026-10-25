import { fineWeightMg } from '@jerp/shared';
import { productSchema } from '@jerp/shared/schemas';
import { withTransaction } from '../../config/db.js';
import { AUDIT_ACTIONS, recordAudit } from '../../core/audit/audit.service.js';
import { requireContext } from '../../core/context/requestContext.js';
import { PAYMENT_ACCOUNT } from '../../core/ledger/paymentAccounts.js';
import { postJournal } from '../../core/ledger/posting.service.js';
import { nextDocumentNo } from '../../core/numbering/numbering.service.js';
import { MetalStock } from '../../core/stock/metalStock.model.js';
import { moveMetal, moveProducts } from '../../core/stock/stockLedger.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { todayContext } from '../../utils/businessDate.js';
import { paginate } from '../../utils/pagination.js';
import { Item } from '../items/item.model.js';
import { itemsForPieces } from '../items/item.service.js';
import { insertPieces, preparePieces } from '../products/product.service.js';
import { accessibleBranchFilter, canSeeCost, nameMaps, oid, pick, requireBranch } from './inventory.helpers.js';
import { Production } from './production.model.js';

/*
 * Making jewellery from raw material. The metal used comes out of the branch's metal stock at its average cost (what
 * the pool holds ÷ its weight); the pieces made go into Products, ready to sell, carrying the metal's cost plus the
 * making charge, shared by weight. In the books the metal's value only moves inside stock, so nothing is posted for
 * it; a making charge paid now adds to stock against cash / bank. Raw metal and finished pieces never mix: the metal
 * stock holds metal by weight, Products hold pieces — only this step turns one into the other.
 */

const sum = (list, fn) => list.reduce((n, x) => n + (fn(x) ?? 0), 0);
const label = (l) => `${l.metal} ${l.purity} ${l.kind.replace('_', ' ')}`;

export async function createProduction({ branchId, metalUsed, pieces, makingPaise = 0, makingMode, note }) {
  const { userId } = requireContext();
  const branch = await requireBranch(branchId);
  const today = await todayContext();
  if (makingPaise > 0 && !makingMode) throw ApiError.badRequest('Choose how the making charge was paid', [{ path: 'makingMode', message: 'Select cash, bank or UPI' }], 'VALIDATION_ERROR');

  // The metal at this branch, and what each gram of it cost (average of everything that went into the pool).
  const pools = await MetalStock.find({ branchId: branch._id, $or: metalUsed.map((l) => ({ metal: l.metal, purity: l.purity, kind: l.kind })) }).lean();
  const poolOf = (l) => pools.find((p) => p.metal === l.metal && p.purity === l.purity && p.kind === l.kind);
  const used = metalUsed.map((l, i) => {
    const pool = poolOf(l);
    if (!pool || pool.grossMg < l.grossWeightMg) {
      throw ApiError.conflict(`Not enough ${label(l)} in stock — ${((pool?.grossMg ?? 0) / 1000).toFixed(3)} g available`, 'INSUFFICIENT_STOCK', [{ path: `metalUsed.${i}.grossWeightMg`, message: 'More than in stock' }]);
    }
    const valuePaise = pool.grossMg > 0 ? Math.round((pool.valuePaise * l.grossWeightMg) / pool.grossMg) : 0;
    return { ...l, fineWeightMg: fineWeightMg(l.grossWeightMg, l.purity), valuePaise };
  });

  // The pieces made, from saved items (name, category, metal, purity, wastage, making), each with its weight and HUID.
  const catalogue = await itemsForPieces(pieces.map((p) => p.itemId));
  const metals = new Set(used.map((l) => l.metal));
  pieces.forEach((p, i) => {
    const item = catalogue.get(String(p.itemId));
    if (!metals.has(item.metal)) throw ApiError.badRequest(`${item.name} is ${item.metal}, but no ${item.metal} is used`, [{ path: `pieces.${i}.itemId`, message: `Add the ${item.metal} used` }], 'VALIDATION_ERROR');
  });

  // Pieces are made only from the metal given (this form has no stones), so together they cannot weigh more than it.
  const usedMg = sum(used, (l) => l.grossWeightMg);
  if (sum(pieces, (p) => p.grossWeightMg) > usedMg) {
    throw ApiError.badRequest(`The jewellery made weighs more than the metal given (${(usedMg / 1000).toFixed(3)} g)`, [{ path: 'pieces', message: 'More than the metal given' }], 'VALIDATION_ERROR');
  }

  const metalValuePaise = sum(used, (l) => l.valuePaise);
  const totalCostPaise = metalValuePaise + makingPaise;
  const totalWeight = sum(pieces, (p) => p.grossWeightMg);
  // Cost shared by weight; whatever paisa is left over from rounding goes on the heaviest piece.
  const shares = pieces.map((p) => Math.floor((totalCostPaise * p.grossWeightMg) / totalWeight));
  const heaviest = pieces.reduce((best, p, i) => (p.grossWeightMg > pieces[best].grossWeightMg ? i : best), 0);
  shares[heaviest] += totalCostPaise - sum(shares, (s) => s);

  const inputs = pieces.map((p, i) => {
    const item = catalogue.get(String(p.itemId));
    const parsed = productSchema.safeParse({
      name: item.name,
      categoryId: String(item.categoryId),
      jewelleryType: item.jewelleryType,
      metal: item.metal,
      purity: item.purity,
      grossWeightMg: p.grossWeightMg,
      wastage: item.wastage,
      making: item.making,
      ...(item.hsnCode && { hsnCode: item.hsnCode }),
      ...(p.huid && { huid: p.huid.toUpperCase() }),
      costPricePaise: shares[i],
      branchId: String(branch._id),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw ApiError.badRequest(`${item.name}: ${issue.message}`, [{ path: `pieces.${i}.${issue.path.join('.')}`, message: issue.message }], 'VALIDATION_ERROR');
    }
    return parsed.data;
  });
  const prepared = await preparePieces(inputs);

  const doc = await withTransaction(async (session) => {
    const productionNo = await nextDocumentNo({ prefix: 'MFG', branchCode: branch.code, financialYear: today.financialYear }, { session });
    const created = await insertPieces(prepared, { session });
    const [entry] = await Production.create(
      [
        {
          productionNo,
          branchId: branch._id,
          businessDate: today.businessDate,
          metalUsed: used,
          pieces: created.map((p) => ({ productId: p._id, sku: p.sku, name: p.name, metal: p.metal, purity: p.purity, grossWeightMg: p.grossWeightMg, fineWeightMg: p.fineWeightMg, costPaise: p.costPricePaise })),
          metalValuePaise,
          makingPaise,
          makingMode: makingPaise > 0 ? makingMode : null,
          totalCostPaise,
          note: note ?? null,
          createdBy: userId,
        },
      ],
      { session },
    );
    const source = { docType: 'production', docId: entry._id, docNo: productionNo };
    for (const l of used) await moveMetal({ type: 'production_use', branchId: branch._id, line: { ...l, direction: 'out' }, source, businessDate: today.businessDate, note: `Made into ${created.length} piece${created.length === 1 ? '' : 's'}` }, { session });
    await moveProducts({ type: 'production', productIds: created.map((p) => p._id), branchId: branch._id, expectedBranchId: branch._id, source, businessDate: today.businessDate, note: `Made from metal stock (${productionNo})` }, { session });
    for (const p of pieces) await Item.updateOne({ _id: p.itemId }, { $inc: { usedCount: 1 } }, { session });
    if (makingPaise > 0) {
      await postJournal(
        {
          voucherType: 'production',
          date: today.now,
          businessDate: today.businessDate,
          financialYear: today.financialYear,
          narration: `Making charge for ${productionNo}`,
          source,
          lines: [
            { account: 'inventory', debit: makingPaise, branchId: branch._id },
            { account: PAYMENT_ACCOUNT[makingMode], credit: makingPaise, branchId: branch._id },
          ],
        },
        { session },
      );
    }
    await recordAudit({ action: AUDIT_ACTIONS.CREATE, module: 'inventory', recordType: 'Production', recordId: entry._id, meta: { name: productionNo, pieces: created.length, metalValuePaise, makingPaise } }, { session });
    return entry;
  });
  return getProduction(doc._id);
}

function serialize(d, maps, cost) {
  return {
    id: d._id,
    productionNo: d.productionNo,
    branch: pick(maps.branches, d.branchId) ?? { id: d.branchId },
    businessDate: d.businessDate,
    metalUsed: d.metalUsed.map((l) => ({ metal: l.metal, purity: l.purity, kind: l.kind, grossWeightMg: l.grossWeightMg, fineWeightMg: l.fineWeightMg, ...(cost && { valuePaise: l.valuePaise }) })),
    pieces: d.pieces.map((p) => ({ productId: p.productId, sku: p.sku, name: p.name, metal: p.metal, purity: p.purity, grossWeightMg: p.grossWeightMg, ...(cost && { costPaise: p.costPaise }) })),
    ...(cost && { metalValuePaise: d.metalValuePaise, makingPaise: d.makingPaise, totalCostPaise: d.totalCostPaise }),
    makingMode: d.makingMode,
    note: d.note,
    createdBy: pick(maps.users, d.createdBy) ?? null,
    createdAt: d.createdAt,
  };
}

export async function getProduction(id) {
  const d = await Production.findOne({ _id: id, ...accessibleBranchFilter() }).lean();
  if (!d) throw ApiError.notFound('Production');
  return serialize(d, await nameMaps({ branchIds: [d.branchId], userIds: [d.createdBy] }), canSeeCost());
}

export async function listProductions({ page, limit, branchId }) {
  const filter = { ...accessibleBranchFilter(), ...(branchId && { branchId: oid(branchId) }) };
  const { items, meta } = await paginate(Production.find(filter).sort({ createdAt: -1 }), Production.countDocuments(filter), { page, limit });
  const maps = await nameMaps({ branchIds: items.map((d) => d.branchId), userIds: items.map((d) => d.createdBy) });
  const cost = canSeeCost();
  return { items: items.map((d) => serialize(d, maps, cost)), meta };
}
