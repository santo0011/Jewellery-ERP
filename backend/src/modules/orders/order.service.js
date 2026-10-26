import { fineWeightMg, OPEN_ORDER_STATUSES, ORDER_STATUS, stoneWeightToMg } from '@jerp/shared';
import { productSchema } from '@jerp/shared/schemas';
import { withTransaction } from '../../config/db.js';
import { AUDIT_ACTIONS, recordAudit } from '../../core/audit/audit.service.js';
import { requireContext } from '../../core/context/requestContext.js';
import { PAYMENT_ACCOUNT } from '../../core/ledger/paymentAccounts.js';
import { priceLine } from '../../core/pricing/pricingEngine.js';
import { MetalStock } from '../../core/stock/metalStock.model.js';
import { moveMetal, moveProducts } from '../../core/stock/stockLedger.service.js';
import { FileAsset } from '../../core/storage/fileAsset.model.js';
import { detectImageType, storage } from '../../core/storage/storage.service.js';
import { randomToken } from '../../utils/crypto.js';
import { postJournal } from '../../core/ledger/posting.service.js';
import { nextDocumentNo } from '../../core/numbering/numbering.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { todayContext } from '../../utils/businessDate.js';
import { searchFilter } from '../../utils/pagination.js';
import { Category } from '../categories/category.model.js';
import { CUSTOMER_ADVANCE_MODE, customerAdvanceLeft } from '../customers/customerAdvance.js';
import { Customer } from '../customers/customer.model.js';
import { customerDues } from '../customers/customerReceipt.service.js';
import { accessibleBranchFilter, canSeeCost, nameMaps, oid, pick, requireBranch, viewBranchFor } from '../inventory/inventory.helpers.js';
import { Product } from '../products/product.model.js';
import { insertPieces, preparePieces } from '../products/product.service.js';
import { getApplicableRate } from '../rates/rate.service.js';
import { getSettings } from '../settings/settings.service.js';
import { Sale, billDue } from '../sales/sale.model.js';
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

/**
 * Moves advance the customer paid before (held against their account) onto the order, or back (negative amount).
 * No money changes hands. New orders no longer take it (it is chosen on the delivery bill); orders booked when they
 * did give it back with this when cancelled. Returns the entry for `advances`.
 */
async function moveCustomerAdvance(order, amountPaise, branchCode, today, session) {
  const { userId } = requireContext();
  const receiptNo = await nextDocumentNo({ prefix: 'ADJ', branchCode, financialYear: today.financialYear }, { session });
  const amount = Math.abs(amountPaise);
  const party = { type: 'customer', id: order.customerId };
  const back = amountPaise < 0;
  await postJournal(
    {
      voucherType: 'order_advance',
      date: today.now,
      businessDate: today.businessDate,
      financialYear: today.financialYear,
      narration: back ? `Advance from order ${order.orderNo} back to ${order.customer.name}'s account` : `Earlier advance of ${order.customer.name} adjusted on order ${order.orderNo}`,
      source: { docType: 'order', docId: order._id, docNo: receiptNo },
      lines: back
        ? [{ account: 'customer_advances', debit: amount, branchId: order.branchId, party }, { account: 'sundry_debtors', credit: amount, branchId: order.branchId, party }]
        : [{ account: 'sundry_debtors', debit: amount, branchId: order.branchId, party }, { account: 'customer_advances', credit: amount, branchId: order.branchId, party }],
    },
    { session },
  );
  return { receiptNo, mode: CUSTOMER_ADVANCE_MODE, amountPaise, reference: back ? 'Back to customer advance' : 'Earlier advance adjusted', at: today.now, by: userId };
}

async function receipt(order, branchCode, payment, today, session) {
  const { userId } = requireContext();
  const receiptNo = await nextDocumentNo({ prefix: 'RCPT', branchCode, financialYear: today.financialYear }, { session });
  const entry = { receiptNo, mode: payment.mode, amountPaise: payment.amountPaise, reference: payment.reference ?? null, at: today.now, by: userId };
  await postAdvance(order, entry, today, session);
  return entry;
}

// ---------------------------------------------------------------- the customer's own gold

const CUSTOMER_GOLD = 'customer_gold';
const metalKey = (l) => `${l.metal}|${l.purity}`;
const grams = (mg) => (mg / 1000).toFixed(3);

/**
 * The customer's gold on this order, by metal and purity: what was received (and not given back), what has gone into
 * pieces, and what is left — with its value (as credited to the customer) shared out by weight.
 */
export function customerGoldBalance(order) {
  const by = new Map();
  const row = (l) => {
    const key = metalKey(l);
    if (!by.has(key)) by.set(key, { metal: l.metal, purity: l.purity, receivedMg: 0, receivedPaise: 0, usedMg: 0, usedPaise: 0 });
    return by.get(key);
  };
  for (const l of order.customerMetal ?? []) {
    if (l.returnedAt) continue;
    const r = row(l);
    r.receivedMg += l.netWeightMg;
    r.receivedPaise += l.valuePaise;
  }
  for (const item of order.items) {
    for (const m of item.make?.materials ?? []) {
      if (m.source !== 'customer') continue;
      const r = row(m);
      r.usedMg += m.grossWeightMg;
      r.usedPaise += m.valuePaise;
    }
  }
  // Given back when the order was cancelled.
  for (const g of order.customerMetalReturned ?? []) {
    const r = row(g);
    r.returnedMg = (r.returnedMg ?? 0) + g.netWeightMg;
    r.returnedPaise = (r.returnedPaise ?? 0) + g.valuePaise;
  }
  return [...by.values()].map((r) => ({ ...r, returnedMg: r.returnedMg ?? 0, leftMg: r.receivedMg - r.usedMg - (r.returnedMg ?? 0), leftPaise: r.receivedPaise - r.usedPaise - (r.returnedPaise ?? 0) }));
}

/**
 * Takes the customer's gold in: it goes into the branch's raw stock as "customer gold", valued at the day's rate, and
 * that value is held for the customer as an advance (so the delivery bill deducts it, like a cash advance).
 */
async function receiveCustomerMetal(order, branchCode, lines, today, session) {
  const { userId } = requireContext();
  for (const [i, l] of lines.entries()) {
    const rate = l.ratePerGramPaise ?? (await getApplicableRate(l.metal, l.purity, today.now, { session }))?.ratePerGramPaise;
    if (!rate) throw ApiError.badRequest(`No ${l.metal} ${l.purity} rate for today. Enter the rate per gram.`, [{ path: `customerMetal.${i}.ratePerGramPaise`, message: 'Enter the rate' }], 'VALIDATION_ERROR');
    const netWeightMg = l.grossWeightMg - (l.lessWeightMg ?? 0);
    const valuePaise = Math.round((netWeightMg * rate) / 1000);
    const receiptNo = await nextDocumentNo({ prefix: 'RCPT', branchCode, financialYear: today.financialYear }, { session });
    const source = { docType: 'order', docId: order._id, docNo: receiptNo };
    const why = `${order.customer.name}'s ${l.metal} for order ${order.orderNo}`;
    await moveMetal({ type: 'order_metal_in', branchId: order.branchId, line: { metal: l.metal, purity: l.purity, kind: CUSTOMER_GOLD, grossWeightMg: netWeightMg, valuePaise, direction: 'in' }, source, businessDate: today.businessDate, note: why }, { session });
    await postJournal(
      {
        voucherType: 'order_advance',
        date: today.now,
        businessDate: today.businessDate,
        financialYear: today.financialYear,
        narration: `Received ${why} (${grams(netWeightMg)} g)`,
        source,
        lines: [
          { account: 'inventory', debit: valuePaise, branchId: order.branchId },
          { account: 'customer_advances', credit: valuePaise, branchId: order.branchId, party: { type: 'customer', id: order.customerId } },
        ],
      },
      { session },
    );
    order.customerMetal.push({ receiptNo, description: l.description ?? null, metal: l.metal, purity: l.purity, grossWeightMg: l.grossWeightMg, lessWeightMg: l.lessWeightMg ?? 0, netWeightMg, fineWeightMg: fineWeightMg(netWeightMg, l.purity), ratePerGramPaise: rate, valuePaise, at: today.now, by: userId });
    order.advances.push({ receiptNo, mode: 'gold', amountPaise: valuePaise, reference: `${grams(netWeightMg)} g ${l.metal} ${l.purity}`, at: today.now, by: userId });
    order.advancePaise += valuePaise;
  }
}

/** Gives customer gold back: out of the raw stock, its value off the advance. */
async function returnCustomerMetal(order, { metal, purity, netWeightMg, valuePaise }, reason, branchCode, today, session) {
  const { userId } = requireContext();
  const receiptNo = await nextDocumentNo({ prefix: 'RCPT', branchCode, financialYear: today.financialYear }, { session });
  const source = { docType: 'order', docId: order._id, docNo: receiptNo };
  try {
    await moveMetal({ type: 'order_metal_return', branchId: order.branchId, line: { metal, purity, kind: CUSTOMER_GOLD, grossWeightMg: netWeightMg, valuePaise, direction: 'out' }, source, businessDate: today.businessDate, note: reason }, { session });
  } catch (err) {
    if (err.code !== 'INSUFFICIENT_STOCK') throw err;
    throw ApiError.conflict(`The customer's ${metal} on ${order.orderNo} is no longer in stock`, 'CUSTOMER_GOLD_USED');
  }
  await postJournal(
    {
      voucherType: 'order_refund',
      date: today.now,
      businessDate: today.businessDate,
      financialYear: today.financialYear,
      narration: `${order.customer.name}'s ${metal} given back (${grams(netWeightMg)} g) — order ${order.orderNo}`,
      source,
      lines: [
        { account: 'customer_advances', debit: valuePaise, branchId: order.branchId, party: { type: 'customer', id: order.customerId } },
        { account: 'inventory', credit: valuePaise, branchId: order.branchId },
      ],
    },
    { session },
  );
  order.advances.push({ receiptNo, mode: 'gold', amountPaise: -valuePaise, reference: `${grams(netWeightMg)} g ${metal} ${purity} given back`, at: today.now, by: userId });
  order.advancePaise -= valuePaise;
}

/** More of the customer's gold received after booking. */
export async function addCustomerMetal(id, { lines }) {
  const order = await findOrder(id);
  assertOpen(order);
  const branch = await requireBranch(order.branchId, { active: false });
  const today = await todayContext();
  await withTransaction(async (session) => {
    const fresh = await findOrder(id, session);
    assertOpen(fresh);
    const had = new Set(fresh.customerMetal.map((l) => String(l._id)));
    await receiveCustomerMetal(fresh, branch.code, lines, today, session);
    await fresh.save({ session });
    const added = fresh.customerMetal.filter((l) => !had.has(String(l._id))).map((l) => String(l._id));
    await recordAudit(
      { action: AUDIT_ACTIONS.UPDATE, module: 'order', recordType: 'Order', recordId: fresh._id, meta: { name: fresh.orderNo, customerGold: lines.length }, undo: { type: 'order.customerMetal', branchId: fresh.branchId, label: `${fresh.orderNo} — customer gold`, data: { lineIds: added } } },
      { session },
    );
  });
  return getOrder(id);
}

/** A customer gold entry made by mistake: given back, as long as that much of it has not gone into a piece. */
export async function removeCustomerMetal(id, lineId) {
  const order = await findOrder(id);
  assertOpen(order);
  const branch = await requireBranch(order.branchId, { active: false });
  const today = await todayContext();
  await withTransaction(async (session) => {
    const fresh = await findOrder(id, session);
    assertOpen(fresh);
    const line = fresh.customerMetal.id(lineId);
    if (!line || line.returnedAt) throw ApiError.notFound('Customer gold entry');
    const left = customerGoldBalance(fresh).find((r) => r.metal === line.metal && r.purity === line.purity);
    if (!left || left.leftMg < line.netWeightMg) throw ApiError.conflict('Part of this gold is already in a finished piece, so it cannot be removed', 'CUSTOMER_GOLD_USED');
    await returnCustomerMetal(fresh, line, `Entry ${line.receiptNo} removed`, branch.code, today, session);
    line.returnedAt = today.now;
    await fresh.save({ session });
    await recordAudit({ action: AUDIT_ACTIONS.UPDATE, module: 'order', recordType: 'Order', recordId: fresh._id, meta: { name: fresh.orderNo, customerGoldRemoved: line.receiptNo } }, { session });
  });
  return getOrder(id);
}

/** An order's editable details as the edit form sends them (for Undo). */
export const orderFormValues = (o) => ({
  items: o.items.map((i) => {
    const { _id, productId, ...rest } = i.toObject?.() ?? i; // eslint-disable-line no-unused-vars
    return JSON.parse(JSON.stringify(rest));
  }),
  expectedDate: o.expectedDate ?? null,
  priority: o.priority ?? 'normal',
  notes: o.notes ?? null,
});

/** Gives back one advance receipt taken by mistake (Undo): a refund receipt for the same amount, paid back the same way. */
export async function refundAdvanceReceipt(id, receiptNo, reason) {
  const order = await findOrder(id);
  assertOpen(order);
  const branch = await requireBranch(order.branchId, { active: false });
  const today = await todayContext();
  await withTransaction(async (session) => {
    const fresh = await findOrder(id, session);
    assertOpen(fresh);
    const paid = fresh.advances.find((a) => a.receiptNo === receiptNo && a.amountPaise > 0 && a.mode !== CUSTOMER_ADVANCE_MODE);
    if (!paid) throw ApiError.notFound('Advance receipt');
    if (fresh.advances.some((a) => a.reference === `Refund of ${receiptNo}`)) throw ApiError.conflict(`${receiptNo} was already refunded`, 'INVALID_STATE');
    if (fresh.advancePaise < paid.amountPaise) throw ApiError.conflict('Part of the advance is already used', 'INVALID_STATE');
    fresh.advances.push(await receipt(fresh, branch.code, { mode: paid.mode, amountPaise: -paid.amountPaise, reference: `Refund of ${receiptNo}` }, today, session));
    fresh.advancePaise -= paid.amountPaise;
    await fresh.save({ session });
    await recordAudit({ action: AUDIT_ACTIONS.UPDATE, module: 'order', recordType: 'Order', recordId: fresh._id, meta: { name: fresh.orderNo, advanceRefunded: receiptNo, reason } }, { session });
  });
  return getOrder(id);
}

async function findOrder(id, session) {
  const order = await Order.findOne({ _id: id, ...accessibleBranchFilter() }).session(session ?? null);
  if (!order) throw ApiError.notFound('Order');
  return order;
}

const assertOpen = (order) => {
  if (!OPEN_ORDER_STATUSES.includes(order.status)) throw ApiError.conflict(`Order ${order.orderNo} is ${order.status}`, 'INVALID_STATE');
};

export async function createOrder({ branchId, customerId, items, expectedDate, priority, advance, customerMetal = [], notes }) {
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
    }
    if (customerMetal.length) await receiveCustomerMetal(doc, branch.code, customerMetal, today, session);
    // The customer's advance or due from before is not touched here: it is settled on the delivery bill, if chosen.
    if (advance || customerMetal.length) await doc.save({ session });
    await recordAudit(
      { action: AUDIT_ACTIONS.CREATE, module: 'order', recordType: 'Order', recordId: doc._id, meta: { name: orderNo, customer: customer.name, advance: doc.advancePaise, customerGold: customerMetal.length }, undo: { type: 'order.create', branchId: branch._id } },
      { session },
    );
    return doc;
  });
  return getOrder(order._id);
}

/** Orders can be changed until they are ready (booked or in progress). Finished pieces stay on their lines. */
export const EDITABLE_ORDER_STATUSES = [ORDER_STATUS.BOOKED, ORDER_STATUS.IN_PROGRESS];

export async function updateOrder(id, { items, expectedDate, priority, notes }) {
  const order = await findOrder(id);
  if (!EDITABLE_ORDER_STATUSES.includes(order.status)) {
    throw ApiError.conflict(`Order ${order.orderNo} is ${order.status.replace('_', ' ')} and can no longer be edited`, 'INVALID_STATE');
  }
  const categoryIds = items.map((i) => i.categoryId).filter(Boolean);
  if (categoryIds.length && (await Category.countDocuments({ _id: { $in: categoryIds } })) !== new Set(categoryIds).size) {
    throw ApiError.badRequest('Some categories are not valid', [{ path: 'items', message: 'Select valid categories' }], 'VALIDATION_ERROR');
  }
  const finishedLast = order.items.reduce((last, i, n) => (i.productId ? n : last), -1);
  if (items.length <= finishedLast) {
    throw ApiError.badRequest('A finished item cannot be removed from the order', [{ path: 'items', message: 'Keep the finished items' }], 'VALIDATION_ERROR');
  }
  const today = await todayContext();
  if (expectedDate && expectedDate !== order.expectedDate && expectedDate < today.businessDate) {
    throw ApiError.badRequest('Delivery date cannot be in the past', [{ path: 'expectedDate', message: 'Choose today or a later date' }], 'VALIDATION_ERROR');
  }

  await withTransaction(async (session) => {
    const fresh = await findOrder(id, session);
    if (!EDITABLE_ORDER_STATUSES.includes(fresh.status)) throw ApiError.conflict(`Order ${fresh.orderNo} changed while editing. Try again.`, 'CONCURRENT_UPDATE');
    const before = { estimatedPaise: fresh.estimatedPaise, items: fresh.items.length, expectedDate: fresh.expectedDate, priority: fresh.priority };
    const formBefore = orderFormValues(fresh);
    fresh.items = items.map((i, n) => ({ ...i, productId: fresh.items[n]?.productId ?? null }));
    fresh.estimatedPaise = items.reduce((s, i) => s + i.estimatedPaise * i.quantity, 0);
    fresh.expectedDate = expectedDate ?? null;
    fresh.priority = priority ?? 'normal';
    fresh.notes = notes ?? null;
    await fresh.save({ session });
    const after = { estimatedPaise: fresh.estimatedPaise, items: fresh.items.length, expectedDate: fresh.expectedDate, priority: fresh.priority };
    const changes = Object.keys(after).filter((k) => before[k] !== after[k]).map((field) => ({ field, from: before[field] ?? null, to: after[field] ?? null }));
    await recordAudit({ action: AUDIT_ACTIONS.UPDATE, module: 'order', recordType: 'Order', recordId: fresh._id, changes, meta: { name: fresh.orderNo }, undo: { type: 'order.update', branchId: fresh.branchId, data: { before: formBefore, after: orderFormValues(fresh) } } }, { session });
  });
  return getOrder(id);
}

export async function addAdvance(id, payment) {
  const order = await findOrder(id);
  assertOpen(order);
  const branch = await requireBranch(order.branchId, { active: false });
  const today = await todayContext();
  await withTransaction(async (session) => {
    const fresh = await findOrder(id, session);
    assertOpen(fresh);
    const paid = await receipt(fresh, branch.code, payment, today, session);
    fresh.advances.push(paid);
    fresh.advancePaise += payment.amountPaise;
    await fresh.save({ session });
    await recordAudit(
      { action: AUDIT_ACTIONS.UPDATE, module: 'order', recordType: 'Order', recordId: fresh._id, meta: { name: fresh.orderNo, advance: payment.amountPaise }, undo: { type: 'order.advance', branchId: fresh.branchId, label: `${fresh.orderNo} — advance ${paid.receiptNo}`, data: { receiptNo: paid.receiptNo, amountPaise: paid.amountPaise } } },
      { session },
    );
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
  await recordAudit({ action: AUDIT_ACTIONS.STATUS_CHANGE, module: 'order', recordType: 'Order', recordId: order._id, meta: { name: order.orderNo }, changes: [{ field: 'status', from, to: status }], undo: { type: 'order.status', branchId: order.branchId, data: { from, to: status } } });
  return getOrder(id);
}

export async function cancelOrder(id, { reason, refundMode }) {
  const { userId } = requireContext();
  const order = await findOrder(id);
  assertOpen(order);
  // The customer's gold not yet in a piece goes back as gold; the rest of the advance is refunded in money.
  const goldBack = customerGoldBalance(order).filter((r) => r.leftMg > 0);
  // Advance from before goes back to the customer's account, not out of the till.
  if (order.advancePaise - goldBack.reduce((n, r) => n + r.leftPaise, 0) - (order.customerAdvanceUsedPaise ?? 0) > 0 && !refundMode) {
    throw ApiError.badRequest('Choose how the advance is refunded', [{ path: 'refundMode', message: 'Select a refund mode' }], 'VALIDATION_ERROR');
  }
  const branch = await requireBranch(order.branchId, { active: false });
  const today = await todayContext();
  await withTransaction(async (session) => {
    const fresh = await findOrder(id, session);
    assertOpen(fresh);
    for (const r of customerGoldBalance(fresh).filter((x) => x.leftMg > 0)) {
      await returnCustomerMetal(fresh, { metal: r.metal, purity: r.purity, netWeightMg: r.leftMg, valuePaise: r.leftPaise }, `Order ${fresh.orderNo} cancelled`, branch.code, today, session);
      fresh.customerMetalReturned.push({ metal: r.metal, purity: r.purity, netWeightMg: r.leftMg, valuePaise: r.leftPaise, at: today.now });
    }
    // Pieces already made for it are the shop's to sell now.
    await Product.updateMany({ orderId: fresh._id }, { $set: { orderId: null } }, { session });
    const earlier = Math.min(fresh.customerAdvanceUsedPaise ?? 0, Math.max(0, fresh.advancePaise));
    if (earlier > 0) {
      fresh.advances.push(await moveCustomerAdvance(fresh, -earlier, branch.code, today, session));
      fresh.advancePaise -= earlier;
    }
    fresh.customerAdvanceUsedPaise = 0;
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

export async function listOrders({ page, limit, q, status, branchId: chosen, customerId }) {
  const branchId = chosen ?? (customerId ? null : await viewBranchFor('order')); // navbar filter (a customer's orders: all)
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

/**
 * The customer's balance from before, shown on a new order: advance still free and dues on earlier bills. Neither
 * touches the order; either can be chosen on the delivery bill.
 */
export async function customerBalance(customerId) {
  const { customer, openingDuePaise, bills, totalDuePaise } = await customerDues(customerId);
  return { advanceLeftPaise: Math.max(0, await customerAdvanceLeft(customer)), duePaise: totalDuePaise, openingDuePaise, dueBills: bills.length };
}

export async function getOrder(id) {
  const o = (await findOrder(id)).toObject();
  const userIds = [o.createdBy, ...o.advances.map((a) => a.by), ...o.timeline.map((t) => t.by)];
  const sale = o.saleId ? await Sale.findById(o.saleId).select('invoiceNo status createdAt totals payments advanceAdjustedPaise customerAdvancePaise oldGoldPaise duePaidPaise returnCreditPaise').lean() : null;
  // Open orders: the customer's balance from before, to choose on the delivery bill.
  const before = OPEN_ORDER_STATUSES.includes(o.status) ? await customerBalance(o.customerId).catch(() => null) : null;
  const previousDue = before?.duePaise ?? 0;
  const [maps, categories, products] = await Promise.all([
    nameMaps({ branchIds: [o.branchId], userIds }),
    Category.find({ _id: { $in: o.items.map((i) => i.categoryId).filter(Boolean) } }).select('name').lean(),
    Product.find({ _id: { $in: o.items.map((i) => i.productId).filter(Boolean) } }).select('sku status grossWeightMg huid').lean(),
  ]);
  const categoryName = new Map(categories.map((c) => [String(c._id), c.name]));
  const productById = new Map(products.map((p) => [String(p._id), { id: p._id, sku: p.sku, status: p.status, grossWeightMg: p.grossWeightMg, huid: p.huid }]));
  const { businessDate } = await todayContext();
  const cost = canSeeCost();
  const made = o.items.map((i) => i.make).filter(Boolean);
  const sumOf = (list, fn) => list.reduce((n, x) => n + (fn(x) ?? 0), 0);
  const fineFrom = (source) => sumOf(made, (m) => sumOf(m.materials.filter((x) => x.source === source), (x) => x.fineWeightMg));
  const makeView = (m) =>
    m && {
      materials: m.materials.map((x) => ({ source: x.source, metal: x.metal, purity: x.purity, kind: x.kind, grossWeightMg: x.grossWeightMg, fineWeightMg: x.fineWeightMg, ...(cost && { valuePaise: x.valuePaise }) })),
      finishedGrossMg: m.finishedGrossMg,
      finishedFineMg: m.finishedFineMg,
      wastageFineMg: m.wastageFineMg,
      karigarMode: m.karigarMode,
      ...(cost && { metalCostPaise: m.metalCostPaise, karigarPaise: m.karigarPaise, costPaise: m.costPaise }),
      at: m.at,
    };
  return {
    id: o._id,
    orderNo: o.orderNo,
    status: o.status,
    createdAt: o.createdAt,
    businessDate: o.businessDate,
    branch: pick(maps.branches, o.branchId),
    customer: o.customer,
    items: o.items.map((i) => ({ ...i, make: makeView(i.make), categoryName: i.categoryId ? (categoryName.get(String(i.categoryId)) ?? null) : null, product: i.productId ? (productById.get(String(i.productId)) ?? null) : null })),
    // The customer's own gold: each entry as received, and by purity what is left to use.
    customerMetal: (o.customerMetal ?? []).map((l) => ({ id: l._id, receiptNo: l.receiptNo, description: l.description, metal: l.metal, purity: l.purity, grossWeightMg: l.grossWeightMg, lessWeightMg: l.lessWeightMg, netWeightMg: l.netWeightMg, fineWeightMg: l.fineWeightMg, ratePerGramPaise: l.ratePerGramPaise, valuePaise: l.valuePaise, returnedAt: l.returnedAt, at: l.at })),
    customerMetalBalance: customerGoldBalance(o).map((r) => ({ metal: r.metal, purity: r.purity, receivedMg: r.receivedMg, usedMg: r.usedMg, returnedMg: r.returnedMg, leftMg: r.leftMg, leftPaise: r.leftPaise })),
    // Material for the pieces made so far: fine metal from the customer and from the shop, what ended up in the
    // pieces, the wastage between them, and (if allowed) what it all cost.
    material: {
      customerFineMg: fineFrom('customer'),
      shopFineMg: fineFrom('shop'),
      usedFineMg: fineFrom('customer') + fineFrom('shop'),
      finishedGrossMg: sumOf(made, (m) => m.finishedGrossMg),
      finishedFineMg: sumOf(made, (m) => m.finishedFineMg),
      wastageFineMg: sumOf(made, (m) => m.wastageFineMg),
      ...(cost && { metalCostPaise: sumOf(made, (m) => m.metalCostPaise), karigarPaise: sumOf(made, (m) => m.karigarPaise), costPaise: sumOf(made, (m) => m.costPaise) }),
    },
    estimatedPaise: o.estimatedPaise,
    advancePaise: o.advancePaise,
    customerAdvanceUsedPaise: o.customerAdvanceUsedPaise ?? 0,
    balancePaise: Math.max(0, o.estimatedPaise - o.advancePaise),
    // Open orders: the customer's dues from before (can be added on the delivery bill).
    previousDuePaise: previousDue,
    previousAdvancePaise: before?.advanceLeftPaise ?? 0,
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
      customerAdvancePaise: sale.customerAdvancePaise ?? 0,
      oldGoldPaise: sale.oldGoldPaise ?? 0,
      paidPaise: sale.payments.filter((p) => p.mode !== 'credit').reduce((sum, p) => sum + p.amountPaise, 0),
      duePaise: billDue(sale),
      collectedLaterPaise: sale.duePaidPaise ?? 0,
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
 * The karigar has made the piece for line `index`. The metal it took comes out of stock — the customer's own gold on
 * this order (at the value credited to them) and/or the shop's raw stock (at its average cost) — and the karigar's
 * charge is paid. The piece is tagged at the order's branch and kept with the order: it is not listed in Products and
 * can be billed only on this order. Its cost is the metal plus the karigar's charge; wastage is the fine metal given
 * minus the fine metal in the piece.
 */
export async function finishOrderItem(id, index, input) {
  const { userId } = requireContext();
  const order = await findOrder(id);
  assertOpen(order);
  const item = order.items[index];
  if (!item) throw ApiError.notFound('Order item');
  if (item.productId) {
    const done = await Product.findById(item.productId).select('sku').lean();
    throw ApiError.conflict(`This item is already finished${done ? ` as ${done.sku}` : ''}`, 'ALREADY_FINISHED');
  }
  const branch = await requireBranch(order.branchId, { active: false });
  const today = await todayContext();

  const categoryId = input.categoryId ?? item.categoryId ?? (await Category.findOne({ name: 'Custom Jewellery' }).select('_id').lean())?._id;
  if (!categoryId) throw ApiError.badRequest('Select a category for the finished piece', [{ path: 'categoryId', message: 'Select a category' }], 'VALIDATION_ERROR');
  const purity = input.purity ?? item.purity;
  if (!purity) throw ApiError.badRequest('Select the purity of the finished piece', [{ path: 'purity', message: 'Select a purity' }], 'VALIDATION_ERROR');

  // The metal given to the karigar, each line valued: customer's gold at what it was credited, shop's at average cost.
  const balance = customerGoldBalance(order);
  const shopPools = await MetalStock.find({ branchId: order.branchId, kind: { $ne: CUSTOMER_GOLD } }).lean();
  const takenFromCustomer = new Map();
  const materials = input.materials.map((m, i) => {
    if (m.metal !== item.metal) throw ApiError.badRequest(`This piece is ${item.metal}; ${m.metal} cannot go into it`, [{ path: `materials.${i}.metal`, message: `Use ${item.metal}` }], 'VALIDATION_ERROR');
    if (m.source === 'customer') {
      const key = metalKey(m);
      const r = balance.find((b) => metalKey(b) === key);
      const already = takenFromCustomer.get(key) ?? 0;
      if (!r || r.leftMg - already < m.grossWeightMg) {
        throw ApiError.badRequest(`Only ${grams(Math.max(0, (r?.leftMg ?? 0) - already))} g of the customer's ${m.metal} ${m.purity} is left on this order`, [{ path: `materials.${i}.grossWeightMg`, message: 'More than the customer gave' }], 'VALIDATION_ERROR');
      }
      takenFromCustomer.set(key, already + m.grossWeightMg);
      return { source: 'customer', metal: m.metal, purity: m.purity, kind: CUSTOMER_GOLD, grossWeightMg: m.grossWeightMg, fineWeightMg: fineWeightMg(m.grossWeightMg, m.purity), valuePaise: Math.round((r.leftPaise * m.grossWeightMg) / r.leftMg) };
    }
    const pool = shopPools.find((p) => p.metal === m.metal && p.purity === m.purity && p.kind === m.kind);
    if (!pool || pool.grossMg < m.grossWeightMg) {
      throw ApiError.conflict(`Not enough ${m.metal} ${m.purity} ${m.kind.replace('_', ' ')} in stock — ${grams(pool?.grossMg ?? 0)} g available`, 'INSUFFICIENT_STOCK', [{ path: `materials.${i}.grossWeightMg`, message: 'More than in stock' }]);
    }
    return { source: 'shop', metal: m.metal, purity: m.purity, kind: m.kind, grossWeightMg: m.grossWeightMg, fineWeightMg: fineWeightMg(m.grossWeightMg, m.purity), valuePaise: pool.grossMg > 0 ? Math.round((pool.valuePaise * m.grossWeightMg) / pool.grossMg) : 0 };
  });
  const metalCostPaise = materials.reduce((n, m) => n + m.valuePaise, 0);
  const karigarPaise = input.karigarPaise ?? 0;
  // What is in the books for it: the metal (moved within stock) plus the karigar's charge (paid now).
  const costPaise = metalCostPaise + karigarPaise;

  const parsed = productSchema.safeParse({
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
    costPricePaise: costPaise,
    branchId: String(order.branchId),
    description: [item.notes, item.size && `Size ${item.size}`, `Made for order ${order.orderNo} (${order.customer.name})`].filter(Boolean).join(' · '),
    tags: ['order'],
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw ApiError.badRequest(issue.message, [{ path: issue.path.join('.'), message: issue.message }], 'VALIDATION_ERROR');
  }
  const [prepared] = await preparePieces([parsed.data]);
  prepared.doc.orderId = order._id;

  await withTransaction(async (session) => {
    const fresh = await findOrder(id, session);
    assertOpen(fresh);
    if (fresh.items[index].productId) throw ApiError.conflict('This item was finished by someone else. Refresh.', 'CONCURRENT_UPDATE');
    const [piece] = await insertPieces([prepared], { session });
    const source = { docType: 'order', docId: fresh._id, docNo: fresh.orderNo };
    for (const m of materials) {
      await moveMetal({ type: 'production_use', branchId: fresh.branchId, line: { metal: m.metal, purity: m.purity, kind: m.kind, grossWeightMg: m.grossWeightMg, valuePaise: m.valuePaise, direction: 'out' }, source, businessDate: today.businessDate, note: `Made into ${piece.sku} for ${fresh.customer.name}` }, { session });
    }
    await moveProducts({ type: 'production', productIds: [piece._id], branchId: fresh.branchId, expectedBranchId: fresh.branchId, source, businessDate: today.businessDate, note: `Made for order ${fresh.orderNo}` }, { session });
    if (karigarPaise > 0) {
      await postJournal(
        {
          voucherType: 'production',
          date: today.now,
          businessDate: today.businessDate,
          financialYear: today.financialYear,
          narration: `Karigar charge for ${piece.sku} — order ${fresh.orderNo}`,
          source,
          lines: [
            { account: 'inventory', debit: karigarPaise, branchId: fresh.branchId },
            { account: PAYMENT_ACCOUNT[input.karigarMode], credit: karigarPaise, branchId: fresh.branchId },
          ],
        },
        { session },
      );
    }
    const usedFine = materials.reduce((n, m) => n + m.fineWeightMg, 0);
    fresh.items[index].productId = piece._id;
    fresh.items[index].make = {
      materials,
      metalCostPaise,
      karigarPaise,
      karigarMode: karigarPaise > 0 ? input.karigarMode : null,
      costPaise,
      finishedGrossMg: piece.grossWeightMg,
      finishedFineMg: piece.fineWeightMg,
      wastageFineMg: materials.length ? usedFine - piece.fineWeightMg : 0,
      at: today.now,
      by: userId,
    };
    fresh.markModified('items');
    await fresh.save({ session });
    await recordAudit({ action: AUDIT_ACTIONS.UPDATE, module: 'order', recordType: 'Order', recordId: fresh._id, meta: { name: fresh.orderNo, finished: piece.sku, costPaise } }, { session });
  });
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
