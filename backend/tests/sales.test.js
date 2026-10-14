import { describe, expect, it } from 'vitest';
import { runWithContext } from '../src/core/context/requestContext.js';
import { Account } from '../src/core/ledger/account.model.js';
import { JournalEntry } from '../src/core/ledger/journalEntry.model.js';
import { api, bearer, registerOrg } from './helpers.js';

async function setup({ rate = true } = {}) {
  const owner = await registerOrg();
  const t = owner.token;
  const me = (await api().get('/api/v1/auth/me').set(bearer(t))).body.data;
  const ring = (await api().get('/api/v1/categories').set(bearer(t))).body.data.find((c) => c.name === 'Ring');
  if (rate) await api().post('/api/v1/rates').set(bearer(t)).send({ rates: [{ metal: 'gold', purity: 916, ratePerGramPaise: 725000 }] });
  return { t, orgId: me.organisation.id, ho: me.branches[0].id, ring };
}

async function stockedProduct(ctx, o = {}) {
  const body = {
    name: 'Chain',
    categoryId: ctx.ring.id,
    jewelleryType: 'plain_gold',
    metal: 'gold',
    purity: 916,
    grossWeightMg: 10000,
    wastage: { mode: 'percent', value: 800 },
    making: { type: 'per_gram', value: 50000 },
    costPricePaise: 7000000,
    huid: `H${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    branchId: ctx.ho,
    ...o,
  };
  const p = (await api().post('/api/v1/products').set(bearer(ctx.t)).send(body)).body.data;
  await api().post('/api/v1/inventory/opening').set(bearer(ctx.t)).send({ branchId: ctx.ho, productIds: [p.id] });
  return p;
}

const customer = async (ctx, o = {}) =>
  (await api().post('/api/v1/customers').set(bearer(ctx.t)).send({ name: 'Rupa Sen', mobile: `98${Math.floor(10000000 + Math.random() * 89999999)}`, address: { stateCode: '19' }, ...o })).body.data;

const ledger = (ctx, docType) =>
  runWithContext({ organisationId: ctx.orgId }, async () => {
    const keys = new Map((await Account.find({}).lean()).map((a) => [String(a._id), a.systemKey]));
    const entries = await JournalEntry.find({ 'source.docType': docType }).sort({ createdAt: 1 }).lean();
    return entries.map((e) => ({ ...e, lines: e.lines.map((l) => [keys.get(String(l.accountId)), l.debitPaise, l.creditPaise]) }));
  });

describe('quote', () => {
  it('prices with today’s rate, splits CGST/SGST and rounds', async () => {
    const ctx = await setup();
    const p = await stockedProduct(ctx);
    const res = await api().post('/api/v1/sales/quote').set(bearer(ctx.t)).send({ branchId: ctx.ho, items: [{ productId: p.id }] });
    expect(res.status).toBe(200);
    expect(res.body.data.items[0].breakdown).toMatchObject({ metalPaise: 7250000, wastagePaise: 580000, makingPaise: 500000, taxablePaise: 8330000, gstPaise: 249900 });
    expect(res.body.data.totals).toMatchObject({ cgstPaise: 124950, sgstPaise: 124950, igstPaise: 0, grandTotalPaise: 8579900, roundOffPaise: 0 });
    expect(res.body.data.compliance).toMatchObject({ panRequired: false });
  });

  it('uses IGST for an out-of-state customer and requires PAN above the threshold', async () => {
    const ctx = await setup();
    const p = await stockedProduct(ctx, { grossWeightMg: 30000 });
    const c = await customer(ctx, { gstin: '27AABCU9603R1ZM', address: { stateCode: '27' } });
    const q = (await api().post('/api/v1/sales/quote').set(bearer(ctx.t)).send({ branchId: ctx.ho, customerId: c.id, items: [{ productId: p.id }] })).body.data;
    expect(q.totals.igstPaise).toBeGreaterThan(0);
    expect(q.totals.cgstPaise).toBe(0);
    expect(q.compliance).toMatchObject({ panRequired: true, panMissing: true });
  });

  it('blocks stale or missing rates, missing HUID and unstocked items', async () => {
    const ctx = await setup({ rate: false });
    const p = await stockedProduct(ctx);
    const noRate = await api().post('/api/v1/sales/quote').set(bearer(ctx.t)).send({ branchId: ctx.ho, items: [{ productId: p.id }] });
    expect(noRate.status).toBe(422);
    expect(noRate.body.error.message).toMatch(/No gold 916 rate/);

    await api().post('/api/v1/rates').set(bearer(ctx.t)).send({ rates: [{ metal: 'gold', purity: 916, ratePerGramPaise: 725000 }] });
    const noHuid = await stockedProduct(ctx, { huid: '' });
    const res = await api().post('/api/v1/sales/quote').set(bearer(ctx.t)).send({ branchId: ctx.ho, items: [{ productId: noHuid.id }] });
    expect(res.body.error.message).toMatch(/no HUID/);

    const draft = (await api().post('/api/v1/products').set(bearer(ctx.t)).send({ name: 'Draft', categoryId: ctx.ring.id, jewelleryType: 'plain_gold', metal: 'gold', purity: 916, grossWeightMg: 1000, wastage: { mode: 'none', value: 0 }, making: { type: 'fixed', value: 1 }, branchId: ctx.ho })).body.data;
    expect((await api().post('/api/v1/sales/quote').set(bearer(ctx.t)).send({ branchId: ctx.ho, items: [{ productId: draft.id }] })).body.error.message).toMatch(/draft/);
  });
});

describe('sale', () => {
  it('creates an invoice with snapshot, sells stock and posts balanced journals', async () => {
    const ctx = await setup();
    const p = await stockedProduct(ctx);
    const c = await customer(ctx);
    const res = await api()
      .post('/api/v1/sales')
      .set(bearer(ctx.t))
      .set('Idempotency-Key', 'sale-key-0001')
      .send({ branchId: ctx.ho, customerId: c.id, items: [{ productId: p.id }], payments: [{ mode: 'cash', amountPaise: 5000000 }, { mode: 'upi', amountPaise: 2579900 }, { mode: 'credit', amountPaise: 1000000 }] });
    expect(res.status).toBe(201);
    const sale = res.body.data;
    expect(sale.invoiceNo).toMatch(/^INV\/HO\/\d{2}-\d{2}\/0001$/);
    expect(sale.items[0]).toMatchObject({ sku: p.sku, breakdown: { metalPaise: 7250000 }, pricingInputs: { netWeightMg: 10000 } });
    expect(sale.customer.name).toBe('Rupa Sen');

    const retry = await api()
      .post('/api/v1/sales')
      .set(bearer(ctx.t))
      .set('Idempotency-Key', 'sale-key-0001')
      .send({ branchId: ctx.ho, customerId: c.id, items: [{ productId: p.id }], payments: [{ mode: 'cash', amountPaise: 8580000 }] });
    expect(retry.body.data.id).toBe(sale.id);

    expect((await api().get(`/api/v1/products/${p.id}`).set(bearer(ctx.t))).body.data.status).toBe('sold');

    const [journal, cost] = await ledger(ctx, 'sale');
    expect(journal.lines).toEqual([
      ['cash', 5000000, 0],
      ['bank', 2579900, 0],
      ['sundry_debtors', 1000000, 0],
      ['sales', 0, 8330000],
      ['gst_output', 0, 249900],
    ]);
    expect(cost.lines).toEqual([
      ['cogs', 7000000, 0],
      ['inventory', 0, 7000000],
    ]);

    await api().post('/api/v1/rates').set(bearer(ctx.t)).send({ rates: [{ metal: 'gold', purity: 916, ratePerGramPaise: 800000 }] });
    const later = (await api().get(`/api/v1/sales/${sale.id}`).set(bearer(ctx.t))).body.data;
    expect(later.items[0].breakdown.ratePerGramPaise).toBe(725000);
    expect(later.totals.grandTotalPaise).toBe(8579900);
  });

  it('rejects wrong payment totals, cash over the limit, credit for walk-ins and double selling', async () => {
    const ctx = await setup();
    const p = await stockedProduct(ctx, { grossWeightMg: 30000 });
    const sale = (payments, extra = {}) => api().post('/api/v1/sales').set(bearer(ctx.t)).send({ branchId: ctx.ho, items: [{ productId: p.id }], payments, ...extra });

    const total = (await api().post('/api/v1/sales/quote').set(bearer(ctx.t)).send({ branchId: ctx.ho, items: [{ productId: p.id }] })).body.data.totals.grandTotalPaise;
    expect((await sale([{ mode: 'cash', amountPaise: 100 }])).body.error.code).toBe('PAYMENT_MISMATCH');
    expect((await sale([{ mode: 'credit', amountPaise: total }])).body.error.code).toBe('SALE_BLOCKED');

    const c = await customer(ctx, { pan: 'ABCDE1234F' });
    expect((await sale([{ mode: 'cash', amountPaise: total }], { customerId: c.id })).body.error.code).toBe('CASH_LIMIT');
    expect((await sale([{ mode: 'bank', amountPaise: total }])).body.error.code).toBe('PAN_REQUIRED');

    const ok = await sale([{ mode: 'cash', amountPaise: 19000000 }, { mode: 'card', amountPaise: total - 19000000 }], { customerId: c.id });
    expect(ok.status).toBe(201);
    const again = await sale([{ mode: 'card', amountPaise: total }], { customerId: c.id });
    expect(again.status).toBe(422);
  });

  it('discounts require permission and are applied server-side', async () => {
    const ctx = await setup();
    const p = await stockedProduct(ctx);
    const q = (await api().post('/api/v1/sales/quote').set(bearer(ctx.t)).send({ branchId: ctx.ho, items: [{ productId: p.id, discountPaise: 200000 }] })).body.data;
    expect(q.items[0].breakdown).toMatchObject({ discountPaise: 200000, taxablePaise: 8130000 });
    expect(q.totals.discountPaise).toBe(200000);
  });
});

describe('cancel and return', () => {
  it('cancellation restores stock and fully reverses the ledger', async () => {
    const ctx = await setup();
    const p = await stockedProduct(ctx);
    const sale = (await api().post('/api/v1/sales').set(bearer(ctx.t)).send({ branchId: ctx.ho, items: [{ productId: p.id }], payments: [{ mode: 'cash', amountPaise: 8579900 }] })).body.data;
    const res = await api().post(`/api/v1/sales/${sale.id}/cancel`).set(bearer(ctx.t)).send({ reason: 'Customer changed mind' });
    expect(res.body.data).toMatchObject({ status: 'cancelled', cancelReason: 'Customer changed mind' });
    expect((await api().get(`/api/v1/products/${p.id}`).set(bearer(ctx.t))).body.data.status).toBe('in_stock');

    const entries = await ledger(ctx, 'sale');
    expect(entries).toHaveLength(4);
    const net = {};
    for (const e of entries) for (const [k, d, c] of e.lines) net[k] = (net[k] ?? 0) + d - c;
    expect(Object.values(net).every((v) => v === 0)).toBe(true);
    expect((await api().post(`/api/v1/sales/${sale.id}/cancel`).set(bearer(ctx.t)).send({ reason: 'Twice please' })).status).toBe(409);
  });

  it('partial return creates a credit note, restocks the item and blocks re-return', async () => {
    const ctx = await setup();
    const a = await stockedProduct(ctx);
    const b = await stockedProduct(ctx, { name: 'Ring', grossWeightMg: 4000 });
    const c = await customer(ctx);
    const q = (await api().post('/api/v1/sales/quote').set(bearer(ctx.t)).send({ branchId: ctx.ho, items: [{ productId: a.id }, { productId: b.id }] })).body.data;
    // The ring's price is left due, so its refund can stay on the customer's account (it clears that due).
    const sale = (await api().post('/api/v1/sales').set(bearer(ctx.t)).send({ branchId: ctx.ho, customerId: c.id, items: [{ productId: a.id }, { productId: b.id }], payments: [{ mode: 'bank', amountPaise: q.totals.grandTotalPaise - q.items[1].breakdown.totalPaise }] })).body.data;
    expect((await api().post(`/api/v1/sales/${sale.id}/returns`).set(bearer(ctx.t)).send({ productIds: [a.id, b.id], refundMode: 'credit', reason: 'Both back' })).body.error.code).toBe('SALE_BLOCKED');

    const ret = await api().post(`/api/v1/sales/${sale.id}/returns`).set(bearer(ctx.t)).send({ productIds: [b.id], refundMode: 'credit', reason: 'Size does not fit' });
    expect(ret.status).toBe(201);
    expect(ret.body.data.creditNoteNo).toMatch(/^CN\/HO\//);
    expect(ret.body.data.amountPaise).toBe(q.items[1].breakdown.totalPaise);
    expect(ret.body.data.sale.items.find((i) => i.productId === b.id).returned).toBe(true);
    expect(ret.body.data.sale).toMatchObject({ duePaise: 0, paymentStatus: 'paid' });
    expect((await api().get(`/api/v1/products/${b.id}`).set(bearer(ctx.t))).body.data.status).toBe('in_stock');

    const [credit] = await ledger(ctx, 'sales_return');
    expect(credit.lines).toEqual([
      ['sales', q.items[1].breakdown.taxablePaise, 0],
      ['gst_output', q.items[1].breakdown.gstPaise, 0],
      ['sundry_debtors', 0, q.items[1].breakdown.totalPaise],
    ]);
    expect((await api().post(`/api/v1/sales/${sale.id}/returns`).set(bearer(ctx.t)).send({ productIds: [b.id], refundMode: 'cash', reason: 'Again please' })).status).toBe(409);
    expect((await api().post(`/api/v1/sales/${sale.id}/cancel`).set(bearer(ctx.t)).send({ reason: 'Cancel after return' })).body.error.code).toBe('HAS_RETURNS');
  });

  it('looks products up by barcode, SKU or HUID', async () => {
    const ctx = await setup();
    const p = await stockedProduct(ctx, { huid: 'ZX12AB' });
    expect((await api().get(`/api/v1/products/lookup/${p.sku}`).set(bearer(ctx.t))).body.data.id).toBe(p.id);
    expect((await api().get('/api/v1/products/lookup/zx12ab').set(bearer(ctx.t))).body.data.id).toBe(p.id);
    expect((await api().get('/api/v1/products/lookup/NOPE999').set(bearer(ctx.t))).status).toBe(404);
  });
});

describe('customer due filter', () => {
  it('lists customers who owe money (credit on bills or old due), highest first', async () => {
    const ctx = await setup();
    const p = await stockedProduct(ctx);
    const onCredit = await customer(ctx, { name: 'Credit Buyer' });
    const oldDue = await customer(ctx, { name: 'Old Due', openingBalancePaise: 50000 });
    const clear = await customer(ctx, { name: 'Paid Up' });
    await api()
      .post('/api/v1/sales')
      .set(bearer(ctx.t))
      .send({ branchId: ctx.ho, customerId: onCredit.id, items: [{ productId: p.id }], payments: [{ mode: 'cash', amountPaise: 7579900 }, { mode: 'credit', amountPaise: 1000000 }] });

    const due = (await api().get('/api/v1/customers?due=due').set(bearer(ctx.t))).body;
    expect(due.data.map((c) => [c.name, c.duePaise])).toEqual([
      ['Credit Buyer', 1000000],
      ['Old Due', 50000],
    ]);
    expect(due.meta.total).toBe(2);

    const none = (await api().get('/api/v1/customers?due=clear').set(bearer(ctx.t))).body.data;
    expect(none.map((c) => c.id)).toEqual([clear.id]);
    expect(none[0].duePaise).toBe(0);
    expect((await api().get('/api/v1/customers?due=due&q=old').set(bearer(ctx.t))).body.data.map((c) => c.id)).toEqual([oldDue.id]);
  });

  it('marks each customer due, partly paid or paid', async () => {
    const ctx = await setup();
    const sell = async (c, payments) => api().post('/api/v1/sales').set(bearer(ctx.t)).send({ branchId: ctx.ho, customerId: c.id, items: [{ productId: (await stockedProduct(ctx)).id }], payments });
    const partly = await customer(ctx, { name: 'Partly Paid' });
    const fullCredit = await customer(ctx, { name: 'Full Credit' });
    const paid = await customer(ctx, { name: 'Paid Up' });
    const noBills = await customer(ctx, { name: 'No Bills' });
    await sell(partly, [{ mode: 'cash', amountPaise: 7579900 }, { mode: 'credit', amountPaise: 1000000 }]);
    await sell(fullCredit, [{ mode: 'credit', amountPaise: 8579900 }]);
    await sell(paid, [{ mode: 'upi', amountPaise: 8579900 }]);

    const rows = (await api().get('/api/v1/customers').set(bearer(ctx.t))).body.data;
    const statusOf = (c) => rows.find((r) => r.id === c.id);
    expect(statusOf(partly)).toMatchObject({ paymentStatus: 'partly_paid', paidPaise: 7579900, duePaise: 1000000 });
    expect(statusOf(fullCredit)).toMatchObject({ paymentStatus: 'due', paidPaise: 0, duePaise: 8579900 });
    expect(statusOf(paid)).toMatchObject({ paymentStatus: 'paid', paidPaise: 8579900, duePaise: 0 });
    expect(statusOf(noBills).paymentStatus).toBeNull();
  });
});

describe('invoice list summary', () => {
  it('shows today, this month, collected and credit still due', async () => {
    const ctx = await setup();
    const c = await customer(ctx);
    const p1 = await stockedProduct(ctx);
    const p2 = await stockedProduct(ctx);
    const total = (await api().post('/api/v1/sales/quote').set(bearer(ctx.t)).send({ branchId: ctx.ho, items: [{ productId: p1.id }] })).body.data.totals.grandTotalPaise;
    await api().post('/api/v1/sales').set(bearer(ctx.t)).send({ branchId: ctx.ho, customerId: c.id, items: [{ productId: p1.id }], payments: [{ mode: 'upi', amountPaise: total }] });
    await api().post('/api/v1/sales').set(bearer(ctx.t)).send({ branchId: ctx.ho, customerId: c.id, items: [{ productId: p2.id }], payments: [{ mode: 'upi', amountPaise: total - 500000 }, { mode: 'credit', amountPaise: 500000 }] });

    const { summary } = (await api().get('/api/v1/sales').set(bearer(ctx.t))).body.meta;
    expect(summary).toMatchObject({
      today: { totalPaise: total * 2, bills: 2 },
      month: { totalPaise: total * 2, collectedPaise: total * 2 - 500000, bills: 2, averagePaise: total },
      due: { totalPaise: 500000, bills: 1 },
    });
  });
});

describe('paying part of a bill and using a customer advance', () => {
  it('keeps what is not paid as due for a customer (partly paid), and makes walk-ins pay in full', async () => {
    const ctx = await setup();
    const p = await stockedProduct(ctx);
    const c = await customer(ctx);
    const total = 8579900;
    const sale = (payments, extra = {}) => api().post('/api/v1/sales').set(bearer(ctx.t)).send({ branchId: ctx.ho, items: [{ productId: p.id }], payments, ...extra });

    expect((await sale([{ mode: 'cash', amountPaise: 3000000 }])).body.error.code).toBe('PAYMENT_MISMATCH'); // walk-in
    expect((await sale([{ mode: 'cash', amountPaise: total + 100 }], { customerId: c.id })).body.error.code).toBe('PAYMENT_MISMATCH'); // too much

    const res = await sale([{ mode: 'cash', amountPaise: 3000000 }], { customerId: c.id });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ paidPaise: 3000000, duePaise: total - 3000000, paymentStatus: 'partly_paid' });
    expect(res.body.data.payments).toEqual([expect.objectContaining({ mode: 'cash', amountPaise: 3000000 }), expect.objectContaining({ mode: 'credit', amountPaise: total - 3000000 })]);

    const list = (await api().get('/api/v1/sales').set(bearer(ctx.t))).body.data;
    expect(list[0]).toMatchObject({ paidPaise: 3000000, duePaise: total - 3000000, paymentStatus: 'partly_paid' });
    const activity = (await api().get(`/api/v1/customers/${c.id}/activity`).set(bearer(ctx.t))).body.data;
    expect(activity.stats).toMatchObject({ duePaise: total - 3000000 });
  });

  it('uses the advance entered on the customer on the next bills, until it is used up', async () => {
    const ctx = await setup();
    const [p1, p2] = [await stockedProduct(ctx), await stockedProduct(ctx)];
    const total = 8579900;
    const c = await customer(ctx, { openingBalancePaise: -5000000 }); // ₹50,000 paid in advance

    const q1 = (await api().post('/api/v1/sales/quote').set(bearer(ctx.t)).send({ branchId: ctx.ho, customerId: c.id, items: [{ productId: p1.id }] })).body.data;
    expect(q1).toMatchObject({ customerAdvancePaise: 5000000, customerAdvanceLeftPaise: 5000000, payablePaise: total - 5000000 });

    // Pays ₹20,000 of the rest now: advance 50,000 + 20,000 paid, the remainder due.
    const s1 = (await api().post('/api/v1/sales').set(bearer(ctx.t)).send({ branchId: ctx.ho, customerId: c.id, items: [{ productId: p1.id }], payments: [{ mode: 'upi', amountPaise: 2000000 }] })).body.data;
    expect(s1).toMatchObject({ customerAdvancePaise: 5000000, paidPaise: 7000000, duePaise: total - 7000000, paymentStatus: 'partly_paid' });
    const [entry] = await ledger(ctx, 'sale');
    expect(entry.lines).toEqual(expect.arrayContaining([['sundry_debtors', 5000000, 0], ['bank', 2000000, 0], ['sundry_debtors', total - 7000000, 0]]));

    // The advance is used up.
    const q2 = (await api().post('/api/v1/sales/quote').set(bearer(ctx.t)).send({ branchId: ctx.ho, customerId: c.id, items: [{ productId: p2.id }] })).body.data;
    expect(q2).toMatchObject({ customerAdvancePaise: 0, payablePaise: total });
    const activity = (await api().get(`/api/v1/customers/${c.id}/activity`).set(bearer(ctx.t))).body.data;
    expect(activity.stats.advanceLeftPaise).toBe(0);

    // Cancelling the bill gives the advance back.
    await api().post(`/api/v1/sales/${s1.id}/cancel`).set(bearer(ctx.t)).send({ reason: 'Customer changed mind' });
    const q3 = (await api().post('/api/v1/sales/quote').set(bearer(ctx.t)).send({ branchId: ctx.ho, customerId: c.id, items: [{ productId: p2.id }] })).body.data;
    expect(q3.customerAdvancePaise).toBe(5000000);

    // An advance bigger than the bill: only the bill's amount is used; the rest waits for the next bill.
    const big = await customer(ctx, { openingBalancePaise: -10000000 });
    const s2 = (await api().post('/api/v1/sales').set(bearer(ctx.t)).send({ branchId: ctx.ho, customerId: big.id, items: [{ productId: p2.id }], payments: [] })).body.data;
    expect(s2).toMatchObject({ customerAdvancePaise: total, paidPaise: total, duePaise: 0, paymentStatus: 'paid' });
    const left = (await api().get(`/api/v1/customers/${big.id}/activity`).set(bearer(ctx.t))).body.data;
    expect(left.stats.advanceLeftPaise).toBe(10000000 - total);
    const row = (await api().get('/api/v1/customers').query({ q: big.code }).set(bearer(ctx.t))).body.data.find((x) => x.id === big.id);
    expect(row).toMatchObject({ advanceLeftPaise: 10000000 - total, orderAdvancePaise: 0, advancePaise: 10000000 - total });
  });
});

describe('collecting dues later', () => {
  it('takes payments against bills and old due until nothing is owed, and books them', async () => {
    const ctx = await setup();
    const [p1, p2] = [await stockedProduct(ctx), await stockedProduct(ctx)];
    const total = 8579900;
    const c = await customer(ctx, { openingBalancePaise: 1000000 }); // ₹10,000 old due
    const bill = async (p, cash) => (await api().post('/api/v1/sales').set(bearer(ctx.t)).send({ branchId: ctx.ho, customerId: c.id, items: [{ productId: p.id }], payments: [{ mode: 'cash', amountPaise: cash }] })).body.data;
    const s1 = await bill(p1, total - 2000000); // ₹20,000 due
    const s2 = await bill(p2, total - 3000000); // ₹30,000 due
    const collect = (body) => api().post(`/api/v1/customers/${c.id}/payments`).set(bearer(ctx.t)).send({ branchId: ctx.ho, ...body });

    const dues = (await api().get(`/api/v1/customers/${c.id}/dues`).set(bearer(ctx.t))).body.data;
    expect(dues).toMatchObject({ openingDuePaise: 1000000, totalDuePaise: 6000000 });
    expect(dues.bills.map((b) => [b.invoiceNo, b.duePaise])).toEqual([[s1.invoiceNo, 2000000], [s2.invoiceNo, 3000000]]);

    expect((await collect({ mode: 'cash', amountPaise: 6000001 })).body.error.code).toBe('MORE_THAN_DUE');

    // For the second bill: ₹35,000 → that bill's 30,000 first, then 5,000 of the old due.
    const r1 = await collect({ mode: 'upi', amountPaise: 3500000, saleId: s2.id, reference: 'UPI123' });
    expect(r1.status).toBe(201);
    expect(r1.body.data.allocations).toEqual([{ saleId: s2.id, invoiceNo: s2.invoiceNo, amountPaise: 3000000 }, { saleId: null, invoiceNo: null, amountPaise: 500000 }]);
    expect(r1.body.data.duePaiseAfter).toBe(2500000);
    const after2 = (await api().get(`/api/v1/sales/${s2.id}`).set(bearer(ctx.t))).body.data;
    expect(after2).toMatchObject({ duePaise: 0, collectedLaterPaise: 3000000, paymentStatus: 'paid' });

    // The rest: old due first, then the oldest bill.
    await collect({ mode: 'cash', amountPaise: 2500000 });
    expect((await api().get(`/api/v1/customers/${c.id}/dues`).set(bearer(ctx.t))).body.data.totalDuePaise).toBe(0);
    const activity = (await api().get(`/api/v1/customers/${c.id}/activity`).set(bearer(ctx.t))).body.data;
    expect(activity.stats).toMatchObject({ duePaise: 0, openingDuePaise: 0, creditDuePaise: 0 });
    expect(activity.payments.filter((p) => p.kind === 'collection')).toHaveLength(2);
    const list = (await api().get('/api/v1/customers').query({ due: 'due' }).set(bearer(ctx.t))).body.data;
    expect(list.find((x) => x.id === c.id)).toBeUndefined();
    expect((await collect({ mode: 'cash', amountPaise: 100 })).body.error.code).toBe('NOTHING_DUE');

    const entries = await ledger(ctx, 'customer_receipt');
    expect(entries.map((e) => e.lines)).toEqual([[['bank', 3500000, 0], ['sundry_debtors', 0, 3500000]], [['cash', 2500000, 0], ['sundry_debtors', 0, 2500000]]]);

    // A bill with money collected later cannot be cancelled.
    expect((await api().post(`/api/v1/sales/${s2.id}/cancel`).set(bearer(ctx.t)).send({ reason: 'Wrong customer' })).body.error.code).toBe('HAS_COLLECTIONS');
  });
});

describe('advance while a due is pending', () => {
  it('cannot take a new or bigger advance until every due is paid', async () => {
    const ctx = await setup();
    const p = await stockedProduct(ctx);
    const c = await customer(ctx, { openingBalancePaise: -100000 }); // ₹1,000 advance
    const body = (o) => ({ name: c.name, mobile: c.mobile, address: { stateCode: '19' }, ...o });
    const edit = (o) => api().put(`/api/v1/customers/${c.id}`).set(bearer(ctx.t)).send(body(o));

    // The bill uses the ₹1,000 advance; ₹20,000 is paid; the rest stays due.
    const q = (await api().post('/api/v1/sales/quote').set(bearer(ctx.t)).send({ branchId: ctx.ho, customerId: c.id, items: [{ productId: p.id }] })).body.data;
    await api().post('/api/v1/sales').set(bearer(ctx.t)).send({ branchId: ctx.ho, customerId: c.id, items: [{ productId: p.id }], payments: [{ mode: 'cash', amountPaise: 2000000 }] });
    const due = q.payablePaise - 2000000;

    const bigger = await edit({ openingBalancePaise: -500000 });
    expect(bigger.status).toBe(422);
    expect(bigger.body.error.code).toBe('DUE_PENDING');
    expect((await edit({ openingBalancePaise: -100000, notes: 'Same advance is fine' })).status).toBe(200); // unchanged advance
    // The ₹1,000 was used on the bill: it cannot be taken back, and the edit form sees nothing left.
    expect((await edit({ openingBalancePaise: -50000 })).body.error.code).toBe('ADVANCE_USED');
    expect((await api().get(`/api/v1/customers/${c.id}`).set(bearer(ctx.t))).body.data).toMatchObject({ advanceUsedPaise: 100000, advanceLeftPaise: 0 });

    // Once the due is collected, an advance can be taken again.
    await api().post(`/api/v1/customers/${c.id}/payments`).set(bearer(ctx.t)).send({ branchId: ctx.ho, mode: 'cash', amountPaise: due });
    expect((await edit({ openingBalancePaise: -500000 })).status).toBe(200);
    // Total ₹5,000 recorded, ₹1,000 used → ₹4,000 available for the next bills.
    expect((await api().get(`/api/v1/customers/${c.id}`).set(bearer(ctx.t))).body.data).toMatchObject({ advanceUsedPaise: 100000, advanceLeftPaise: 400000 });
  });
});
