import { fineWeightMg, STOCK_DOC_STATUS } from '@jerp/shared';
import { withTransaction } from '../../config/db.js';
import { registerApprovalHandler, requestApproval } from '../../core/approvals/approval.service.js';
import { AUDIT_ACTIONS, recordAudit } from '../../core/audit/audit.service.js';
import { requireContext } from '../../core/context/requestContext.js';
import { postJournal } from '../../core/ledger/posting.service.js';
import { nextDocumentNo } from '../../core/numbering/numbering.service.js';
import { MetalStock } from '../../core/stock/metalStock.model.js';
import { moveMetal, moveProducts } from '../../core/stock/stockLedger.service.js';
import { StockMovement } from '../../core/stock/stockMovement.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { dayRange, todayContext } from '../../utils/businessDate.js';
import { searchFilter } from '../../utils/pagination.js';
import { Product } from '../products/product.model.js';
import { getSettings } from '../settings/settings.service.js';
import { accessibleBranchFilter, canSeeCost, nameMaps, oid, pick, requireBranch } from './inventory.helpers.js';
import { StockEntry } from './stockEntry.model.js';

const withFine = (lines) => lines.map((l) => ({ ...l, fineWeightMg: fineWeightMg(l.grossWeightMg, l.purity) }));

async function serializeEntries(entries) {
  const maps = await nameMaps({
    branchIds: entries.map((e) => e.branchId),
    userIds: entries.map((e) => e.createdBy),
    productIds: entries.flatMap((e) => e.productIds),
  });
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
    await recordAudit({ action: AUDIT_ACTIONS.POST, module: 'inventory', recordType: 'StockEntry', recordId: doc._id, meta: { name: docNo, docNo, type: 'opening', pieces: doc.totals.pieces } }, { session });
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
  await recordAudit({ action: AUDIT_ACTIONS.POST, module: 'inventory', recordType: 'StockEntry', recordId: entry._id, meta: { name: entry.docNo, docNo: entry.docNo, type: 'adjustment' } }, { session });
}

registerApprovalHandler('stock_adjustment', {
  label: 'Stock adjustment',
  permission: 'inventory.approve',
  approve: (docId, options) => postAdjustment(docId, options),
  reject: async (docId, { session, comment }) => {
    await StockEntry.updateOne({ _id: docId, status: STOCK_DOC_STATUS.PENDING_APPROVAL }, { $set: { status: STOCK_DOC_STATUS.REJECTED, rejectionReason: comment ?? null } }, { session });
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

export async function listStockEntries({ page, limit, q, type, status, branchId }) {
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

export async function stockSummary({ branchId }) {
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

export async function listMovements({ page, limit, branchId, productId, type, metal, from, to }) {
  const filter = { ...accessibleBranchFilter() };
  if (branchId) filter.branchId = oid(branchId);
  if (productId) filter.productId = oid(productId);
  if (type) filter.type = type;
  if (metal) filter.metal = metal;
  if (from || to) filter.createdAt = dayRange(from, to, (await todayContext()).timezone);

  const [items, total] = await Promise.all([StockMovement.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), StockMovement.countDocuments(filter)]);
  const maps = await nameMaps({ branchIds: items.map((m) => m.branchId), userIds: items.map((m) => m.createdBy), productIds: items.map((m) => m.productId) });
  const cost = canSeeCost();
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
    meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  };
}
