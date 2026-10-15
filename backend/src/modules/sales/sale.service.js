import { hasPermission, OPEN_ORDER_STATUSES, ORDER_STATUS, PRODUCT_STATUS, SALE_STATUS } from '@jerp/shared';
import { withTransaction } from '../../config/db.js';
import { AUDIT_ACTIONS, recordAudit } from '../../core/audit/audit.service.js';
import { requireContext } from '../../core/context/requestContext.js';
import { PAYMENT_ACCOUNT } from '../../core/ledger/paymentAccounts.js';
import { postJournal, reverseJournalsFor } from '../../core/ledger/posting.service.js';
import { nextDocumentNo } from '../../core/numbering/numbering.service.js';
import { priceInvoice, priceLine } from '../../core/pricing/pricingEngine.js';
import { moveProducts } from '../../core/stock/stockLedger.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { dayRange, todayContext } from '../../utils/businessDate.js';
import { maskTail } from '../../utils/mask.js';
import { searchFilter } from '../../utils/pagination.js';
import { Customer } from '../customers/customer.model.js';
import { accessibleBranchFilter, nameMaps, oid, pick, requireBranch, viewBranchFor } from '../inventory/inventory.helpers.js';
import { Order } from '../orders/order.model.js';
import { orderForBilling } from '../orders/order.service.js';
import { Organisation } from '../organisations/organisation.model.js';
import { Product } from '../products/product.model.js';
import { getApplicableRate } from '../rates/rate.service.js';
import { getSettings, printChoiceFor } from '../settings/settings.service.js';
import { Sale, SalesReturn, billDue } from './sale.model.js';

const problem = (message, details, code = 'SALE_BLOCKED') => new ApiError(422, code, message, details);

function pricingInputs(p, discountPaise) {
  return {
    pricingMode: p.pricingMode,
    stockType: p.stockType,
    quantity: p.quantity,
    netWeightMg: p.netWeightMg,
    wastage: p.wastage,
    making: p.making,
    stones: (p.stones ?? []).map((s) => ({ type: s.type, weight: s.weight, weightUnit: s.weightUnit, ratePaise: s.ratePaise ?? 0 })),
    otherChargePaise: p.otherChargePaise ?? 0,
    fixedPricePaise: p.fixedPricePaise ?? null,
    discountPaise,
  };
}

/**
 * Advance the customer paid before their first bill (entered as a minus "old due" on the customer), less what
 * earlier bills have already used. Cancelled bills give theirs back.
 */
export async function customerAdvanceLeft(customer, { session } = {}) {
  const held = Math.max(0, -(customer?.openingBalancePaise ?? 0));
  if (!held) return 0;
  const used = await Sale.find({ customerId: customer._id, status: SALE_STATUS.COMPLETED, customerAdvancePaise: { $gt: 0 } }).select('customerAdvancePaise').session(session ?? null).lean();
  return held - used.reduce((s, x) => s + x.customerAdvancePaise, 0);
}

/** Paid (money received now, plus any advance used) and due (left on the customer's account) for one bill. */
export function billBalance(s) {
  const due = billDue(s); // left on credit, less what was collected later and returns adjusted against it
  const paid = s.totals.grandTotalPaise - due;
  return { paidPaise: paid, duePaise: due, collectedLaterPaise: s.duePaidPaise ?? 0, paymentStatus: due <= 0 ? 'paid' : paid > 0 ? 'partly_paid' : 'due' };
}

async function buildQuote({ branchId, customerId: requestedCustomerId, orderId: requestedOrderId, items, useCustomerAdvance = true }) {
  const { permissions } = requireContext();
  if (items.some((i) => i.discountPaise > 0) && !hasPermission(permissions, 'sales.discount')) {
    throw ApiError.forbidden('You are not allowed to give discounts', 'DISCOUNT_FORBIDDEN');
  }
  const branch = await requireBranch(branchId);
  // A piece made for this customer's open order bills against that order even when the order was not picked,
  // so its advance is deducted and the order is delivered (otherwise the advance would be left hanging).
  let orderId = requestedOrderId;
  if (!orderId && requestedCustomerId) {
    const own = await Order.find({ customerId: requestedCustomerId, status: { $in: OPEN_ORDER_STATUSES }, 'items.productId': { $in: items.map((i) => i.productId) } })
      .select('orderNo')
      .lean();
    if (own.length > 1) {
      throw problem(`These pieces belong to different orders (${own.map((o) => o.orderNo).join(', ')}). Bill one order at a time.`, [{ path: 'items', message: 'Pieces from several orders' }]);
    }
    orderId = own[0]?._id ?? null;
  }
  const order = orderId ? await orderForBilling(orderId, { branchId, customerId: requestedCustomerId }) : null;
  const customerId = requestedCustomerId ?? order?.customerId ?? null;
  const [settings, today, org, customer, products] = await Promise.all([
    getSettings(),
    todayContext(),
    Organisation.findById(requireContext().organisationId).lean(),
    customerId ? Customer.findOne({ _id: customerId, isDeleted: false }).lean() : null,
    Product.find({ _id: { $in: items.map((i) => i.productId) }, isDeleted: false }).lean(),
  ]);
  if (customerId && !customer) throw ApiError.badRequest('Customer not found', [{ path: 'customerId', message: 'Customer not found' }], 'VALIDATION_ERROR');
  if (customer?.status === 'inactive') throw problem(`${customer.name} is inactive. Activate the customer first.`);

  const byId = new Map(products.map((p) => [String(p._id), p]));
  const issues = [];

  // A piece made for a customer's order is theirs: it can be billed only to that customer.
  const reserved = await Order.find({ status: { $in: OPEN_ORDER_STATUSES }, 'items.productId': { $in: items.map((i) => i.productId) } })
    .select('orderNo customerId customer items.productId')
    .lean();
  for (const o of reserved) {
    if (customer && String(o.customerId) === String(customer._id)) continue;
    for (const line of o.items.filter((l) => l.productId && items.some((i) => String(i.productId) === String(l.productId)))) {
      const sku = byId.get(String(line.productId))?.sku ?? 'This item';
      const who = o.customer?.name ?? 'that customer';
      issues.push({ path: 'items', message: `${sku} is made for order ${o.orderNo} of ${who}; it can be billed only to ${who}` });
    }
  }
  const lines = [];
  for (const item of items) {
    const p = byId.get(String(item.productId));
    if (!p) {
      issues.push({ path: 'items', message: `Item ${item.productId} not found` });
      continue;
    }
    if (p.status !== PRODUCT_STATUS.IN_STOCK) issues.push({ path: 'items', message: `${p.sku} is ${p.status.replace('_', ' ')}` });
    else if (String(p.branchId) !== String(branchId)) issues.push({ path: 'items', message: `${p.sku} is at another branch` });
    if (p.metal === 'gold' && settings.jewellery.huidMandatory && !p.huid && p.jewelleryType !== 'coin_bar') issues.push({ path: 'items', message: `${p.sku} has no HUID` });

    let rate = null;
    if (p.pricingMode !== 'fixed') {
      rate = await getApplicableRate(p.metal, p.purity, today.now);
      if (!rate) issues.push({ path: 'items', message: `No ${p.metal} ${p.purity} rate entered` });
      else if (rate.businessDate !== today.businessDate) issues.push({ path: 'items', message: `Today's ${p.metal} ${p.purity} rate is not updated (rates are updated once by the organisation for all branches)` });
    }
    if (issues.length) continue;

    let breakdown;
    try {
      breakdown = priceLine(pricingInputs(p, item.discountPaise ?? 0), { ratePerGramPaise: rate?.ratePerGramPaise ?? null, tax: settings.tax });
    } catch (err) {
      issues.push({ path: 'items', message: `${p.sku}: ${err.message}` });
      continue;
    }
    lines.push({ product: p, rate, breakdown, inputs: pricingInputs(p, item.discountPaise ?? 0) });
  }
  if (issues.length) throw problem(issues.map((i) => i.message).join('; '), issues);

  const sellerState = branch.address?.stateCode ?? org.address?.stateCode ?? null;
  const buyerState = customer?.gstin ? customer.gstin.slice(0, 2) : (customer?.address?.stateCode ?? sellerState);
  const interState = Boolean(sellerState && buyerState && sellerState !== buyerState);
  const totals = priceInvoice(
    lines.map((l) => l.breakdown),
    { interState, roundOff: settings.tax.roundOff },
  );

  const advancePaise = order?.advancePaise ?? 0;
  if (advancePaise > totals.grandTotalPaise) {
    throw problem(`The advance on ${order.orderNo} (${(advancePaise / 100).toFixed(2)}) is more than this bill (${(totals.grandTotalPaise / 100).toFixed(2)}). Add the remaining items or refund part of the advance.`, [{ path: 'orderId', message: 'Advance exceeds the bill' }], 'ADVANCE_EXCEEDS_BILL');
  }

  // The customer's own advance (from before) is used next, as far as the bill needs it.
  const customerAdvanceLeftPaise = customer ? Math.max(0, await customerAdvanceLeft(customer)) : 0;
  const customerAdvancePaise = useCustomerAdvance ? Math.min(customerAdvanceLeftPaise, totals.grandTotalPaise - advancePaise) : 0;

  const panRequired = totals.grandTotalPaise > settings.jewellery.panRequiredAbovePaise;
  return {
    order,
    advancePaise,
    customerAdvancePaise,
    customerAdvanceLeftPaise,
    payablePaise: totals.grandTotalPaise - advancePaise - customerAdvancePaise,
    branch,
    org,
    customer,
    lines,
    totals,
    interState,
    placeOfSupply: buyerState,
    settings,
    today,
    compliance: {
      panRequired,
      panMissing: panRequired && !customer?.pan,
      cashLimitPaise: settings.jewellery.cashLimitPaise,
      cashLimitAction: settings.jewellery.cashLimitAction,
    },
  };
}

const serializeLine = (l) => ({
  productId: l.product._id,
  sku: l.product.sku,
  name: l.product.name,
  metal: l.product.metal,
  purity: l.product.purity,
  huid: l.product.huid,
  grossWeightMg: l.product.grossWeightMg,
  stoneWeightMg: l.product.stoneWeightMg,
  netWeightMg: l.product.netWeightMg,
  images: (l.product.images ?? []).map((i) => String(i.fileId)),
  breakdown: l.breakdown,
});

export async function quote(input) {
  const q = await buildQuote(input);
  return {
    items: q.lines.map(serializeLine),
    totals: q.totals,
    interState: q.interState,
    compliance: q.compliance,
    order: q.order && { id: q.order._id, orderNo: q.order.orderNo, advancePaise: q.order.advancePaise },
    advancePaise: q.advancePaise,
    customerAdvancePaise: q.customerAdvancePaise,
    customerAdvanceLeftPaise: q.customerAdvanceLeftPaise,
    payablePaise: q.payablePaise,
  };
}

/**
 * What the customer pays now may be less than the bill: for a known customer the rest stays due on their account
 * (one "credit" line), so 30,000 paid on a 50,000 bill is 30,000 paid + 20,000 due. Walk-ins pay in full.
 * Returns the payments to save.
 */
function settlePayments(q, input) {
  if (input.some((p) => p.mode === 'credit') && !q.customer) throw problem('Credit sales need a customer', [{ path: 'payments', message: 'Select a customer for credit' }]);
  const money = input.filter((p) => p.mode !== 'credit');
  const asked = input.filter((p) => p.mode === 'credit').reduce((s, p) => s + p.amountPaise, 0);
  const received = money.reduce((s, p) => s + p.amountPaise, 0);
  const payable = q.payablePaise;
  const rupeesOf = (v) => (v / 100).toFixed(2);
  if (received + asked > payable || (!q.customer && received !== payable)) {
    const what = q.advancePaise || q.customerAdvancePaise ? `the amount due after the advance (${rupeesOf(payable)})` : `the invoice total (${rupeesOf(payable)})`;
    const message = received + asked > payable ? `Payments (${rupeesOf(received + asked)}) are more than ${what}` : `Payments (${rupeesOf(received)}) must equal ${what}. Select the customer to keep the rest as due.`;
    throw ApiError.badRequest(message, [{ path: 'payments', message: 'Payments do not match the total' }], 'PAYMENT_MISMATCH');
  }
  const due = payable - received;
  const payments = due > 0 ? [...money, { mode: 'credit', amountPaise: due, reference: null }] : money;
  const cash = payments.filter((p) => p.mode === 'cash').reduce((s, p) => s + p.amountPaise, 0);
  if (cash > q.compliance.cashLimitPaise && q.compliance.cashLimitAction === 'block') {
    throw problem(`Cash of ${(cash / 100).toFixed(2)} exceeds the limit of ${(q.compliance.cashLimitPaise / 100).toFixed(2)} (Section 269ST)`, [{ path: 'payments', message: 'Cash limit exceeded' }], 'CASH_LIMIT');
  }
  if (q.compliance.panMissing) {
    throw problem(q.customer ? `PAN is required for ${q.customer.name} on bills of this value` : 'Select a customer with PAN for bills of this value', [{ path: 'customerId', message: 'PAN required' }], 'PAN_REQUIRED');
  }
  return payments;
}

const sellerSnapshot = (org, branch) => ({
  name: org.name,
  legalName: org.legalName ?? org.name,
  gstin: branch.gstin ?? org.gstin ?? null,
  pan: org.pan ?? null,
  phone: branch.phone ?? org.phone ?? null,
  email: branch.email ?? org.email ?? null,
  address: branch.address?.line1 ? branch.address : org.address,
  stateCode: branch.address?.stateCode ?? org.address?.stateCode ?? null,
  branchName: branch.name,
  branchCode: branch.code,
  hasLogo: Boolean(org.logoFileId),
});

const customerSnapshot = (c) =>
  c && { id: c._id, code: c.code, name: c.name, mobile: c.mobile, email: c.email, gstin: c.gstin, pan: c.pan, address: c.address, stateCode: c.gstin?.slice(0, 2) ?? c.address?.stateCode ?? null };

export async function createSale({ payments: requested, notes, ...input }, idempotencyKey) {
  const { userId } = requireContext();
  if (idempotencyKey) {
    const existing = await Sale.findOne({ idempotencyKey }).lean();
    if (existing) return serializeSale(existing);
  }
  const q = await buildQuote(input);
  const payments = settlePayments(q, requested);
  const { today, branch, settings } = q;

  const sale = await withTransaction(async (session) => {
    const invoiceNo = await nextDocumentNo({ prefix: settings.invoice.invoicePrefix, branchCode: branch.code, financialYear: today.financialYear }, { session });
    const items = q.lines.map((l) => ({
      productId: l.product._id,
      sku: l.product.sku,
      name: l.product.name,
      hsnCode: l.product.hsnCode,
      huid: l.product.huid,
      metal: l.product.metal,
      purity: l.product.purity,
      stockType: l.product.stockType,
      quantity: l.product.quantity,
      grossWeightMg: l.product.grossWeightMg,
      stoneWeightMg: l.product.stoneWeightMg,
      netWeightMg: l.product.netWeightMg,
      fineWeightMg: l.product.fineWeightMg,
      pricingInputs: l.inputs,
      rateId: l.rate?._id ?? null,
      breakdown: l.breakdown,
      costPaise: l.product.costPricePaise ?? 0,
    }));
    const [doc] = await Sale.create(
      [
        {
          invoiceNo,
          branchId: branch._id,
          businessDate: today.businessDate,
          customerId: q.customer?._id ?? null,
          customer: customerSnapshot(q.customer),
          seller: sellerSnapshot(q.org, branch),
          placeOfSupply: q.placeOfSupply,
          interState: q.interState,
          items,
          totals: q.totals,
          payments,
          taxSnapshot: settings.tax,
          notes: notes ?? null,
          orderId: q.order?._id ?? null,
          orderNo: q.order?.orderNo ?? null,
          advanceAdjustedPaise: q.advancePaise,
          customerAdvancePaise: q.customerAdvancePaise,
          idempotencyKey: idempotencyKey ?? null,
          createdBy: userId,
        },
      ],
      { session },
    );

    const source = { docType: 'sale', docId: doc._id, docNo: invoiceNo };
    // Two bills at once must not both spend the same advance.
    if (q.customerAdvancePaise && (await customerAdvanceLeft(q.customer, { session })) < 0) {
      throw ApiError.conflict(`${q.customer.name}'s advance changed while billing. Try again.`, 'CONCURRENT_UPDATE');
    }
    if (q.order) {
      const delivered = await Order.findOneAndUpdate(
        { _id: q.order._id, status: { $in: [ORDER_STATUS.BOOKED, ORDER_STATUS.IN_PROGRESS, ORDER_STATUS.READY] }, saleId: null, advancePaise: q.advancePaise },
        { $set: { status: ORDER_STATUS.DELIVERED, saleId: doc._id, invoiceNo, deliveredAt: today.now }, $push: { timeline: { status: ORDER_STATUS.DELIVERED, at: today.now, by: userId, note: `Billed on ${invoiceNo}` } } },
        { session },
      );
      if (!delivered) throw ApiError.conflict(`Order ${q.order.orderNo} changed while billing. Try again.`, 'CONCURRENT_UPDATE');
    }
    await moveProducts({ type: 'sale', productIds: items.map((i) => i.productId), expectedBranchId: branch._id, source, businessDate: today.businessDate }, { session });

    const when = { date: today.now, businessDate: today.businessDate, financialYear: today.financialYear };
    const party = q.customer ? { type: 'customer', id: q.customer._id } : undefined;
    const debits = Object.entries(
      payments.reduce((acc, p) => ({ ...acc, [PAYMENT_ACCOUNT[p.mode]]: (acc[PAYMENT_ACCOUNT[p.mode]] ?? 0) + p.amountPaise }), {}),
    ).map(([account, amount]) => ({ account, debit: amount, branchId: branch._id, ...(account === 'sundry_debtors' && { party }) }));
    if (q.advancePaise) debits.push({ account: 'customer_advances', debit: q.advancePaise, branchId: branch._id, party });
    // The customer's own advance sits as a credit on their account (opening balance): using it debits that account.
    if (q.customerAdvancePaise) debits.push({ account: 'sundry_debtors', debit: q.customerAdvancePaise, branchId: branch._id, party });
    const { taxablePaise, gstPaise, roundOffPaise } = q.totals;
    await postJournal(
      {
        voucherType: 'sale',
        ...when,
        narration: `Sale ${invoiceNo}${q.customer ? ` to ${q.customer.name}` : ''}`,
        source,
        lines: [
          ...debits,
          { account: 'sales', credit: taxablePaise, branchId: branch._id },
          { account: 'gst_output', credit: gstPaise, branchId: branch._id },
          roundOffPaise > 0 ? { account: 'round_off', credit: roundOffPaise, branchId: branch._id } : { account: 'round_off', debit: -roundOffPaise, branchId: branch._id },
        ],
      },
      { session },
    );
    const cost = items.reduce((s, i) => s + i.costPaise, 0);
    await postJournal(
      { voucherType: 'cost_of_sale', ...when, narration: `Cost of goods ${invoiceNo}`, source, lines: [{ account: 'cogs', debit: cost, branchId: branch._id }, { account: 'inventory', credit: cost, branchId: branch._id }] },
      { session },
    );
    await recordAudit(
      { action: AUDIT_ACTIONS.CREATE, module: 'sales', recordType: 'Sale', recordId: doc._id, meta: { name: invoiceNo, invoiceNo, total: q.totals.grandTotalPaise, items: items.length } },
      { session },
    );
    return doc;
  });
  return serializeSale(sale.toObject());
}

/** How this bill prints: its branch's paper size and design, and what Invoice settings put on the page. */
function printLayout(settings, branchId) {
  const { copies, showHsn, showHuid, showWeightBreakup, showRateTable, signatoryLabel, terms, footerNote } = settings.invoice;
  return { ...printChoiceFor(settings.print, branchId), copies, showHsn, showHuid, showWeightBreakup, showRateTable, signatoryLabel, terms, footerNote };
}

async function serializeSale(s, returns) {
  const [maps, settings] = await Promise.all([nameMaps({ branchIds: [s.branchId], userIds: [s.createdBy, s.cancelledBy] }), getSettings()]);
  const { permissions } = requireContext();
  const canSeeKyc = hasPermission(permissions, 'customer.viewKyc');
  const canSeeCost = hasPermission(permissions, 'product.viewCost');
  return {
    id: s._id,
    invoiceNo: s.invoiceNo,
    status: s.status,
    businessDate: s.businessDate,
    createdAt: s.createdAt,
    branch: pick(maps.branches, s.branchId),
    customer: s.customer && { ...s.customer, pan: canSeeKyc ? s.customer.pan : maskTail(s.customer.pan) },
    seller: s.seller,
    placeOfSupply: s.placeOfSupply,
    interState: s.interState,
    items: s.items.map((i) => ({ ...i, costPaise: canSeeCost ? i.costPaise : undefined })),
    totals: s.totals,
    payments: s.payments,
    taxSnapshot: s.taxSnapshot,
    notes: s.notes,
    order: s.orderId ? { id: s.orderId, orderNo: s.orderNo } : null,
    advanceAdjustedPaise: s.advanceAdjustedPaise ?? 0,
    customerAdvancePaise: s.customerAdvancePaise ?? 0,
    ...billBalance(s),
    createdBy: pick(maps.users, s.createdBy),
    cancelledAt: s.cancelledAt,
    cancelledBy: pick(maps.users, s.cancelledBy),
    cancelReason: s.cancelReason,
    print: printLayout(settings, s.branchId),
    returns: (returns ?? []).map((r) => ({ id: r._id, creditNoteNo: r.creditNoteNo, amountPaise: r.amountPaise, refundMode: r.refundMode, reason: r.reason, productIds: r.productIds, createdAt: r.createdAt })),
  };
}

async function findSale(id) {
  const sale = await Sale.findOne({ _id: id, ...accessibleBranchFilter() });
  if (!sale) throw ApiError.notFound('Invoice');
  return sale;
}

export async function getSale(id) {
  const sale = (await findSale(id)).toObject();
  const returns = await SalesReturn.find({ saleId: sale._id }).sort({ createdAt: 1 }).lean();
  return serializeSale(sale, returns);
}

export async function listSales({ page, limit, q, status, branchId: chosen, customerId, from, to }) {
  const branchId = chosen ?? (customerId ? null : await viewBranchFor('sales')); // navbar filter (a customer's bills: all)
  const filter = { ...accessibleBranchFilter(), ...searchFilter(q, ['invoiceNo', 'customer.name', 'customer.mobile', 'items.sku']) };
  if (status) filter.status = status;
  if (branchId) filter.branchId = oid(branchId);
  if (customerId) filter.customerId = oid(customerId);
  if (from || to) filter.createdAt = dayRange(from, to, (await todayContext()).timezone);
  const [items, total] = await Promise.all([Sale.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), Sale.countDocuments(filter)]);
  const maps = await nameMaps({ branchIds: items.map((s) => s.branchId), userIds: items.map((s) => s.createdBy) });
  return {
    items: items.map((s) => ({
      id: s._id,
      invoiceNo: s.invoiceNo,
      status: s.status,
      createdAt: s.createdAt,
      branch: pick(maps.branches, s.branchId),
      customer: s.customer ? { id: s.customer.id, name: s.customer.name, mobile: s.customer.mobile } : null,
      itemCount: s.items.length,
      returnedCount: s.items.filter((i) => i.returned).length,
      grandTotalPaise: s.totals.grandTotalPaise,
      ...billBalance(s),
      paymentModes: [...new Set(s.payments.map((p) => p.mode))],
      advanceUsed: Boolean(s.advanceAdjustedPaise || s.customerAdvancePaise),
      orderNo: s.orderNo ?? null,
      createdBy: pick(maps.users, s.createdBy),
    })),
    meta: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)), summary: await salesSummary(branchId) },
  };
}

/** Header cards: today, this month (billed, collected, bills), and credit still owed by customers on completed bills. */
async function salesSummary(branchId) {
  const today = await todayContext();
  const monthStart = `${today.businessDate.slice(0, 7)}-01`;
  const scope = { ...accessibleBranchFilter(), ...(branchId && { branchId: oid(branchId) }), status: SALE_STATUS.COMPLETED };
  const credit = { $sum: { $map: { input: { $filter: { input: '$payments', cond: { $eq: ['$$this.mode', 'credit'] } } }, in: '$$this.amountPaise' } } };
  // Paid at the counter (every mode but credit). Not total less credit: that would also count the order and customer
  // advances used on the bill, which were collected — and counted — when they were paid.
  const paid = { $sum: { $map: { input: { $filter: { input: '$payments', cond: { $ne: ['$$this.mode', 'credit'] } } }, in: '$$this.amountPaise' } } };
  // Still owed = left on credit less what was collected later.
  const owed = { $max: [0, { $subtract: [credit, { $add: [{ $ifNull: ['$duePaidPaise', 0] }, { $ifNull: ['$returnCreditPaise', 0] }] }] }] };
  const [row] = await Sale.aggregate([
    { $match: scope },
    { $project: { businessDate: 1, total: '$totals.grandTotalPaise', paid, owed } },
    {
      $group: {
        _id: null,
        todayPaise: { $sum: { $cond: [{ $eq: ['$businessDate', today.businessDate] }, '$total', 0] } },
        todayBills: { $sum: { $cond: [{ $eq: ['$businessDate', today.businessDate] }, 1, 0] } },
        monthPaise: { $sum: { $cond: [{ $gte: ['$businessDate', monthStart] }, '$total', 0] } },
        monthPaidPaise: { $sum: { $cond: [{ $gte: ['$businessDate', monthStart] }, '$paid', 0] } },
        monthBills: { $sum: { $cond: [{ $gte: ['$businessDate', monthStart] }, 1, 0] } },
        duePaise: { $sum: '$owed' },
        dueBills: { $sum: { $cond: [{ $gt: ['$owed', 0] }, 1, 0] } },
      },
    },
  ]);
  const r = row ?? { todayPaise: 0, todayBills: 0, monthPaise: 0, monthPaidPaise: 0, monthBills: 0, duePaise: 0, dueBills: 0 };
  return {
    today: { totalPaise: r.todayPaise, bills: r.todayBills },
    month: { totalPaise: r.monthPaise, collectedPaise: r.monthPaidPaise, bills: r.monthBills, averagePaise: r.monthBills ? Math.round(r.monthPaise / r.monthBills) : 0 },
    due: { totalPaise: r.duePaise, bills: r.dueBills },
  };
}

export async function cancelSale(id, reason) {
  const { userId } = requireContext();
  const sale = await findSale(id);
  if (sale.status !== SALE_STATUS.COMPLETED) throw ApiError.conflict('This invoice is already cancelled', 'INVALID_STATE');
  if (sale.duePaidPaise > 0) throw ApiError.conflict('Due payments were collected against this invoice, so it cannot be cancelled. Return the items instead.', 'HAS_COLLECTIONS');
  if (sale.items.some((i) => i.returned)) throw ApiError.conflict('Items on this invoice were returned. Cancel is not possible; return the remaining items instead.', 'HAS_RETURNS');
  const today = await todayContext();

  await withTransaction(async (session) => {
    const claimed = await Sale.findOneAndUpdate(
      { _id: sale._id, status: SALE_STATUS.COMPLETED },
      { $set: { status: SALE_STATUS.CANCELLED, cancelledAt: today.now, cancelledBy: userId, cancelReason: reason } },
      { session },
    );
    if (!claimed) throw ApiError.conflict('This invoice is already cancelled', 'INVALID_STATE');
    const source = { docType: 'sale', docId: sale._id, docNo: sale.invoiceNo };
    await moveProducts({ type: 'sale_cancel', productIds: sale.items.map((i) => i.productId), branchId: sale.branchId, source, businessDate: today.businessDate, note: reason }, { session });
    await reverseJournalsFor(source, { date: today.now, businessDate: today.businessDate, financialYear: today.financialYear, narration: `Cancellation of ${sale.invoiceNo}` }, { session });
    if (sale.orderId) {
      // The advance is back in customer advances (journal reversed), so the order is ready to bill again.
      await Order.updateOne(
        { _id: sale.orderId, saleId: sale._id },
        { $set: { status: ORDER_STATUS.READY, saleId: null, invoiceNo: null, deliveredAt: null }, $push: { timeline: { status: ORDER_STATUS.READY, at: today.now, by: userId, note: `Invoice ${sale.invoiceNo} cancelled` } } },
        { session },
      );
    }
    await recordAudit({ action: AUDIT_ACTIONS.CANCEL, module: 'sales', recordType: 'Sale', recordId: sale._id, meta: { name: sale.invoiceNo, reason } }, { session });
  });
  return getSale(id);
}

export async function returnItems(id, { productIds, refundMode, reason }) {
  const { userId } = requireContext();
  const sale = await findSale(id);
  if (sale.status !== SALE_STATUS.COMPLETED) throw ApiError.conflict('Cancelled invoices cannot have returns', 'INVALID_STATE');
  if (refundMode === 'credit' && !sale.customerId) throw problem('Walk-in sales cannot be refunded to customer credit', [{ path: 'refundMode', message: 'Choose cash or bank' }]);

  const wanted = new Set(productIds.map(String));
  const lines = sale.items.filter((i) => wanted.has(String(i.productId)));
  if (lines.length !== wanted.size) throw ApiError.badRequest('Some items are not on this invoice', [{ path: 'productIds', message: 'Not on invoice' }], 'VALIDATION_ERROR');
  const already = lines.filter((l) => l.returned);
  if (already.length) throw ApiError.conflict(`${already.map((l) => l.sku).join(', ')} already returned`, 'ALREADY_RETURNED');

  const taxablePaise = lines.reduce((s, l) => s + l.breakdown.taxablePaise, 0);
  const gstPaise = lines.reduce((s, l) => s + l.breakdown.gstPaise, 0);
  const cost = lines.reduce((s, l) => s + (l.costPaise ?? 0), 0);
  const amountPaise = taxablePaise + gstPaise;
  // Refund kept on the customer's account only settles what is still due on this bill; more than that is paid back.
  const dueOnBill = billDue(sale);
  if (refundMode === 'credit' && amountPaise > dueOnBill) {
    throw problem(
      dueOnBill > 0
        ? `Only ${(dueOnBill / 100).toFixed(2)} is due on this bill, less than the return (${(amountPaise / 100).toFixed(2)}). Refund by cash or bank.`
        : `Nothing is due on this bill. Refund ${(amountPaise / 100).toFixed(2)} by cash or bank.`,
      [{ path: 'refundMode', message: 'Choose cash or bank' }],
    );
  }
  const today = await todayContext();
  const branch = await requireBranch(sale.branchId, { active: false });

  const creditNote = await withTransaction(async (session) => {
    const creditNoteNo = await nextDocumentNo({ prefix: 'CN', branchCode: branch.code, financialYear: today.financialYear }, { session });
    const [ret] = await SalesReturn.create(
      [{ creditNoteNo, saleId: sale._id, invoiceNo: sale.invoiceNo, branchId: sale.branchId, customerId: sale.customerId, businessDate: today.businessDate, productIds, taxablePaise, gstPaise, amountPaise, refundMode, reason, createdBy: userId }],
      { session },
    );
    const updated = await Sale.updateOne(
      { _id: sale._id, status: SALE_STATUS.COMPLETED, items: { $not: { $elemMatch: { productId: { $in: productIds.map(oid) }, returned: true } } } },
      { $set: { 'items.$[line].returned': true }, ...(refundMode === 'credit' && { $inc: { returnCreditPaise: amountPaise } }) },
      { session, arrayFilters: [{ 'line.productId': { $in: productIds.map(oid) } }] },
    );
    if (updated.modifiedCount !== 1) throw ApiError.conflict('This invoice changed while returning. Try again.', 'CONCURRENT_UPDATE');

    const source = { docType: 'sales_return', docId: ret._id, docNo: creditNoteNo };
    await moveProducts({ type: 'sales_return', productIds, branchId: sale.branchId, source, businessDate: today.businessDate, note: reason }, { session });
    const when = { date: today.now, businessDate: today.businessDate, financialYear: today.financialYear };
    const refundAccount = PAYMENT_ACCOUNT[refundMode];
    await postJournal(
      {
        voucherType: 'sales_return',
        ...when,
        narration: `Return against ${sale.invoiceNo}`,
        source,
        lines: [
          { account: 'sales', debit: taxablePaise, branchId: sale.branchId },
          { account: 'gst_output', debit: gstPaise, branchId: sale.branchId },
          { account: refundAccount, credit: amountPaise, branchId: sale.branchId, ...(refundAccount === 'sundry_debtors' && { party: { type: 'customer', id: sale.customerId } }) },
        ],
      },
      { session },
    );
    await postJournal(
      { voucherType: 'cost_of_sale', ...when, narration: `Stock back from ${creditNoteNo}`, source, lines: [{ account: 'inventory', debit: cost, branchId: sale.branchId }, { account: 'cogs', credit: cost, branchId: sale.branchId }] },
      { session },
    );
    await recordAudit({ action: AUDIT_ACTIONS.RETURN, module: 'sales', recordType: 'Sale', recordId: sale._id, meta: { name: sale.invoiceNo, creditNoteNo, amount: amountPaise } }, { session });
    return ret;
  });
  return { creditNoteNo: creditNote.creditNoteNo, amountPaise, sale: await getSale(id) };
}
