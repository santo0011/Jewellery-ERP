import { describe, expect, it } from 'vitest';
import { runWithContext } from '../src/core/context/requestContext.js';
import { Account } from '../src/core/ledger/account.model.js';
import { JournalEntry } from '../src/core/ledger/journalEntry.model.js';
import { api, bearer, registerOrg } from './helpers.js';

// One customer through advance, part payments, a later collection and a return: every screen must show the same
// amount owed, and it must match the customer's account in the ledger.

async function setup() {
  const owner = await registerOrg();
  const t = owner.token;
  const me = (await api().get('/api/v1/auth/me').set(bearer(t))).body.data;
  const ring = (await api().get('/api/v1/categories').set(bearer(t))).body.data.find((c) => c.name === 'Ring');
  await api().post('/api/v1/rates').set(bearer(t)).send({ rates: [{ metal: 'gold', purity: 916, ratePerGramPaise: 725000 }] });
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

/** The customer's balance on the customer account (sundry debtors) in the ledger: plus = they owe, minus = advance held. */
const ledgerBalance = (ctx, customerId) =>
  runWithContext({ organisationId: ctx.orgId }, async () => {
    const debtors = await Account.findOne({ systemKey: 'sundry_debtors' }).lean();
    const entries = await JournalEntry.find({ 'lines.party.id': customerId }).lean();
    return entries.flatMap((e) => e.lines).filter((l) => String(l.accountId) === String(debtors._id) && String(l.party?.id) === customerId).reduce((s, l) => s + l.debitPaise - l.creditPaise, 0);
  });

/** What each screen says the customer owes. */
async function everyScreen(ctx, c) {
  const get = (url, query = {}) => api().get(url).query(query).set(bearer(ctx.t));
  const [dues, row, activity, outstanding, invoices] = await Promise.all([
    get(`/api/v1/customers/${c.id}/dues`),
    get('/api/v1/customers', { q: c.code }),
    get(`/api/v1/customers/${c.id}/activity`),
    get('/api/v1/reports/customer-outstanding'),
    get('/api/v1/sales'),
  ]);
  const listed = row.body.data.find((x) => x.id === c.id);
  return {
    collectDialog: dues.body.data.totalDuePaise,
    customersList: listed.duePaise,
    customerPage: activity.body.data.stats.duePaise,
    outstandingReport: outstanding.body.data.rows.find((r) => r.code === c.code)?.duePaise ?? 0,
    invoicesCard: invoices.body.data.length ? invoices.body.meta.summary.due.totalPaise : 0,
    ledger: await ledgerBalance(ctx, c.id),
    advanceLeft: listed.advanceLeftPaise,
    status: listed.paymentStatus,
  };
}

describe('customer money adds up everywhere', () => {
  it('advance, part payments, collection and a return give the same due on every screen and in the ledger', async () => {
    const ctx = await setup();
    const [p1, p2] = [await stockedProduct(ctx), await stockedProduct(ctx)];
    const small = await stockedProduct(ctx, { name: 'Ring', grossWeightMg: 4000 });
    const T = 8579900; // one 10 g chain, GST included
    const c = (await api().post('/api/v1/customers').set(bearer(ctx.t)).send({ name: 'Mita Das', mobile: '9876500011', address: { stateCode: '19' }, openingBalancePaise: -5000000 })).body.data; // ₹50,000 advance
    const same = (v, extra) => ({ collectDialog: v, customersList: v, customerPage: v, outstandingReport: v, invoicesCard: v, ledger: v, ...extra });

    // Before any bill: nothing owed, the ₹50,000 advance shows as a minus on the ledger.
    expect(await everyScreen(ctx, c)).toMatchObject({ collectDialog: 0, customersList: 0, ledger: -5000000, advanceLeft: 5000000 });

    // Bill 1: the advance pays ₹50,000, UPI ₹20,000, the rest stays due.
    const s1 = (await api().post('/api/v1/sales').set(bearer(ctx.t)).send({ branchId: ctx.ho, customerId: c.id, useCustomerAdvance: true, items: [{ productId: p1.id }], payments: [{ mode: 'upi', amountPaise: 2000000 }] })).body.data;
    expect(s1).toMatchObject({ customerAdvancePaise: 5000000, paidPaise: 7000000, duePaise: T - 7000000, paymentStatus: 'partly_paid' });
    expect(await everyScreen(ctx, c)).toMatchObject(same(T - 7000000, { advanceLeft: 0, status: 'partly_paid' }));

    // Bill 2 (chain + small ring): the advance is used up, so nothing more is taken from it; ₹10,000 + the ring's price left due.
    const q2 = (await api().post('/api/v1/sales/quote').set(bearer(ctx.t)).send({ branchId: ctx.ho, customerId: c.id, useCustomerAdvance: true, items: [{ productId: p2.id }, { productId: small.id }] })).body.data;
    expect(q2.customerAdvancePaise).toBe(0);
    const ringPrice = q2.items[1].breakdown.totalPaise;
    const due2 = ringPrice + 1000000;
    const s2 = (await api().post('/api/v1/sales').set(bearer(ctx.t)).send({ branchId: ctx.ho, customerId: c.id, useCustomerAdvance: true, items: [{ productId: p2.id }, { productId: small.id }], payments: [{ mode: 'cash', amountPaise: q2.payablePaise - due2 }] })).body.data;
    expect(s2.duePaise).toBe(due2);
    expect(await everyScreen(ctx, c)).toMatchObject(same(T - 7000000 + due2));

    // Collected later against bill 1: ₹5,799 → ₹10,000 left on it.
    await api().post(`/api/v1/customers/${c.id}/payments`).set(bearer(ctx.t)).send({ branchId: ctx.ho, mode: 'cash', amountPaise: T - 8000000, saleId: s1.id });
    expect((await api().get(`/api/v1/sales/${s1.id}`).set(bearer(ctx.t))).body.data).toMatchObject({ duePaise: 1000000, collectedLaterPaise: T - 8000000 });
    expect(await everyScreen(ctx, c)).toMatchObject(same(1000000 + due2));

    // The ring comes back and its price is taken off bill 2's due (refund kept on the account).
    const back = await api().post(`/api/v1/sales/${s2.id}/returns`).set(bearer(ctx.t)).send({ productIds: [small.id], refundMode: 'credit', reason: 'Size does not fit' });
    expect(back.status).toBe(201);
    expect(back.body.data.sale).toMatchObject({ duePaise: 1000000, paymentStatus: 'partly_paid' });
    expect(await everyScreen(ctx, c)).toMatchObject(same(2000000));

    // The chain is worth more than what is still due on bill 2: that refund cannot stay on the account.
    const tooMuch = await api().post(`/api/v1/sales/${s2.id}/returns`).set(bearer(ctx.t)).send({ productIds: [p2.id], refundMode: 'credit', reason: 'Changed mind' });
    expect(tooMuch.status).toBe(422);
    expect(tooMuch.body.error.message).toMatch(/Refund by cash or bank/);

    // Everything collected: every screen is clear and the ledger is at zero.
    const last = await api().post(`/api/v1/customers/${c.id}/payments`).set(bearer(ctx.t)).send({ branchId: ctx.ho, mode: 'upi', amountPaise: 2000000 });
    expect(last.body.data.duePaiseAfter).toBe(0);
    expect(await everyScreen(ctx, c)).toMatchObject(same(0, { advanceLeft: 0, status: 'paid' }));
  });

  it('an advance received as money can be lowered (the difference is paid back) and raised again', async () => {
    const ctx = await setup();
    const base = { name: 'Refund Das', mobile: '9876500022', address: { stateCode: '19' } };
    const c = (await api().post('/api/v1/customers').set(bearer(ctx.t)).send({ ...base, openingBalancePaise: -3000000, advancePayment: { branchId: ctx.ho, mode: 'cash' } })).body.data;
    const edit = (body) => api().put(`/api/v1/customers/${c.id}`).set(bearer(ctx.t)).send({ ...base, ...body });
    const cash = () =>
      runWithContext({ organisationId: ctx.orgId }, async () => {
        const acc = await Account.findOne({ systemKey: 'cash' }).lean();
        const entries = await JournalEntry.find({ 'lines.accountId': acc._id }).lean();
        return entries.flatMap((e) => e.lines).filter((l) => String(l.accountId) === String(acc._id)).reduce((s, l) => s + l.debitPaise - l.creditPaise, 0);
      });

    // Lowering below what was received needs to say how the money goes back, on the field it belongs to.
    const noMode = await edit({ openingBalancePaise: -1000000 });
    expect(noMode.status).toBe(422);
    expect(noMode.body.error.details[0].path).toBe('advancePayment.mode');

    // ₹30,000 → ₹10,000: ₹20,000 paid back in cash; the customer's account and the cash book both move.
    expect((await edit({ openingBalancePaise: -1000000, advancePayment: { branchId: ctx.ho, mode: 'cash' } })).status).toBe(200);
    expect((await api().get(`/api/v1/customers/${c.id}`).set(bearer(ctx.t))).body.data).toMatchObject({ openingBalancePaise: -1000000, advanceReceivedPaise: 1000000, advanceLeftPaise: 1000000 });
    expect(await ledgerBalance(ctx, c.id)).toBe(-1000000);
    expect(await cash()).toBe(1000000);
    const activity = (await api().get(`/api/v1/customers/${c.id}/activity`).set(bearer(ctx.t))).body.data;
    expect(activity.payments.find((p) => p.kind === 'customer_advance_refund')).toMatchObject({ amountPaise: -2000000, mode: 'cash' });

    // Raised again to ₹15,000: the extra ₹5,000 is a new receipt.
    expect((await edit({ openingBalancePaise: -1500000, advancePayment: { branchId: ctx.ho, mode: 'cash' } })).status).toBe(200);
    expect(await ledgerBalance(ctx, c.id)).toBe(-1500000);
    expect(await cash()).toBe(1500000);
  });

  it('an order advance shows while the order is open and is taken off the bill that delivers it, even when the order is not picked', async () => {
    const ctx = await setup();
    const c = (await api().post('/api/v1/customers').set(bearer(ctx.t)).send({ name: 'Order Customer', mobile: '9876500022', address: { stateCode: '19' } })).body.data;
    const row = async () => (await api().get('/api/v1/customers').query({ q: c.code }).set(bearer(ctx.t))).body.data.find((x) => x.id === c.id);
    const order = (
      await api()
        .post('/api/v1/orders')
        .set(bearer(ctx.t))
        .send({ branchId: ctx.ho, customerId: c.id, items: [{ description: 'Ring', categoryId: ctx.ring.id, metal: 'gold', purity: 916, approxWeightMg: 10000, estimatedPaise: 9000000 }], advance: { mode: 'cash', amountPaise: 2000000 } })
    ).body.data;
    expect(await row()).toMatchObject({ duePaise: 0, orderAdvancePaise: 2000000, advancePaise: 2000000 });
    expect(await ledgerBalance(ctx, c.id)).toBe(0); // the order advance is held apart from the customer's account

    const piece = (await api().post(`/api/v1/orders/${order.id}/items/0/finish`).set(bearer(ctx.t)).send({ grossWeightMg: 10000, huid: 'MNY001', wastage: { mode: 'none', value: 0 }, making: { type: 'per_gram', value: 40000 } })).body.data.items[0]
      .product;
    // Billed without choosing the order: it is linked by itself and its ₹20,000 advance comes off.
    const q = (await api().post('/api/v1/sales/quote').set(bearer(ctx.t)).send({ branchId: ctx.ho, customerId: c.id, useCustomerAdvance: true, items: [{ productId: piece.id }] })).body.data;
    expect(q.advancePaise).toBe(2000000);
    const sale = (await api().post('/api/v1/sales').set(bearer(ctx.t)).send({ branchId: ctx.ho, customerId: c.id, useCustomerAdvance: true, items: [{ productId: piece.id }], payments: [{ mode: 'cash', amountPaise: q.payablePaise - 1500000 }] })).body.data;
    expect(sale).toMatchObject({ order: { orderNo: order.orderNo }, advanceAdjustedPaise: 2000000, duePaise: 1500000, paymentStatus: 'partly_paid' });

    // Order delivered: its advance no longer shows; ₹15,000 due everywhere.
    expect(await everyScreen(ctx, c)).toMatchObject({ collectDialog: 1500000, customersList: 1500000, customerPage: 1500000, outstandingReport: 1500000, invoicesCard: 1500000, ledger: 1500000, advanceLeft: 0 });
    expect(await row()).toMatchObject({ orderAdvancePaise: 0, advancePaise: 0 });
  });
});
