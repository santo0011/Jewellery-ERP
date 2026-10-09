import { fineWeightMg } from '@jerp/shared';
import { productSchema } from '@jerp/shared/schemas';
import { withTransaction } from '../../config/db.js';
import { AUDIT_ACTIONS, recordAudit } from '../../core/audit/audit.service.js';
import { requireContext } from '../../core/context/requestContext.js';
import { postJournal } from '../../core/ledger/posting.service.js';
import { PAYMENT_ACCOUNT } from '../../core/ledger/paymentAccounts.js';
import { nextDocumentNo } from '../../core/numbering/numbering.service.js';
import { moveMetal, moveProducts } from '../../core/stock/stockLedger.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { financialYearLabel, todayContext } from '../../utils/businessDate.js';
import { paginate, searchFilter } from '../../utils/pagination.js';
import { accessibleBranchFilter, nameMaps, oid, pick, requireBranch } from '../inventory/inventory.helpers.js';
import { Item } from '../items/item.model.js';
import { itemsForPieces } from '../items/item.service.js';
import { Product } from '../products/product.model.js';
import { insertPieces, preparePieces } from '../products/product.service.js';
import { Supplier } from '../suppliers/supplier.model.js';
import { Purchase, PurchaseOrder } from './purchase.model.js';

const sum = (list, fn) => list.reduce((s, x) => s + (fn(x) ?? 0), 0);
const countBy = (list) => list.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map());
const paymentStatus = (paid, total) => (paid >= total ? 'paid' : paid > 0 ? 'partly_paid' : 'due');
const at = (date, today) => (date === today.businessDate ? today.now : new Date(`${date}T12:00:00+05:30`));

async function findSupplier(id) {
  const s = await Supplier.findOne({ _id: id, isDeleted: false }).lean();
  if (!s) throw ApiError.badRequest('Supplier not found', [{ path: 'supplierId', message: 'Pick a supplier' }], 'VALIDATION_ERROR');
  return s;
}
const supplierSnapshot = (s) => ({ id: s._id, code: s.code, name: s.companyName, gstin: s.gstin ?? null, mobile: s.mobile });

// ---------------------------------------------------------------- purchases

function serializePurchase(p, maps) {
  const due = p.totals.totalPaise - p.paidPaise;
  return {
    id: p._id,
    purchaseNo: p.purchaseNo,
    branch: pick(maps.branches, p.branchId),
    supplier: p.supplier,
    billNo: p.billNo,
    billDate: p.billDate,
    order: p.orderId ? { id: p.orderId, orderNo: p.orderNo } : null,
    items: p.items,
    metalLines: p.metalLines,
    totals: p.totals,
    payments: (p.payments ?? []).map((x) => ({ ...x, by: pick(maps.users, x.by) })),
    paidPaise: p.paidPaise,
    duePaise: due,
    paymentStatus: p.paymentStatus,
    note: p.note,
    createdBy: pick(maps.users, p.createdBy),
    createdAt: p.createdAt,
  };
}

async function mapsFor(list) {
  return nameMaps({ branchIds: list.map((p) => p.branchId), userIds: list.flatMap((p) => [p.createdBy, ...(p.payments ?? []).map((x) => x.by)]) });
}

export async function listPurchases({ page, limit, q, supplierId, branchId, payment }) {
  const filter = { ...accessibleBranchFilter(), ...searchFilter(q, ['purchaseNo', 'billNo', 'supplier.name', 'orderNo']) };
  if (supplierId) filter.supplierId = oid(supplierId);
  if (branchId) filter.branchId = oid(branchId);
  if (payment) filter.paymentStatus = payment;
  const { items, meta } = await paginate(Purchase.find(filter).sort({ billDate: -1, createdAt: -1 }), Purchase.countDocuments(filter), { page, limit });
  const maps = await mapsFor(items);

  // Header figures: bought this month and still owed to suppliers (across every bill, not just this page).
  const today = await todayContext();
  const month = today.businessDate.slice(0, 7);
  const [monthAgg, dueAgg] = await Promise.all([
    Purchase.aggregate([{ $match: { ...accessibleBranchFilter(), billDate: { $gte: `${month}-01`, $lte: `${month}-31` } } }, { $group: { _id: null, total: { $sum: '$totals.totalPaise' }, bills: { $sum: 1 } } }]),
    Purchase.aggregate([{ $match: { ...accessibleBranchFilter(), paymentStatus: { $ne: 'paid' } } }, { $group: { _id: null, due: { $sum: { $subtract: ['$totals.totalPaise', '$paidPaise'] } }, bills: { $sum: 1 } } }]),
  ]);
  return {
    items: items.map((p) => serializePurchase(p, maps)),
    meta: { ...meta, monthPaise: monthAgg[0]?.total ?? 0, monthBills: monthAgg[0]?.bills ?? 0, duePaise: dueAgg[0]?.due ?? 0, dueBills: dueAgg[0]?.bills ?? 0 },
  };
}

export async function getPurchase(id) {
  const p = await Purchase.findOne({ _id: id, ...accessibleBranchFilter() }).lean();
  if (!p) throw ApiError.notFound('Purchase');
  return serializePurchase(p, await mapsFor([p]));
}

/**
 * Records a supplier's bill: the draft pieces on it go into stock at their bill cost, loose metal goes into the
 * metal pool, and the books get stock + GST input against the supplier's account. Anything paid on the spot is
 * recorded as the first payment. A linked purchase order is closed as received.
 */
export async function createPurchase({ supplierId, branchId, billNo, billDate, orderId, items, newPieces = [], metalLines, gstPaise, otherChargesPaise = 0, paidNow, note }) {
  const { userId } = requireContext();
  const branch = await requireBranch(branchId);
  const supplier = await findSupplier(supplierId);
  const today = await todayContext();
  if (billDate > today.businessDate) throw ApiError.badRequest('Bill date cannot be in the future', [{ path: 'billDate', message: 'Pick today or an earlier date' }], 'VALIDATION_ERROR');
  if (await Purchase.exists({ supplierId: supplier._id, billNo: billNo.trim() })) {
    throw ApiError.conflict(`Bill ${billNo} from ${supplier.companyName} is already entered`, 'DUPLICATE', [{ path: 'billNo', message: 'Already entered' }]);
  }

  const products = items.length ? await Product.find({ _id: { $in: items.map((i) => i.productId) }, isDeleted: false }).lean() : [];
  const byId = new Map(products.map((p) => [String(p._id), p]));
  const problems = [];
  for (const i of items) {
    const p = byId.get(String(i.productId));
    if (!p) problems.push({ path: 'items', message: 'An item was not found' });
    else if (p.status !== 'draft') problems.push({ path: 'items', message: `${p.sku} is already ${p.status.replace('_', ' ')}` });
    else if (String(p.branchId) !== String(branchId)) problems.push({ path: 'items', message: `${p.sku} belongs to another branch` });
  }
  if (problems.length) throw ApiError.conflict(problems.map((p) => p.message).join('; '), 'INVALID_STOCK_STATE', problems);

  const catalogue = newPieces.length ? await itemsForPieces(newPieces.map((p) => p.itemId)) : new Map();
  const pieceInputs = newPieces.map((p, i) => {
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
      ...(p.huid && { huid: p.huid }),
      costPricePaise: p.costPaise,
      supplierId: String(supplier._id),
      branchId: String(branchId),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw ApiError.badRequest(`${item.name}: ${issue.message}`, [{ path: `newPieces.${i}.${issue.path.join('.')}`, message: issue.message }], 'VALIDATION_ERROR');
    }
    return parsed.data;
  });
  const preparedPieces = pieceInputs.length ? await preparePieces(pieceInputs) : [];

  const order = orderId ? await PurchaseOrder.findOne({ _id: orderId, status: 'open' }).lean() : null;
  if (orderId && !order) throw ApiError.badRequest('That purchase order is not open', [{ path: 'orderId', message: 'Order is closed' }], 'VALIDATION_ERROR');
  if (order && String(order.supplierId) !== String(supplier._id)) throw ApiError.badRequest('The order is from a different supplier', [{ path: 'orderId', message: 'Different supplier' }], 'VALIDATION_ERROR');

  const lines = metalLines.map((l) => ({ ...l, fineWeightMg: fineWeightMg(l.grossWeightMg, l.purity) }));
  const itemRows = items.map((i) => {
    const p = byId.get(String(i.productId));
    return { productId: p._id, sku: p.sku, name: p.name, metal: p.metal, purity: p.purity, grossWeightMg: p.grossWeightMg, fineWeightMg: p.fineWeightMg, costPaise: i.costPaise };
  });
  const goodsPaise = sum(itemRows, (i) => i.costPaise) + sum(newPieces, (p) => p.costPaise) + sum(lines, (l) => l.valuePaise);
  const totalPaise = goodsPaise + otherChargesPaise + gstPaise;
  const paid = paidNow?.amountPaise ?? 0;
  if (paid > totalPaise) throw ApiError.badRequest('Paid is more than the bill total', [{ path: 'paidNow.amountPaise', message: 'More than the bill' }], 'VALIDATION_ERROR');
  const financialYear = financialYearLabel(billDate, today.fyStartMonth);

  const purchase = await withTransaction(async (session) => {
    const created = preparedPieces.length ? await insertPieces(preparedPieces, { session }) : [];
    const allRows = [
      ...itemRows,
      ...created.map((p) => ({ productId: p._id, sku: p.sku, name: p.name, metal: p.metal, purity: p.purity, grossWeightMg: p.grossWeightMg, fineWeightMg: p.fineWeightMg, costPaise: p.costPricePaise })),
    ];
    const purchaseNo = await nextDocumentNo({ prefix: 'PUR', branchCode: branch.code, financialYear: today.financialYear }, { session });
    const [doc] = await Purchase.create(
      [
        {
          purchaseNo,
          branchId,
          supplierId: supplier._id,
          supplier: supplierSnapshot(supplier),
          billNo: billNo.trim(),
          billDate,
          orderId: order?._id ?? null,
          orderNo: order?.orderNo ?? null,
          items: allRows,
          metalLines: lines,
          totals: { pieces: allRows.length, grossMg: sum(allRows, (i) => i.grossWeightMg) + sum(lines, (l) => l.grossWeightMg), fineMg: sum(allRows, (i) => i.fineWeightMg) + sum(lines, (l) => l.fineWeightMg), goodsPaise, otherChargesPaise, gstPaise, totalPaise },
          payments: paid ? [{ date: today.businessDate, at: today.now, mode: paidNow.mode, amountPaise: paid, reference: paidNow.reference ?? null, by: userId }] : [],
          paidPaise: paid,
          paymentStatus: paymentStatus(paid, totalPaise),
          businessDate: today.businessDate,
          note: note ?? null,
          createdBy: userId,
        },
      ],
      { session },
    );
    const source = { docType: 'purchase', docId: doc._id, docNo: purchaseNo };

    // Each piece carries its bill cost and supplier from now on.
    for (const i of itemRows) await Product.updateOne({ _id: i.productId }, { $set: { costPricePaise: i.costPaise, supplierId: supplier._id, updatedBy: userId } }, { session });
    if (allRows.length) await moveProducts({ type: 'purchase', productIds: allRows.map((i) => i.productId), branchId, expectedBranchId: branchId, source, businessDate: billDate, note: `Bill ${billNo}` }, { session });
    // Most-used items come first when searching.
    for (const [id, n] of countBy(newPieces.map((p) => String(p.itemId)))) await Item.updateOne({ _id: id }, { $inc: { usedCount: n } }, { session });
    for (const line of lines) await moveMetal({ type: 'purchase', branchId, line: { ...line, direction: 'in' }, source, businessDate: billDate, note: `Bill ${billNo}` }, { session });

    const party = { type: 'supplier', id: supplier._id };
    await postJournal(
      {
        voucherType: 'purchase',
        date: at(billDate, today),
        businessDate: billDate,
        financialYear,
        narration: `Purchase ${purchaseNo} · ${supplier.companyName} bill ${billNo}`,
        source,
        lines: [
          { account: 'inventory', debit: goodsPaise + otherChargesPaise, branchId },
          { account: 'gst_input', debit: gstPaise, branchId },
          { account: 'sundry_creditors', credit: totalPaise, party, branchId },
        ],
      },
      { session },
    );
    if (paid) await postSupplierPayment({ doc, amountPaise: paid, mode: paidNow.mode, date: today.businessDate, today, session });

    if (order) {
      await PurchaseOrder.updateOne(
        { _id: order._id, status: 'open' },
        { $set: { status: 'received', purchaseId: doc._id, purchaseNo }, $push: { timeline: { status: 'received', at: today.now, by: userId, note: `Bill ${billNo} · ${purchaseNo}` } } },
        { session },
      );
    }
    await recordAudit({ action: AUDIT_ACTIONS.CREATE, module: 'purchase', recordType: 'Purchase', recordId: doc._id, meta: { name: purchaseNo, supplier: supplier.companyName, billNo, totalPaise } }, { session });
    return doc;
  });
  return getPurchase(purchase._id);
}

async function postSupplierPayment({ doc, amountPaise, mode, date, today, session }) {
  await postJournal(
    {
      voucherType: 'supplier_payment',
      date: at(date, today),
      businessDate: date,
      financialYear: financialYearLabel(date, today.fyStartMonth),
      narration: `Paid ${doc.supplier.name} for ${doc.purchaseNo} (bill ${doc.billNo})`,
      source: { docType: 'purchase', docId: doc._id, docNo: doc.purchaseNo },
      lines: [
        { account: 'sundry_creditors', debit: amountPaise, party: { type: 'supplier', id: doc.supplierId }, branchId: doc.branchId },
        { account: PAYMENT_ACCOUNT[mode], credit: amountPaise, branchId: doc.branchId },
      ],
    },
    { session },
  );
}

/** Pays (part of) what is still owed on a bill. */
export async function payPurchase(id, { amountPaise, mode, reference, date }) {
  const { userId } = requireContext();
  const today = await todayContext();
  const day = date ?? today.businessDate;
  if (day > today.businessDate) throw ApiError.badRequest('Payment date cannot be in the future', [{ path: 'date', message: 'Pick today or an earlier date' }], 'VALIDATION_ERROR');
  await withTransaction(async (session) => {
    const doc = await Purchase.findOne({ _id: id, ...accessibleBranchFilter() }).session(session);
    if (!doc) throw ApiError.notFound('Purchase');
    const due = doc.totals.totalPaise - doc.paidPaise;
    if (due <= 0) throw ApiError.conflict('This bill is already fully paid', 'INVALID_STATE');
    if (amountPaise > due) throw ApiError.badRequest(`Only ₹${(due / 100).toLocaleString('en-IN')} is due`, [{ path: 'amountPaise', message: 'More than the amount due' }], 'VALIDATION_ERROR');
    doc.payments.push({ date: day, at: today.now, mode, amountPaise, reference: reference ?? null, by: userId });
    doc.paidPaise += amountPaise;
    doc.paymentStatus = paymentStatus(doc.paidPaise, doc.totals.totalPaise);
    await doc.save({ session });
    await postSupplierPayment({ doc, amountPaise, mode, date: day, today, session });
    await recordAudit({ action: AUDIT_ACTIONS.UPDATE, module: 'purchase', recordType: 'Purchase', recordId: doc._id, meta: { name: doc.purchaseNo, payment: amountPaise, mode } }, { session });
  });
  return getPurchase(id);
}

// ---------------------------------------------------------------- purchase orders

function serializeOrder(o, maps, today) {
  return {
    id: o._id,
    orderNo: o.orderNo,
    branch: pick(maps.branches, o.branchId),
    supplier: o.supplier,
    orderDate: o.orderDate,
    expectedDate: o.expectedDate,
    overdue: o.status === 'open' && Boolean(o.expectedDate) && o.expectedDate < today,
    lines: o.lines,
    totals: o.totals,
    status: o.status,
    purchase: o.purchaseId ? { id: o.purchaseId, purchaseNo: o.purchaseNo } : null,
    timeline: (o.timeline ?? []).map((t) => ({ ...t, by: pick(maps.users, t.by) })),
    note: o.note,
    createdAt: o.createdAt,
  };
}

async function orderMaps(list) {
  return nameMaps({ branchIds: list.map((o) => o.branchId), userIds: list.flatMap((o) => (o.timeline ?? []).map((t) => t.by)) });
}

export async function listPurchaseOrders({ page, limit, q, supplierId, branchId, status }) {
  const filter = { ...accessibleBranchFilter(), ...searchFilter(q, ['orderNo', 'supplier.name', 'lines.description']) };
  if (supplierId) filter.supplierId = oid(supplierId);
  if (branchId) filter.branchId = oid(branchId);
  if (status) filter.status = status;
  const { items, meta } = await paginate(PurchaseOrder.find(filter).sort({ createdAt: -1 }), PurchaseOrder.countDocuments(filter), { page, limit });
  const today = await todayContext();
  const counts = await PurchaseOrder.aggregate([{ $match: { ...accessibleBranchFilter(), status: 'open' } }, { $group: { _id: null, open: { $sum: 1 }, overdue: { $sum: { $cond: [{ $and: [{ $ne: ['$expectedDate', null] }, { $lt: ['$expectedDate', today.businessDate] }] }, 1, 0] } }, amount: { $sum: '$totals.amountPaise' } } }]);
  const maps = await orderMaps(items);
  return { items: items.map((o) => serializeOrder(o, maps, today.businessDate)), meta: { ...meta, open: counts[0]?.open ?? 0, overdue: counts[0]?.overdue ?? 0, openAmountPaise: counts[0]?.amount ?? 0 } };
}

export async function getPurchaseOrder(id) {
  const o = await PurchaseOrder.findOne({ _id: id, ...accessibleBranchFilter() }).lean();
  if (!o) throw ApiError.notFound('Purchase order');
  const today = await todayContext();
  return serializeOrder(o, await orderMaps([o]), today.businessDate);
}

export async function createPurchaseOrder({ supplierId, branchId, expectedDate, lines, note }) {
  const { userId } = requireContext();
  const branch = await requireBranch(branchId);
  const supplier = await findSupplier(supplierId);
  const today = await todayContext();
  if (expectedDate && expectedDate < today.businessDate) throw ApiError.badRequest('Expected date is in the past', [{ path: 'expectedDate', message: 'Pick today or later' }], 'VALIDATION_ERROR');
  const order = await withTransaction(async (session) => {
    const orderNo = await nextDocumentNo({ prefix: 'PO', branchCode: branch.code, financialYear: today.financialYear }, { session });
    const [doc] = await PurchaseOrder.create(
      [
        {
          orderNo,
          branchId,
          supplierId: supplier._id,
          supplier: supplierSnapshot(supplier),
          orderDate: today.businessDate,
          expectedDate: expectedDate ?? null,
          lines,
          totals: { quantity: sum(lines, (l) => l.quantity), weightMg: sum(lines, (l) => l.weightMg), amountPaise: sum(lines, (l) => l.amountPaise) },
          timeline: [{ status: 'open', at: today.now, by: userId, note: 'Order placed' }],
          note: note ?? null,
          createdBy: userId,
        },
      ],
      { session },
    );
    await recordAudit({ action: AUDIT_ACTIONS.CREATE, module: 'purchase', recordType: 'PurchaseOrder', recordId: doc._id, meta: { name: orderNo, supplier: supplier.companyName } }, { session });
    return doc;
  });
  return getPurchaseOrder(order._id);
}

export async function cancelPurchaseOrder(id, { reason }) {
  const { userId } = requireContext();
  const today = await todayContext();
  const res = await PurchaseOrder.updateOne(
    { _id: id, status: 'open', ...accessibleBranchFilter() },
    { $set: { status: 'cancelled' }, $push: { timeline: { status: 'cancelled', at: today.now, by: userId, note: reason } } },
  );
  if (!res.modifiedCount) throw ApiError.conflict('Only an open order can be cancelled', 'INVALID_STATE');
  await recordAudit({ action: AUDIT_ACTIONS.STATUS_CHANGE, module: 'purchase', recordType: 'PurchaseOrder', recordId: oid(id), meta: { reason }, changes: [{ field: 'status', from: 'open', to: 'cancelled' }] });
  return getPurchaseOrder(id);
}
