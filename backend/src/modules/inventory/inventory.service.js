import { fineWeightMg, STOCK_DOC_STATUS } from '@jerp/shared';
import { withTransaction } from '../../config/db.js';
import { registerApprovalHandler, requestApproval } from '../../core/approvals/approval.service.js';
import { AUDIT_ACTIONS, recordAudit } from '../../core/audit/audit.service.js';
import { requireContext } from '../../core/context/requestContext.js';
import { postJournal, reverseJournalsFor } from '../../core/ledger/posting.service.js';
import { nextDocumentNo } from '../../core/numbering/numbering.service.js';
import { MetalStock } from '../../core/stock/metalStock.model.js';
import { moveMetal, moveProducts } from '../../core/stock/stockLedger.service.js';
import { StockMovement } from '../../core/stock/stockMovement.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { dayRange, todayContext } from '../../utils/businessDate.js';
import { searchFilter } from '../../utils/pagination.js';
import { Product } from '../products/product.model.js';
import { metalShortfall, piecesGone } from '../undo/undo.checks.js';
import { getSettings } from '../settings/settings.service.js';
import { accessibleBranchFilter, canSeeCost, nameMaps, oid, pick, requireBranch, viewBranchFor } from './inventory.helpers.js';
import { StockEntry } from './stockEntry.model.js';

const withFine = (lines) => lines.map((l) => ({ ...l, fineWeightMg: fineWeightMg(l.grossWeightMg, l.purity) }));

/**
 * Why each opening entry can no longer be edited (null = it can). Only gold-only opening entries can be, and only
 * while their gold is untouched: once anything has gone out of the metal they added to (made into jewellery,
 * transferred, adjusted, sold), stock and costs have been worked out from it, so it stays as it is.
 */
async function openingEditLocks(entries) {
  const locks = new Map();
  const open = [];
  for (const e of entries) {
    if (e.type !== 'opening') continue;
    if (e.status !== STOCK_DOC_STATUS.POSTED) locks.set(String(e._id), 'Only posted entries can be edited');
    else if (e.productIds.length) locks.set(String(e._id), 'This entry has pieces — only gold-only entries can be edited');
    else open.push(e);
  }
  if (!open.length) return locks;
  // The form sends each line's value; someone who cannot see costs would save it as zero.
  if (!canSeeCost()) {
    for (const e of open) locks.set(String(e._id), 'Editing gold needs permission to see costs');
    return locks;
  }
  const own =await StockMovement.find({ 'source.docType': 'stock_entry', 'source.docId': { $in: open.map((e) => e._id) }, metalStockId: { $ne: null } }, { metalStockId: 1, 'source.docId': 1 }).lean();
  for (const e of open) {
    const pools = [...new Set(own.filter((m) => String(m.source.docId) === String(e._id)).map((m) => String(m.metalStockId)))];
    const used = pools.length && (await StockMovement.exists({ metalStockId: { $in: pools.map(oid) }, direction: -1, createdAt: { $gt: e.postedAt ?? e.createdAt }, 'source.docId': { $ne: e._id } }));
    locks.set(String(e._id), used ? 'This gold has already been used (made into jewellery, moved or adjusted), so it cannot be edited' : null);
  }
  return locks;
}

async function serializeEntries(entries) {
  const maps = await nameMaps({
    branchIds: entries.map((e) => e.branchId),
    userIds: entries.map((e) => e.createdBy),
    productIds: entries.flatMap((e) => e.productIds),
  });
  const locks = await openingEditLocks(entries);
  const cost = canSeeCost();
  return entries.map((e) => ({
    id: e._id,
    docNo: e.docNo,
    type: e.type,
    status: e.status,
    reason: e.reason,
    branch: pick(maps.branches, e.branchId),
    products: e.productIds.map((id) => pick(maps.products, id)).filter(Boolean),
    metalLines: e.metalLines.map((l) => ({ ...l, ...(cost ? {} : { valuePaise: undefined }) })),
    totals: { ...e.totals, ...(cost ? {} : { valuePaise: undefined }) },
    businessDate: e.businessDate,
    note: e.note,
    rejectionReason: e.rejectionReason,
    createdBy: pick(maps.users, e.createdBy),
    createdAt: e.createdAt,
    postedAt: e.postedAt,
    updatedAt: e.updatedAt,
    ...(e.type === 'opening' && { edit: { allowed: !locks.get(String(e._id)), reason: locks.get(String(e._id)) ?? null } }),
  }));
}

async function validateProducts(productIds, { branchId, status }) {
  if (!productIds.length) return [];
  const products = await Product.find({ _id: { $in: productIds }, isDeleted: false }).lean();
  const found = new Map(products.map((p) => [String(p._id), p]));
  const problems = [];
  for (const id of productIds) {
    const p = found.get(String(id));
    if (!p) problems.push({ path: 'productIds', message: `Product ${id} not found` });
    else if (p.status !== status) problems.push({ path: 'productIds', message: `${p.sku} is ${p.status.replace('_', ' ')}` });
    else if (String(p.branchId) !== String(branchId)) problems.push({ path: 'productIds', message: `${p.sku} belongs to another branch` });
  }
  if (problems.length) throw ApiError.conflict(problems.map((p) => p.message).join('; '), 'INVALID_STOCK_STATE', problems);
  return products;
}

const totalsFor = (products, lines) => ({
  pieces: products.reduce((s, p) => s + (p.quantity ?? 1), 0),
  grossMg: products.reduce((s, p) => s + p.grossWeightMg, 0) + lines.reduce((s, l) => s + (l.direction === 'out' ? -1 : 1) * l.grossWeightMg, 0),
  fineMg: products.reduce((s, p) => s + p.fineWeightMg, 0) + lines.reduce((s, l) => s + (l.direction === 'out' ? -1 : 1) * l.fineWeightMg, 0),
  valuePaise: products.reduce((s, p) => s + (p.costPricePaise ?? 0), 0) + lines.reduce((s, l) => s + l.valuePaise, 0),
});

export async function createOpeningStock({ branchId, productIds, metalLines, note }) {
  const { userId } = requireContext();
  const branch = await requireBranch(branchId);
  const products = await validateProducts(productIds, { branchId, status: 'draft' });
  const lines = withFine(metalLines);
  const today = await todayContext();

  const entry = await withTransaction(async (session) => {
    const docNo = await nextDocumentNo({ prefix: 'OS', branchCode: branch.code, financialYear: today.financialYear }, { session });
    const [doc] = await StockEntry.create(
      [{ docNo, type: 'opening', branchId, productIds, metalLines: lines, totals: totalsFor(products, lines), status: STOCK_DOC_STATUS.POSTED, businessDate: today.businessDate, note, createdBy: userId, postedAt: today.now }],
      { session },
    );
    const source = { docType: 'stock_entry', docId: doc._id, docNo };
    let value = 0;
    if (productIds.length) value += (await moveProducts({ type: 'opening', productIds, branchId, expectedBranchId: branchId, source, businessDate: today.businessDate, note }, { session })).totalValuePaise;
    for (const line of lines) value += (await moveMetal({ type: 'opening', branchId, line, source, businessDate: today.businessDate, note }, { session })).valuePaise;

    await postJournal(
      {
        voucherType: 'opening_stock',
        date: today.now,
        businessDate: today.businessDate,
        financialYear: today.financialYear,
        narration: `Opening stock ${docNo}`,
        source,
        lines: [
          { account: 'inventory', debit: value, branchId },
          { account: 'opening_equity', credit: value, branchId },
        ],
      },
      { session },
    );
    await recordAudit({ action: AUDIT_ACTIONS.POST, module: 'inventory', recordType: 'StockEntry', recordId: doc._id, meta: { name: docNo, docNo, type: 'opening', pieces: doc.totals.pieces }, undo: { type: 'stock.opening', branchId } }, { session });
    return doc;
  });
  return (await serializeEntries([entry.toObject()]))[0];
}

/**
 * Correct the gold on an opening entry: the old lines come back out of the metal stock and the new ones go in, and
 * the opening journal is reversed and posted again for the new value. Refused once the gold has been used.
 */
export async function updateOpeningMetal(id, { metalLines, note }) {
  if (!(await StockEntry.exists({ _id: id, type: 'opening', ...accessibleBranchFilter() }))) throw ApiError.notFound('Stock entry');
  const lines = withFine(metalLines);
  const today = await todayContext();

  const entry = await withTransaction(async (session) => {
    const doc = await StockEntry.findById(id).session(session);
    const lock = (await openingEditLocks([doc.toObject()])).get(String(doc._id));
    if (lock) throw ApiError.conflict(lock, 'OPENING_LOCKED');
    const source = { docType: 'stock_entry', docId: doc._id, docNo: doc.docNo };
    const why = `Corrected ${doc.docNo}`;
    for (const old of doc.metalLines) {
      try {
        await moveMetal({ type: 'opening_edit', branchId: doc.branchId, line: { ...old.toObject(), direction: 'out' }, source, businessDate: today.businessDate, note: why }, { session });
      } catch (err) {
        if (err.code !== 'INSUFFICIENT_STOCK') throw err;
        throw ApiError.conflict('This gold has already been used (made into jewellery, moved or adjusted), so it cannot be edited', 'OPENING_LOCKED');
      }
    }
    let value = 0;
    for (const line of lines) value += (await moveMetal({ type: 'opening', branchId: doc.branchId, line, source, businessDate: today.businessDate, note: why }, { session })).valuePaise;

    await reverseJournalsFor(source, { date: today.now, businessDate: today.businessDate, financialYear: today.financialYear, narration: `${why} — old value reversed` }, { session });
    await postJournal(
      {
        voucherType: 'opening_stock',
        date: today.now,
        businessDate: today.businessDate,
        financialYear: today.financialYear,
        narration: `Opening stock ${doc.docNo} (corrected)`,
        source,
        lines: [
          { account: 'inventory', debit: value, branchId: doc.branchId },
          { account: 'opening_equity', credit: value, branchId: doc.branchId },
        ],
      },
      { session },
    );

    const before = doc.totals.grossMg;
    const linesBefore = doc.metalLines.map((l) => ({ metal: l.metal, purity: l.purity, kind: l.kind, grossWeightMg: l.grossWeightMg, valuePaise: l.valuePaise }));
    const noteBefore = doc.note ?? null;
    doc.set({ metalLines: lines, totals: totalsFor([], lines), ...(note !== undefined && { note }) });
    await doc.save({ session });
    await recordAudit(
      {
        action: AUDIT_ACTIONS.UPDATE,
        module: 'inventory',
        recordType: 'StockEntry',
        recordId: doc._id,
        meta: { name: doc.docNo, docNo: doc.docNo, type: 'opening' },
        changes: [{ field: 'grossMg', from: before, to: doc.totals.grossMg }],
        undo: { type: 'stock.openingEdit', branchId: doc.branchId, data: { before: linesBefore, note: noteBefore, after: doc.metalLines.map((l) => ({ metal: l.metal, purity: l.purity, kind: l.kind, grossWeightMg: l.grossWeightMg, valuePaise: l.valuePaise })) } },
      },
      { session },
    );
    return doc;
  });
  return (await serializeEntries([entry.toObject()]))[0];
}

async function postAdjustment(entryId, { session }) {
  const entry = await StockEntry.findById(entryId).session(session);
  if (!entry || entry.status !== STOCK_DOC_STATUS.PENDING_APPROVAL) throw ApiError.conflict('Adjustment is not awaiting approval', 'INVALID_STATE');
  const { jewellery } = await getSettings();
  const today = await todayContext();
  const source = { docType: 'stock_entry', docId: entry._id, docNo: entry.docNo };

  let outValue = 0;
  let inValue = 0;
  if (entry.productIds.length) {
    const toStatus = entry.reason === 'melted' ? 'melted' : 'written_off';
    outValue += (await moveProducts({ type: 'adjustment_out', productIds: entry.productIds, expectedBranchId: entry.branchId, toStatus, source, businessDate: today.businessDate, note: entry.note }, { session })).totalValuePaise;
  }
  for (const line of entry.metalLines) {
    const type = line.direction === 'out' ? 'adjustment_out' : 'adjustment_in';
    const { valuePaise } = await moveMetal({ type, branchId: entry.branchId, line: line.toObject(), source, businessDate: today.businessDate, note: entry.note, allowNegative: jewellery.allowNegativeStock }, { session });
    if (line.direction === 'out') outValue += valuePaise;
    else inValue += valuePaise;
  }

  const journal = (lines) => postJournal({ voucherType: 'stock_adjustment', date: today.now, businessDate: today.businessDate, financialYear: today.financialYear, narration: `Stock adjustment ${entry.docNo} (${entry.reason})`, source, lines }, { session });
  await journal([{ account: 'stock_loss', debit: outValue, branchId: entry.branchId }, { account: 'inventory', credit: outValue, branchId: entry.branchId }]);
  await journal([{ account: 'inventory', debit: inValue, branchId: entry.branchId }, { account: 'stock_gain', credit: inValue, branchId: entry.branchId }]);

  entry.status = STOCK_DOC_STATUS.POSTED;
  entry.postedAt = today.now;
  await entry.save({ session });
  await recordAudit({ action: AUDIT_ACTIONS.POST, module: 'inventory', recordType: 'StockEntry', recordId: entry._id, meta: { name: entry.docNo, docNo: entry.docNo, type: 'adjustment' }, undo: { type: 'stock.adjustment', branchId: entry.branchId } }, { session });
}

// ---------------------------------------------------------------- taking back (Undo)

const metalOf = (l) => ({ metal: l.metal, purity: l.purity, kind: l.kind, grossWeightMg: l.grossWeightMg, valuePaise: l.valuePaise ?? 0 });

/** Why an opening entry cannot be cancelled now, or null: its pieces and gold must still be here, untouched. */
export async function openingCancelBlock(e) {
  if (e.status !== STOCK_DOC_STATUS.POSTED) return `It is ${e.status.replace('_', ' ')}.`;
  const gone = e.productIds.length ? await piecesGone(e.productIds, e.branchId) : null;
  if (gone) return gone;
  return e.metalLines.length ? metalShortfall(e.branchId, e.metalLines) : null;
}

/** Cancels an opening entry (Undo): its pieces are drafts again, its gold leaves the metal stock, its journal is reversed. */
export async function cancelOpeningStock(id, reason) {
  const { userId } = requireContext();
  const today = await todayContext();
  const e = await StockEntry.findOne({ _id: id, type: 'opening', ...accessibleBranchFilter() }).lean();
  if (!e) throw ApiError.notFound('Stock entry');
  const block = await openingCancelBlock(e);
  if (block) throw ApiError.conflict(`${e.docNo} cannot be cancelled: ${block}`, 'INVALID_STATE');
  await withTransaction(async (session) => {
    const claimed = await StockEntry.findOneAndUpdate({ _id: e._id, status: STOCK_DOC_STATUS.POSTED }, { $set: { status: STOCK_DOC_STATUS.CANCELLED, cancelledAt: today.now, cancelledBy: userId, cancelReason: reason } }, { session });
    if (!claimed) throw ApiError.conflict('This entry was already cancelled', 'INVALID_STATE');
    const source = { docType: 'stock_entry', docId: e._id, docNo: e.docNo };
    if (e.productIds.length) await moveProducts({ type: 'opening_cancel', productIds: e.productIds, branchId: e.branchId, expectedBranchId: e.branchId, source, businessDate: today.businessDate, note: reason }, { session });
    for (const l of e.metalLines) await moveMetal({ type: 'opening_cancel', branchId: e.branchId, line: { ...metalOf(l), direction: 'out' }, source, businessDate: today.businessDate, note: reason }, { session });
    await reverseJournalsFor(source, { date: today.now, businessDate: today.businessDate, financialYear: today.financialYear, narration: `Opening stock ${e.docNo} cancelled` }, { session });
    await recordAudit({ action: AUDIT_ACTIONS.CANCEL, module: 'inventory', recordType: 'StockEntry', recordId: e._id, meta: { name: e.docNo, docNo: e.docNo, type: 'opening', reason } }, { session });
  });
}

/** Why a posted adjustment cannot be reversed now, or null: written-off pieces must still be written off, and metal it added still here. */
export async function adjustmentReverseBlock(e) {
  if (e.status !== STOCK_DOC_STATUS.POSTED) return `It is ${e.status.replace('_', ' ')}.`;
  if (e.productIds.length) {
    const moved = await Product.find({ _id: { $in: e.productIds }, $or: [{ status: { $nin: ['written_off', 'melted'] } }, { branchId: { $ne: e.branchId } }] }).select('sku').lean();
    if (moved.length) return `${moved.map((p) => p.sku).join(', ')} changed since.`;
  }
  const added = e.metalLines.filter((l) => l.direction === 'in');
  return added.length ? metalShortfall(e.branchId, added) : null;
}

/** Reverses a posted adjustment (Undo): pieces back in stock, metal lines the other way, its journals reversed. */
export async function reverseAdjustment(id, reason) {
  const { userId } = requireContext();
  const today = await todayContext();
  const e = await StockEntry.findOne({ _id: id, type: 'adjustment', ...accessibleBranchFilter() }).lean();
  if (!e) throw ApiError.notFound('Stock entry');
  const block = await adjustmentReverseBlock(e);
  if (block) throw ApiError.conflict(`${e.docNo} cannot be reversed: ${block}`, 'INVALID_STATE');
  await withTransaction(async (session) => {
    const claimed = await StockEntry.findOneAndUpdate({ _id: e._id, status: STOCK_DOC_STATUS.POSTED }, { $set: { status: STOCK_DOC_STATUS.CANCELLED, cancelledAt: today.now, cancelledBy: userId, cancelReason: reason } }, { session });
    if (!claimed) throw ApiError.conflict('This adjustment was already reversed', 'INVALID_STATE');
    const source = { docType: 'stock_entry', docId: e._id, docNo: e.docNo };
    if (e.productIds.length) await moveProducts({ type: 'adjustment_reverse', productIds: e.productIds, branchId: e.branchId, expectedBranchId: e.branchId, source, businessDate: today.businessDate, note: reason }, { session });
    for (const l of e.metalLines) {
      const back = l.direction === 'out' ? 'in' : 'out';
      await moveMetal({ type: back === 'in' ? 'adjustment_in' : 'adjustment_out', branchId: e.branchId, line: { ...metalOf(l), direction: back }, source, businessDate: today.businessDate, note: `Reversed: ${reason}` }, { session });
    }
    await reverseJournalsFor(source, { date: today.now, businessDate: today.businessDate, financialYear: today.financialYear, narration: `Adjustment ${e.docNo} reversed` }, { session });
    await recordAudit({ action: AUDIT_ACTIONS.CANCEL, module: 'inventory', recordType: 'StockEntry', recordId: e._id, meta: { name: e.docNo, docNo: e.docNo, type: 'adjustment', reason } }, { session });
  });
}

registerApprovalHandler('stock_adjustment', {
  label: 'Stock adjustment',
  permission: 'inventory.approve',
  approve: (docId, options) => postAdjustment(docId, options),
  reject: async (docId, { session, comment }) => {
    await StockEntry.updateOne({ _id: docId, status: STOCK_DOC_STATUS.PENDING_APPROVAL }, { $set: { status: STOCK_DOC_STATUS.REJECTED, rejectionReason: comment ?? null } }, { session });
  },
  reopen: async (docId, { session }) => {
    await StockEntry.updateOne({ _id: docId, status: STOCK_DOC_STATUS.REJECTED }, { $set: { status: STOCK_DOC_STATUS.PENDING_APPROVAL, rejectionReason: null } }, { session });
  },
});

export async function createAdjustment({ branchId, reason, productIds, metalLines, note }) {
  const { userId } = requireContext();
  const branch = await requireBranch(branchId);
  const products = await validateProducts(productIds, { branchId, status: 'in_stock' });
  if (productIds.length) {
    const pending = await StockEntry.findOne({ status: STOCK_DOC_STATUS.PENDING_APPROVAL, productIds: { $in: productIds.map(oid) } }).select('docNo').lean();
    if (pending) throw ApiError.conflict(`Some items are already in pending adjustment ${pending.docNo}`, 'PENDING_ADJUSTMENT');
  }
  const lines = withFine(metalLines);
  const [{ approvals }, today] = await Promise.all([getSettings(), todayContext()]);

  const entry = await withTransaction(async (session) => {
    const docNo = await nextDocumentNo({ prefix: 'ADJ', branchCode: branch.code, financialYear: today.financialYear }, { session });
    const [doc] = await StockEntry.create(
      [{ docNo, type: 'adjustment', branchId, reason, productIds, metalLines: lines, totals: totalsFor(products, lines), status: STOCK_DOC_STATUS.PENDING_APPROVAL, businessDate: today.businessDate, note, createdBy: userId }],
      { session },
    );
    if (approvals.stockAdjustments) {
      const parts = [products.length && `${products.length} item(s) out`, lines.length && `${lines.length} metal line(s)`].filter(Boolean).join(', ');
      await requestApproval({ docType: 'stock_adjustment', docId: doc._id, docNo, branchId, summary: `${reason.replace('_', ' ')} at ${branch.name}: ${parts}` }, { session });
    } else {
      await postAdjustment(doc._id, { session });
    }
    return doc;
  });
  const fresh = await StockEntry.findById(entry._id).lean();
  return (await serializeEntries([fresh]))[0];
}

export async function listStockEntries({ page, limit, q, type, status, branchId: chosen }) {
  const branchId = chosen ?? (await viewBranchFor('inventory')); // navbar filter
  const filter = { type, ...accessibleBranchFilter(), ...searchFilter(q, ['docNo', 'note']) };
  if (status) filter.status = status;
  if (branchId) filter.branchId = oid(branchId);
  const [items, total] = await Promise.all([StockEntry.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), StockEntry.countDocuments(filter)]);
  return { items: await serializeEntries(items), meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } };
}

export async function getStockEntry(id) {
  const entry = await StockEntry.findOne({ _id: id, ...accessibleBranchFilter() }).lean();
  if (!entry) throw ApiError.notFound('Stock entry');
  return (await serializeEntries([entry]))[0];
}

export async function stockSummary({ branchId: chosen }) {
  const branchId = chosen ?? (await viewBranchFor('inventory')); // navbar filter
  const scope = branchId ? (await requireBranch(branchId, { active: false }), { branchId: oid(branchId) }) : accessibleBranchFilter();
  const cost = canSeeCost();
  const [products, inTransit, pools] = await Promise.all([
    Product.aggregate([
      { $match: { isDeleted: false, status: 'in_stock', ...scope } },
      {
        $group: {
          _id: { metal: '$metal', purity: '$purity' },
          items: { $sum: 1 },
          pieces: { $sum: '$quantity' },
          grossMg: { $sum: '$grossWeightMg' },
          netMg: { $sum: '$netWeightMg' },
          fineMg: { $sum: '$fineWeightMg' },
          costPaise: { $sum: { $ifNull: ['$costPricePaise', 0] } },
        },
      },
      { $sort: { '_id.metal': 1, '_id.purity': -1 } },
    ]),
    Product.countDocuments({ isDeleted: false, status: 'in_transit', ...scope }),
    MetalStock.find({ ...scope, $or: [{ grossMg: { $ne: 0 } }, { fineMg: { $ne: 0 } }] }).lean(),
  ]);
  const maps = await nameMaps({ branchIds: pools.map((p) => p.branchId) });
  return {
    products: products.map((r) => ({ metal: r._id.metal, purity: r._id.purity, items: r.items, pieces: r.pieces, grossMg: r.grossMg, netMg: r.netMg, fineMg: r.fineMg, ...(cost && { costPaise: r.costPaise }) })),
    inTransit,
    metalPools: pools.map((p) => ({ id: p._id, branch: pick(maps.branches, p.branchId), metal: p.metal, purity: p.purity, kind: p.kind, grossMg: p.grossMg, fineMg: p.fineMg, ...(cost && { valuePaise: p.valuePaise }) })),
  };
}

export async function listMovements({ page, limit, branchId: chosen, productId, type, stock, metal, from, to }) {
  const branchId = chosen ?? (productId ? null : await viewBranchFor('inventory')); // navbar filter (one product's history: all)
  const filter = { ...accessibleBranchFilter() };
  if (branchId) filter.branchId = oid(branchId);
  if (productId) filter.productId = oid(productId);
  if (type) filter.type = type;
  if (stock === 'raw') filter.metalStockId = { $ne: null };
  else if (stock === 'products') filter.productId = { $ne: null };
  if (metal) filter.metal = metal;
  if (from || to) filter.createdAt = dayRange(from, to, (await todayContext()).timezone);

  const [items, total, sides] = await Promise.all([
    StockMovement.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    StockMovement.countDocuments(filter),
    // Header cards: what came in and went out under the same filters (pieces count by quantity, metal by weight).
    StockMovement.aggregate([
      { $match: filter },
      { $group: { _id: '$direction', count: { $sum: 1 }, pieces: { $sum: { $cond: [{ $ne: ['$productId', null] }, { $ifNull: ['$qty', 1] }, 0] } }, grossMg: { $sum: '$grossMg' }, fineMg: { $sum: '$fineMg' }, valuePaise: { $sum: { $ifNull: ['$valuePaise', 0] } } } },
    ]),
  ]);
  const maps = await nameMaps({ branchIds: items.map((m) => m.branchId), userIds: items.map((m) => m.createdBy), productIds: items.map((m) => m.productId) });
  const cost = canSeeCost();
  const side = (d) => {
    const s = sides.find((x) => x._id === d) ?? {};
    return { count: s.count ?? 0, pieces: s.pieces ?? 0, grossMg: s.grossMg ?? 0, fineMg: s.fineMg ?? 0, ...(cost && { valuePaise: s.valuePaise ?? 0 }) };
  };
  const stockIn = side(1);
  const stockOut = side(-1);
  return {
    items: items.map((m) => ({
      id: m._id,
      type: m.type,
      direction: m.direction,
      product: pick(maps.products, m.productId),
      kind: m.kind,
      branch: pick(maps.branches, m.branchId),
      metal: m.metal,
      purity: m.purity,
      qty: m.qty,
      grossMg: m.grossMg,
      netMg: m.netMg,
      fineMg: m.fineMg,
      ...(cost && { valuePaise: m.valuePaise }),
      statusBefore: m.statusBefore,
      statusAfter: m.statusAfter,
      source: m.source,
      businessDate: m.businessDate,
      note: m.note,
      createdBy: pick(maps.users, m.createdBy),
      createdAt: m.createdAt,
    })),
    meta: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
      summary: { in: stockIn, out: stockOut, netGrossMg: stockIn.grossMg - stockOut.grossMg, netFineMg: stockIn.fineMg - stockOut.fineMg, ...(cost && { netValuePaise: stockIn.valuePaise - stockOut.valuePaise }) },
    },
  };
}
