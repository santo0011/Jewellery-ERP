import { OPEN_ORDER_STATUSES, ORDER_STATUS, stoneWeightToMg } from '@jerp/shared';
import { productSchema } from '@jerp/shared/schemas';
import { withTransaction } from '../../config/db.js';
import { AUDIT_ACTIONS, recordAudit } from '../../core/audit/audit.service.js';
import { requireContext } from '../../core/context/requestContext.js';
import { PAYMENT_ACCOUNT } from '../../core/ledger/paymentAccounts.js';
import { priceLine } from '../../core/pricing/pricingEngine.js';
import { FileAsset } from '../../core/storage/fileAsset.model.js';
import { detectImageType, storage } from '../../core/storage/storage.service.js';
import { randomToken } from '../../utils/crypto.js';
import { postJournal } from '../../core/ledger/posting.service.js';
import { nextDocumentNo } from '../../core/numbering/numbering.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { todayContext } from '../../utils/businessDate.js';
import { searchFilter } from '../../utils/pagination.js';
import { Category } from '../categories/category.model.js';
import { Customer } from '../customers/customer.model.js';
import { accessibleBranchFilter, nameMaps, oid, pick, requireBranch } from '../inventory/inventory.helpers.js';
import { createOpeningStock } from '../inventory/inventory.service.js';
import { Product } from '../products/product.model.js';
import { createProduct } from '../products/product.service.js';
import { getApplicableRate } from '../rates/rate.service.js';
import { getSettings } from '../settings/settings.service.js';
import { Sale } from '../sales/sale.model.js';
import { Order } from './order.model.js';

const customerSnapshot = (c) => ({ id: c._id, code: c.code, name: c.name, mobile: c.mobile });

/** Advance received (positive) or refunded (negative): cash/bank against the customer-advances liability. */
async function postAdvance(order, { receiptNo, mode, amountPaise }, today, session) {
  const money = PAYMENT_ACCOUNT[mode];
  const amount = Math.abs(amountPaise);
  const party = { type: 'customer', id: order.customerId };
  const refund = amountPaise < 0;
  await postJournal(
    {
      voucherType: refund ? 'order_refund' : 'order_advance',
      date: today.now,
      businessDate: today.businessDate,
      financialYear: today.financialYear,
      narration: `${refund ? 'Advance refunded' : 'Advance received'} for order ${order.orderNo} (${order.customer.name})`,
      source: { docType: 'order', docId: order._id, docNo: receiptNo },
      lines: refund
        ? [{ account: 'customer_advances', debit: amount, branchId: order.branchId, party }, { account: money, credit: amount, branchId: order.branchId }]
        : [{ account: money, debit: amount, branchId: order.branchId }, { account: 'customer_advances', credit: amount, branchId: order.branchId, party }],
    },
    { session },
  );
}

async function receipt(order, branchCode, payment, today, session) {
  const { userId } = requireContext();
  const receiptNo = await nextDocumentNo({ prefix: 'RCPT', branchCode, financialYear: today.financialYear }, { session });
  const entry = { receiptNo, mode: payment.mode, amountPaise: payment.amountPaise, reference: payment.reference ?? null, at: today.now, by: userId };
  await postAdvance(order, entry, today, session);
  return entry;
}

async function findOrder(id, session) {
  const order = await Order.findOne({ _id: id, ...accessibleBranchFilter() }).session(session ?? null);
  if (!order) throw ApiError.notFound('Order');
  return order;
}

const assertOpen = (order) => {
  if (!OPEN_ORDER_STATUSES.includes(order.status)) throw ApiError.conflict(`Order ${order.orderNo} is ${order.status}`, 'INVALID_STATE');
};

export async function createOrder({ branchId, customerId, items, expectedDate, priority, advance, notes }) {
  const { userId } = requireContext();
  const branch = await requireBranch(branchId);
  const customer = await Customer.findOne({ _id: customerId, isDeleted: false }).lean();
  if (!customer) throw ApiError.badRequest('Select a customer', [{ path: 'customerId', message: 'Customer not found' }], 'VALIDATION_ERROR');
  if (customer.status === 'inactive') throw ApiError.badRequest(`${customer.name} is inactive. Activate the customer first.`, [{ path: 'customerId', message: 'Customer is inactive' }], 'VALIDATION_ERROR');
  const categoryIds = items.map((i) => i.categoryId).filter(Boolean);
  if (categoryIds.length && (await Category.countDocuments({ _id: { $in: categoryIds } })) !== new Set(categoryIds).size) {
    throw ApiError.badRequest('Some categories are not valid', [{ path: 'items', message: 'Select valid categories' }], 'VALIDATION_ERROR');
  }
  const today = await todayContext();
  if (expectedDate && expectedDate < today.businessDate) {
    throw ApiError.badRequest('Delivery date cannot be in the past', [{ path: 'expectedDate', message: 'Choose today or a later date' }], 'VALIDATION_ERROR');
  }

  const order = await withTransaction(async (session) => {
    const orderNo = await nextDocumentNo({ prefix: 'ORD', branchCode: branch.code, financialYear: today.financialYear }, { session });
    const estimatedPaise = items.reduce((s, i) => s + i.estimatedPaise * i.quantity, 0);
    const [doc] = await Order.create(
      [
        {
          orderNo,
          branchId: branch._id,
          customerId: customer._id,
          customer: customerSnapshot(customer),
          businessDate: today.businessDate,
          items,
          estimatedPaise,
          expectedDate: expectedDate ?? null,
          priority: priority ?? 'normal',
          notes: notes ?? null,
          timeline: [{ status: ORDER_STATUS.BOOKED, at: today.now, by: userId }],
          createdBy: userId,
        },
      ],
      { session },
    );
    if (advance) {
      doc.advances.push(await receipt(doc, branch.code, advance, today, session));
      doc.advancePaise = advance.amountPaise;
      await doc.save({ session });
    }
    await recordAudit({ action: AUDIT_ACTIONS.CREATE, module: 'order', recordType: 'Order', recordId: doc._id, meta: { name: orderNo, customer: customer.name, advance: doc.advancePaise } }, { session });
    return doc;
  });
  return getOrder(order._id);
}

export async function addAdvance(id, payment) {
  const order = await findOrder(id);
  assertOpen(order);
  const branch = await requireBranch(order.branchId, { active: false });
  const today = await todayContext();
  await withTransaction(async (session) => {
    const fresh = await findOrder(id, session);
    assertOpen(fresh);
    fresh.advances.push(await receipt(fresh, branch.code, payment, today, session));
    fresh.advancePaise += payment.amountPaise;
    await fresh.save({ session });
    await recordAudit({ action: AUDIT_ACTIONS.UPDATE, module: 'order', recordType: 'Order', recordId: fresh._id, meta: { name: fresh.orderNo, advance: payment.amountPaise } }, { session });
  });
  return getOrder(id);
}

export async function setOrderStatus(id, { status, note }) {
  const { userId } = requireContext();
  const order = await findOrder(id);
  assertOpen(order);
  if (order.status === status) return getOrder(id);
  const from = order.status;
  order.status = status;
  order.timeline.push({ status, at: new Date(), by: userId, note: note ?? null });
  await order.save();
  await recordAudit({ action: AUDIT_ACTIONS.STATUS_CHANGE, module: 'order', recordType: 'Order', recordId: order._id, meta: { name: order.orderNo }, changes: [{ field: 'status', from, to: status }] });
  return getOrder(id);
}

export async function cancelOrder(id, { reason, refundMode }) {
  const { userId } = requireContext();
  const order = await findOrder(id);
  assertOpen(order);
  if (order.advancePaise > 0 && !refundMode) {
    throw ApiError.badRequest('Choose how the advance is refunded', [{ path: 'refundMode', message: 'Select a refund mode' }], 'VALIDATION_ERROR');
  }
  const branch = await requireBranch(order.branchId, { active: false });
  const today = await todayContext();
  await withTransaction(async (session) => {
    const fresh = await findOrder(id, session);
    assertOpen(fresh);
    if (fresh.advancePaise > 0) {
      fresh.advances.push(await receipt(fresh, branch.code, { mode: refundMode, amountPaise: -fresh.advancePaise, reference: 'Refund on cancellation' }, today, session));
      fresh.advancePaise = 0;
    }
    fresh.status = ORDER_STATUS.CANCELLED;
    fresh.cancelledAt = today.now;
    fresh.cancelReason = reason;
    fresh.timeline.push({ status: ORDER_STATUS.CANCELLED, at: today.now, by: userId, note: reason });
    await fresh.save({ session });
    await recordAudit({ action: AUDIT_ACTIONS.CANCEL, module: 'order', recordType: 'Order', recordId: fresh._id, meta: { name: fresh.orderNo, reason } }, { session });
  });
  return getOrder(id);
}

export async function listOrders({ page, limit, q, status, branchId, customerId }) {
  const filter = { ...accessibleBranchFilter(), ...searchFilter(q, ['orderNo', 'customer.name', 'customer.mobile', 'items.description', 'invoiceNo']) };
  if (status === 'open') filter.status = { $in: OPEN_ORDER_STATUSES };
  else if (status) filter.status = status;
  if (branchId) filter.branchId = oid(branchId);
  if (customerId) filter.customerId = oid(customerId);
  const [rows, total, counts] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Order.countDocuments(filter),
    Order.aggregate([{ $match: { ...accessibleBranchFilter(), ...(branchId && { branchId: oid(branchId) }) } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);
  const maps = await nameMaps({ branchIds: rows.map((o) => o.branchId) });
  const { businessDate } = await todayContext();
  return {
    items: rows.map((o) => ({
      id: o._id,
      orderNo: o.orderNo,
      status: o.status,
      createdAt: o.createdAt,
      branch: pick(maps.branches, o.branchId),
      customer: o.customer,
      itemCount: o.items.length,
      summary: o.items.map((i) => i.description).join(', '),
      estimatedPaise: o.estimatedPaise,
      advancePaise: o.advancePaise,
      expectedDate: o.expectedDate,
      priority: o.priority ?? 'normal',
      overdue: Boolean(o.expectedDate && o.expectedDate < businessDate && OPEN_ORDER_STATUSES.includes(o.status)),
      invoiceNo: o.invoiceNo,
    })),
    meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)), counts: Object.fromEntries(counts.map((c) => [c._id, c.count])), summary: await orderSummary(branchId, businessDate) },
  };
}

/** Header cards: open orders, ready to hand over, overdue, and customer advances held on open orders. */
async function orderSummary(branchId, today) {
  const [r] = await Order.aggregate([
    { $match: { ...accessibleBranchFilter(), ...(branchId && { branchId: oid(branchId) }), status: { $in: OPEN_ORDER_STATUSES } } },
    {
      $group: {
        _id: null,
        open: { $sum: 1 },
        ready: { $sum: { $cond: [{ $eq: ['$status', 'ready'] }, 1, 0] } },
        overdue: { $sum: { $cond: [{ $and: [{ $ne: ['$expectedDate', null] }, { $lt: ['$expectedDate', today] }] }, 1, 0] } },
        advancePaise: { $sum: '$advancePaise' },
        estimatedPaise: { $sum: '$estimatedPaise' },
      },
    },
  ]);
  return { open: r?.open ?? 0, ready: r?.ready ?? 0, overdue: r?.overdue ?? 0, advancePaise: r?.advancePaise ?? 0, estimatedPaise: r?.estimatedPaise ?? 0 };
}

export async function getOrder(id) {
  const o = (await findOrder(id)).toObject();
  const userIds = [o.createdBy, ...o.advances.map((a) => a.by), ...o.timeline.map((t) => t.by)];
  const sale = o.saleId ? await Sale.findById(o.saleId).select('invoiceNo status createdAt totals payments advanceAdjustedPaise').lean() : null;
  const [maps, categories, products] = await Promise.all([
    nameMaps({ branchIds: [o.branchId], userIds }),
    Category.find({ _id: { $in: o.items.map((i) => i.categoryId).filter(Boolean) } }).select('name').lean(),
    Product.find({ _id: { $in: o.items.map((i) => i.productId).filter(Boolean) } }).select('sku status grossWeightMg huid').lean(),
  ]);
  const categoryName = new Map(categories.map((c) => [String(c._id), c.name]));
  const productById = new Map(products.map((p) => [String(p._id), { id: p._id, sku: p.sku, status: p.status, grossWeightMg: p.grossWeightMg, huid: p.huid }]));
  const { businessDate } = await todayContext();
  return {
    id: o._id,
    orderNo: o.orderNo,
    status: o.status,
    createdAt: o.createdAt,
    businessDate: o.businessDate,
    branch: pick(maps.branches, o.branchId),
    customer: o.customer,
    items: o.items.map((i) => ({ ...i, categoryName: i.categoryId ? (categoryName.get(String(i.categoryId)) ?? null) : null, product: i.productId ? (productById.get(String(i.productId)) ?? null) : null })),
    estimatedPaise: o.estimatedPaise,
    advancePaise: o.advancePaise,
    balancePaise: Math.max(0, o.estimatedPaise - o.advancePaise),
    expectedDate: o.expectedDate,
    priority: o.priority ?? 'normal',
    images: (o.images ?? []).map((i) => String(i.fileId)),
    overdue: Boolean(o.expectedDate && o.expectedDate < businessDate && OPEN_ORDER_STATUSES.includes(o.status)),
    advances: o.advances.map((a) => ({ id: a._id, receiptNo: a.receiptNo, mode: a.mode, amountPaise: a.amountPaise, reference: a.reference, at: a.at, by: pick(maps.users, a.by) })),
    timeline: o.timeline.map((t) => ({ status: t.status, at: t.at, note: t.note, by: pick(maps.users, t.by) })),
    notes: o.notes,
    saleId: o.saleId,
    invoiceNo: o.invoiceNo,
    // The delivery bill: its total, what was paid then, and what is still owed (customer credit).
    invoice: sale && {
      id: sale._id,
      invoiceNo: sale.invoiceNo,
      status: sale.status,
      createdAt: sale.createdAt,
      grandTotalPaise: sale.totals.grandTotalPaise,
      advanceAdjustedPaise: sale.advanceAdjustedPaise ?? 0,
      payments: sale.payments.map((p) => ({ mode: p.mode, amountPaise: p.amountPaise, reference: p.reference })),
      paidPaise: sale.payments.filter((p) => p.mode !== 'credit').reduce((sum, p) => sum + p.amountPaise, 0),
      duePaise: sale.payments.filter((p) => p.mode === 'credit').reduce((sum, p) => sum + p.amountPaise, 0),
    },
    deliveredAt: o.deliveredAt,
    cancelledAt: o.cancelledAt,
    cancelReason: o.cancelReason,
    createdBy: pick(maps.users, o.createdBy),
  };
}

/** Today's price for what the customer wants (the bill's pricing engine, GST included), before booking. */
export async function estimateOrder({ branchId, items }) {
  await requireBranch(branchId);
  const [settings, today] = await Promise.all([getSettings(), todayContext()]);
  const lines = [];
  for (const item of items) {
    const fixed = item.pricingMode === 'fixed';
    let rate = null;
    if (!fixed) {
      if (!item.purity || !item.approxWeightMg) {
        lines.push({ estimatedPaise: null, reason: 'Enter purity and weight to estimate' });
        continue;
      }
      rate = await getApplicableRate(item.metal, item.purity, today.now);
      if (!rate) {
        lines.push({ estimatedPaise: null, reason: `No ${item.metal} ${item.purity} rate entered` });
        continue;
      }
    }
    const stoneMg = (item.stones ?? []).reduce((sum, st) => sum + stoneWeightToMg(st), 0);
    const breakdown = priceLine(
      {
        pricingMode: item.pricingMode ?? 'rate_based',
        stockType: 'tagged',
        quantity: 1,
        netWeightMg: Math.max(0, (item.approxWeightMg ?? 0) - stoneMg),
        wastage: item.wastage ?? { mode: 'none', value: 0 },
        making: item.making ?? { type: 'fixed', value: 0 },
        stones: (item.stones ?? []).map((st) => ({ type: st.type, weight: st.weight, weightUnit: st.weightUnit, ratePaise: st.ratePaise ?? 0 })),
        otherChargePaise: item.otherChargePaise ?? 0,
        fixedPricePaise: item.fixedPricePaise ?? null,
        discountPaise: 0,
      },
      { ratePerGramPaise: rate?.ratePerGramPaise ?? null, tax: settings.tax },
    );
    lines.push({
      estimatedPaise: breakdown.totalPaise,
      totalPaise: breakdown.totalPaise * (item.quantity ?? 1),
      ratePerGramPaise: rate?.ratePerGramPaise ?? null,
      rateDate: rate?.businessDate ?? null,
      rateIsToday: rate ? rate.businessDate === today.businessDate : null,
      breakdown,
    });
  }
  return { items: lines, totalPaise: lines.reduce((sum, l) => sum + (l.totalPaise ?? 0), 0) };
}

const MAX_ORDER_IMAGES = 6;

export async function addOrderImage(id, file) {
  const { organisationId, userId } = requireContext();
  const order = await findOrder(id);
  if (order.images.length >= MAX_ORDER_IMAGES) throw ApiError.badRequest(`An order can have up to ${MAX_ORDER_IMAGES} photos`, undefined, 'TOO_MANY_IMAGES');
  const type = detectImageType(file.buffer);
  if (!type) throw ApiError.badRequest('Photos must be PNG, JPEG or WebP', undefined, 'UNSUPPORTED_FILE');
  const key = `${organisationId}/orders/${order._id}/${randomToken(12)}.${type.ext}`;
  await storage.put(key, file.buffer);
  const asset = await FileAsset.create({ key, purpose: 'order_image', mimeType: type.mime, size: file.size, originalName: file.originalname?.slice(0, 200) ?? null, uploadedBy: userId });
  order.images.push({ fileId: asset._id });
  await order.save();
  return getOrder(id);
}

export async function removeOrderImage(id, fileId) {
  const order = await findOrder(id);
  const index = order.images.findIndex((i) => String(i.fileId) === String(fileId));
  if (index === -1) throw ApiError.notFound('Photo');
  order.images.splice(index, 1);
  await order.save();
  const asset = await FileAsset.findByIdAndDelete(fileId).lean();
  if (asset) await storage.remove(asset.key);
  return getOrder(id);
}

const JEWELLERY_TYPE_FOR_METAL = { gold: 'plain_gold', silver: 'silver', platinum: 'platinum' };

/**
 * The karigar has made the piece for line `index`: tag it as a product at the order's branch and put it in stock,
 * so it can be scanned onto the bill. The product is linked to the line straight away, so a retry after a failed
 * stock step finishes the same product instead of making another.
 */
export async function finishOrderItem(id, index, input) {
  const order = await findOrder(id);
  assertOpen(order);
  const item = order.items[index];
  if (!item) throw ApiError.notFound('Order item');

  let product = item.productId ? await Product.findById(item.productId).lean() : null;
  if (product && product.status !== 'draft') throw ApiError.conflict(`This item is already finished as ${product.sku}`, 'ALREADY_FINISHED');

  if (!product) {
    const categoryId = input.categoryId ?? item.categoryId ?? (await Category.findOne({ name: 'Custom Jewellery' }).select('_id').lean())?._id;
    if (!categoryId) throw ApiError.badRequest('Select a category for the finished piece', [{ path: 'categoryId', message: 'Select a category' }], 'VALIDATION_ERROR');
    const purity = input.purity ?? item.purity;
    if (!purity) throw ApiError.badRequest('Select the purity of the finished piece', [{ path: 'purity', message: 'Select a purity' }], 'VALIDATION_ERROR');
    const created = await createProduct(
      productSchema.parse({
        name: input.name || item.description,
        categoryId: String(categoryId),
        jewelleryType: item.jewelleryType ?? JEWELLERY_TYPE_FOR_METAL[item.metal] ?? 'plain_gold',
        metal: item.metal,
        purity,
        grossWeightMg: input.grossWeightMg,
        // The finished piece carries what was agreed on the order: stones, extra charges and how it is priced.
        stones: item.stones ?? [],
        otherChargePaise: item.otherChargePaise ?? 0,
        pricingMode: item.pricingMode ?? 'rate_based',
        fixedPricePaise: item.pricingMode === 'fixed' ? item.fixedPricePaise : null,
        wastage: input.wastage,
        making: input.making,
        huid: input.huid ?? item.huid ?? null,
        costPricePaise: input.costPricePaise ?? null,
        branchId: String(order.branchId),
        description: [item.notes, item.size && `Size ${item.size}`, `Made for order ${order.orderNo} (${order.customer.name})`].filter(Boolean).join(' · '),
        tags: ['order'],
      }),
    );
    product = { _id: created.id, sku: created.sku };
    await Order.updateOne({ _id: order._id }, { $set: { [`items.${index}.productId`]: created.id } });
  }

  await createOpeningStock({ branchId: String(order.branchId), productIds: [String(product._id)], metalLines: [], note: `Made for order ${order.orderNo}` });
  await recordAudit({ action: AUDIT_ACTIONS.UPDATE, module: 'order', recordType: 'Order', recordId: order._id, meta: { name: order.orderNo, finished: product.sku } });
  return getOrder(id);
}

/** Used by billing: the open order being billed, checked against the branch and customer of the bill. */
export async function orderForBilling(orderId, { branchId, customerId }, session) {
  const order = await Order.findOne({ _id: orderId, ...accessibleBranchFilter() }).session(session ?? null).lean();
  if (!order) throw ApiError.badRequest('Order not found', [{ path: 'orderId', message: 'Order not found' }], 'VALIDATION_ERROR');
  if (!OPEN_ORDER_STATUSES.includes(order.status)) throw new ApiError(422, 'SALE_BLOCKED', `Order ${order.orderNo} is ${order.status} and cannot be billed`, [{ path: 'orderId', message: 'Order is not open' }]);
  if (String(order.branchId) !== String(branchId)) throw new ApiError(422, 'SALE_BLOCKED', `Order ${order.orderNo} belongs to another branch`, [{ path: 'orderId', message: 'Order is at another branch' }]);
  if (customerId && String(order.customerId) !== String(customerId)) throw new ApiError(422, 'SALE_BLOCKED', `Order ${order.orderNo} is for ${order.customer.name}`, [{ path: 'orderId', message: 'Order is for another customer' }]);
  return order;
}
