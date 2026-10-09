import { describe, expect, it } from 'vitest';
import { runWithContext } from '../src/core/context/requestContext.js';
import { Account } from '../src/core/ledger/account.model.js';
import { JournalEntry } from '../src/core/ledger/journalEntry.model.js';
import { api, bearer, registerOrg } from './helpers.js';

async function setup() {
  const owner = await registerOrg();
  const t = owner.token;
  const me = (await api().get('/api/v1/auth/me').set(bearer(t))).body.data;
  const ring = (await api().get('/api/v1/categories').set(bearer(t))).body.data.find((c) => c.name === 'Ring');
  await api().post('/api/v1/rates').set(bearer(t)).send({ rates: [{ metal: 'gold', purity: 916, ratePerGramPaise: 725000 }] });
  const customer = (await api().post('/api/v1/customers').set(bearer(t)).send({ name: 'Rupa Sen', mobile: `98${Math.floor(10000000 + Math.random() * 89999999)}`, address: { stateCode: '19' } })).body.data;
  return { t, orgId: me.organisation.id, ho: me.branches[0].id, ring, customer };
}

async function stockedProduct(ctx) {
  const p = (
    await api()
      .post('/api/v1/products')
      .set(bearer(ctx.t))
      .send({ name: 'Bridal Ring', categoryId: ctx.ring.id, jewelleryType: 'plain_gold', metal: 'gold', purity: 916, grossWeightMg: 10000, wastage: { mode: 'percent', value: 800 }, making: { type: 'per_gram', value: 50000 }, costPricePaise: 7000000, huid: `H${Math.random().toString(36).slice(2, 7).toUpperCase()}`, branchId: ctx.ho })
  ).body.data;
  await api().post('/api/v1/inventory/opening').set(bearer(ctx.t)).send({ branchId: ctx.ho, productIds: [p.id] });
  return p;
}

const orderBody = (ctx, o = {}) => ({
  branchId: ctx.ho,
  customerId: ctx.customer.id,
  items: [{ description: '22K bridal ring, size 14', categoryId: ctx.ring.id, metal: 'gold', purity: 916, approxWeightMg: 10000, size: '14', estimatedPaise: 9000000 }],
  advance: { mode: 'cash', amountPaise: 2000000 },
  ...o,
});

const ledger = (ctx, docType) =>
  runWithContext({ organisationId: ctx.orgId }, async () => {
    const keys = new Map((await Account.find({}).lean()).map((a) => [String(a._id), a.systemKey]));
    const entries = await JournalEntry.find({ 'source.docType': docType }).sort({ createdAt: 1 }).lean();
    return entries.map((e) => e.lines.map((l) => [keys.get(String(l.accountId)), l.debitPaise, l.creditPaise]));
  });

describe('customer orders', () => {
  it('books an order with an advance, moves it through work stages and takes more advance', async () => {
    const ctx = await setup();
    const res = await api().post('/api/v1/orders').set(bearer(ctx.t)).send(orderBody(ctx));
    expect(res.status).toBe(201);
    const order = res.body.data;
    expect(order).toMatchObject({ status: 'booked', estimatedPaise: 9000000, advancePaise: 2000000, balancePaise: 7000000, customer: { name: 'Rupa Sen' } });
    expect(order.orderNo).toMatch(/^ORD\/HO\//);
    expect(order.advances[0].receiptNo).toMatch(/^RCPT\/HO\//);
    expect(await ledger(ctx, 'order')).toEqual([[['cash', 2000000, 0], ['customer_advances', 0, 2000000]]]);

    await api().patch(`/api/v1/orders/${order.id}/status`).set(bearer(ctx.t)).send({ status: 'in_progress', note: 'Sent to karigar' });
    const more = await api().post(`/api/v1/orders/${order.id}/advances`).set(bearer(ctx.t)).send({ mode: 'upi', amountPaise: 1000000, reference: 'UPI-778' });
    expect(more.body.data).toMatchObject({ advancePaise: 3000000, balancePaise: 6000000 });
    const ready = await api().patch(`/api/v1/orders/${order.id}/status`).set(bearer(ctx.t)).send({ status: 'ready' });
    expect(ready.body.data.timeline.map((s) => s.status)).toEqual(['booked', 'in_progress', 'ready']);

    const list = await api().get('/api/v1/orders?status=open').set(bearer(ctx.t));
    expect(list.body.data[0]).toMatchObject({ orderNo: order.orderNo, status: 'ready', advancePaise: 3000000 });
    expect(list.body.meta.counts.ready).toBe(1);
  });

  it('bills the order: the advance is deducted, the order is delivered, and cancelling the bill reopens it', async () => {
    const ctx = await setup();
    const p = await stockedProduct(ctx);
    const order = (await api().post('/api/v1/orders').set(bearer(ctx.t)).send(orderBody(ctx))).body.data;

    const quote = (await api().post('/api/v1/sales/quote').set(bearer(ctx.t)).send({ branchId: ctx.ho, orderId: order.id, items: [{ productId: p.id }] })).body.data;
    expect(quote).toMatchObject({ advancePaise: 2000000, order: { orderNo: order.orderNo } });
    expect(quote.payablePaise).toBe(quote.totals.grandTotalPaise - 2000000);

    const fullPayment = await api().post('/api/v1/sales').set(bearer(ctx.t)).send({ branchId: ctx.ho, orderId: order.id, items: [{ productId: p.id }], payments: [{ mode: 'cash', amountPaise: quote.totals.grandTotalPaise }] });
    expect(fullPayment.body.error.code).toBe('PAYMENT_MISMATCH');

    const sale = await api().post('/api/v1/sales').set(bearer(ctx.t)).send({ branchId: ctx.ho, orderId: order.id, items: [{ productId: p.id }], payments: [{ mode: 'card', amountPaise: quote.payablePaise }] });
    expect(sale.status).toBe(201);
    expect(sale.body.data).toMatchObject({ customer: { name: 'Rupa Sen' }, order: { orderNo: order.orderNo }, advanceAdjustedPaise: 2000000 });
    const [saleEntry] = await ledger(ctx, 'sale');
    expect(saleEntry).toContainEqual(['customer_advances', 2000000, 0]);
    expect(saleEntry).toContainEqual(['bank', quote.payablePaise, 0]);

    const delivered = (await api().get(`/api/v1/orders/${order.id}`).set(bearer(ctx.t))).body.data;
    expect(delivered).toMatchObject({ status: 'delivered', invoiceNo: sale.body.data.invoiceNo });
    expect(delivered.invoice).toMatchObject({ invoiceNo: sale.body.data.invoiceNo, grandTotalPaise: quote.totals.grandTotalPaise, advanceAdjustedPaise: 2000000, paidPaise: quote.payablePaise, duePaise: 0 });
    const again = await api().post('/api/v1/sales/quote').set(bearer(ctx.t)).send({ branchId: ctx.ho, orderId: order.id, items: [{ productId: p.id }] });
    expect(again.status).toBe(422);

    await api().post(`/api/v1/sales/${sale.body.data.id}/cancel`).set(bearer(ctx.t)).send({ reason: 'Customer changed mind' });
    const reopened = (await api().get(`/api/v1/orders/${order.id}`).set(bearer(ctx.t))).body.data;
    expect(reopened).toMatchObject({ status: 'ready', invoiceNo: null, advancePaise: 2000000 });
  });

  it('finishes an order item into a tagged, in-stock piece that bills against the order', async () => {
    const ctx = await setup();
    const order = (await api().post('/api/v1/orders').set(bearer(ctx.t)).send(orderBody(ctx))).body.data;
    const finish = (body) => api().post(`/api/v1/orders/${order.id}/items/0/finish`).set(bearer(ctx.t)).send(body);
    const body = { grossWeightMg: 10250, huid: 'AB9C7D', wastage: { mode: 'percent', value: 800 }, making: { type: 'per_gram', value: 50000 } };

    expect((await finish({ ...body, grossWeightMg: 0 })).status).toBe(400);
    const res = await finish(body);
    expect(res.status).toBe(200);
    const product = res.body.data.items[0].product;
    expect(product).toMatchObject({ status: 'in_stock', grossWeightMg: 10250, huid: 'AB9C7D' });
    expect((await finish(body)).body.error.code).toBe('ALREADY_FINISHED');

    const detail = (await api().get(`/api/v1/products/${product.id}`).set(bearer(ctx.t))).body.data;
    expect(detail).toMatchObject({ name: '22K bridal ring, size 14', metal: 'gold', purity: 916, branch: { id: ctx.ho } });
    expect(detail.description).toContain(order.orderNo);

    const quote = (await api().post('/api/v1/sales/quote').set(bearer(ctx.t)).send({ branchId: ctx.ho, orderId: order.id, items: [{ productId: product.id }] })).body.data;
    const sale = await api().post('/api/v1/sales').set(bearer(ctx.t)).send({ branchId: ctx.ho, orderId: order.id, items: [{ productId: product.id }], payments: [{ mode: 'cash', amountPaise: quote.payablePaise }] });
    expect(sale.status).toBe(201);
    expect((await api().get(`/api/v1/orders/${order.id}`).set(bearer(ctx.t))).body.data).toMatchObject({ status: 'delivered', items: [{ product: { status: 'sold' } }] });
  });

  it('uses the HUID given on the order, and a missing HUID can be added at the counter', async () => {
    const ctx = await setup();
    const charges = { wastage: { mode: 'none', value: 0 }, making: { type: 'per_gram', value: 40000 } };
    const withHuid = (await api().post('/api/v1/orders').set(bearer(ctx.t)).send(orderBody(ctx, { items: [{ description: 'Ring', metal: 'gold', purity: 916, huid: 'or12d3' }] }))).body.data;
    const finished = await api().post(`/api/v1/orders/${withHuid.id}/items/0/finish`).set(bearer(ctx.t)).send({ grossWeightMg: 5000, ...charges });
    expect(finished.body.data.items[0].product.huid).toBe('OR12D3');

    const without = (await api().post('/api/v1/orders').set(bearer(ctx.t)).send(orderBody(ctx, { items: [{ description: 'Chain', metal: 'gold', purity: 916 }] }))).body.data;
    const piece = (await api().post(`/api/v1/orders/${without.id}/items/0/finish`).set(bearer(ctx.t)).send({ grossWeightMg: 8000, ...charges })).body.data.items[0].product;
    const blocked = await api().post('/api/v1/sales/quote').set(bearer(ctx.t)).send({ branchId: ctx.ho, items: [{ productId: piece.id }] });
    expect(blocked.body.error.message).toMatch(/has no HUID/);

    expect((await api().patch(`/api/v1/products/${piece.id}/huid`).set(bearer(ctx.t)).send({ huid: 'OR12D3' })).status).toBe(409);
    const saved = await api().patch(`/api/v1/products/${piece.id}/huid`).set(bearer(ctx.t)).send({ huid: 'ch45n6' });
    expect(saved.body.data.huid).toBe('CH45N6');
    expect((await api().post('/api/v1/sales/quote').set(bearer(ctx.t)).send({ branchId: ctx.ho, items: [{ productId: piece.id }] })).status).toBe(200);
  });

  it('shows a customer everything they bought and paid', async () => {
    const ctx = await setup();
    const order = (await api().post('/api/v1/orders').set(bearer(ctx.t)).send(orderBody(ctx))).body.data;
    const piece = (
      await api().post(`/api/v1/orders/${order.id}/items/0/finish`).set(bearer(ctx.t)).send({ grossWeightMg: 10000, huid: 'CU5T01', wastage: { mode: 'none', value: 0 }, making: { type: 'per_gram', value: 40000 } })
    ).body.data.items[0].product;
    const quote = (await api().post('/api/v1/sales/quote').set(bearer(ctx.t)).send({ branchId: ctx.ho, orderId: order.id, items: [{ productId: piece.id }] })).body.data;
    const credit = 1000000;
    const sale = await api()
      .post('/api/v1/sales')
      .set(bearer(ctx.t))
      .send({ branchId: ctx.ho, orderId: order.id, items: [{ productId: piece.id }], payments: [{ mode: 'cash', amountPaise: quote.payablePaise - credit }, { mode: 'credit', amountPaise: credit }] });
    expect(sale.status).toBe(201);

    const activity = (await api().get(`/api/v1/customers/${ctx.customer.id}/activity`).set(bearer(ctx.t))).body.data;
    expect(activity.stats).toMatchObject({ bills: 1, items: 1, purchasesPaise: quote.totals.grandTotalPaise, paidPaise: quote.totals.grandTotalPaise - credit, duePaise: credit, openOrders: 0 });
    expect(activity.purchases[0]).toMatchObject({ sku: piece.sku, invoiceNo: sale.body.data.invoiceNo, grossWeightMg: 10000, returned: false });
    expect(activity.payments.map((p) => p.kind).sort()).toEqual(['advance', 'credit', 'payment']);
    expect(activity.orders[0]).toMatchObject({ orderNo: order.orderNo, status: 'delivered' });
    expect(activity.invoices[0]).toMatchObject({ duePaise: credit, orderNo: order.orderNo });
  });

  it('books a detailed order: estimate at today rate, priority, photos, and specs carried to the finished piece', async () => {
    const ctx = await setup();
    const ring = {
      description: 'Diamond engagement ring',
      categoryId: ctx.ring.id,
      jewelleryType: 'diamond',
      metal: 'gold',
      purity: 916,
      approxWeightMg: 5100,
      size: '12',
      stones: [{ type: 'diamond', name: 'Solitaire VVS1', count: 1, weight: 500, weightUnit: 'ct', ratePaise: 6000000 }],
      wastage: { mode: 'percent', value: 1000 },
      making: { type: 'per_gram', value: 60000 },
      otherChargePaise: 50000,
    };
    const coin = { description: '10g gold coin', metal: 'gold', purity: 916, pricingMode: 'fixed', fixedPricePaise: 7500000, quantity: 2 };

    const est = (await api().post('/api/v1/orders/estimate').set(bearer(ctx.t)).send({ branchId: ctx.ho, items: [ring, coin] })).body.data;
    // 0.5 ct = 100 mg of stone: net 5.000 g × ₹7,250 = 36,250; 10% wastage 3,625; making 3,000; stone 30,000; other 500.
    expect(est.items[0].breakdown).toMatchObject({ metalPaise: 3625000, wastagePaise: 362500, makingPaise: 300000, stonePaise: 3000000, otherPaise: 50000 });
    expect(est.items[0]).toMatchObject({ ratePerGramPaise: 725000, rateIsToday: true });
    expect(est.items[1].totalPaise).toBe(est.items[1].estimatedPaise * 2);
    expect(est.totalPaise).toBe(est.items[0].totalPaise + est.items[1].totalPaise);

    const order = (await api().post('/api/v1/orders').set(bearer(ctx.t)).send(orderBody(ctx, { priority: 'urgent', items: [{ ...ring, estimatedPaise: est.items[0].estimatedPaise }] }))).body.data;
    expect(order).toMatchObject({ priority: 'urgent', items: [{ jewelleryType: 'diamond', stones: [{ name: 'Solitaire VVS1' }], wastage: { value: 1000 } }] });

    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
    const withPhoto = (await api().post(`/api/v1/orders/${order.id}/images`).set(bearer(ctx.t)).attach('image', png, 'design.png')).body.data;
    expect(withPhoto.images).toHaveLength(1);
    expect((await api().get(`/api/v1/files/${withPhoto.images[0]}`).set(bearer(ctx.t))).status).toBe(200);

    const piece = (await api().post(`/api/v1/orders/${order.id}/items/0/finish`).set(bearer(ctx.t)).send({ grossWeightMg: 5200, huid: 'DR1NG5', wastage: ring.wastage, making: ring.making })).body.data.items[0].product;
    const product = (await api().get(`/api/v1/products/${piece.id}`).set(bearer(ctx.t))).body.data;
    expect(product).toMatchObject({ jewelleryType: 'diamond', otherChargePaise: 50000, stones: [{ type: 'diamond', count: 1, weight: 500 }] });

    const badFixed = await api().post('/api/v1/orders').set(bearer(ctx.t)).send(orderBody(ctx, { items: [{ description: 'Coin', metal: 'gold', purity: 916, pricingMode: 'fixed' }] }));
    expect(badFixed.body.error.details[0].path).toBe('items.0.fixedPricePaise');
  });

  it('cancels an order and refunds the advance', async () => {
    const ctx = await setup();
    const order = (await api().post('/api/v1/orders').set(bearer(ctx.t)).send(orderBody(ctx))).body.data;
    const noMode = await api().post(`/api/v1/orders/${order.id}/cancel`).set(bearer(ctx.t)).send({ reason: 'Customer cancelled' });
    expect(noMode.body.error.details[0].path).toBe('refundMode');

    const res = await api().post(`/api/v1/orders/${order.id}/cancel`).set(bearer(ctx.t)).send({ reason: 'Customer cancelled', refundMode: 'cash' });
    expect(res.body.data).toMatchObject({ status: 'cancelled', advancePaise: 0, cancelReason: 'Customer cancelled' });
    expect(res.body.data.advances.map((a) => a.amountPaise)).toEqual([2000000, -2000000]);
    expect((await ledger(ctx, 'order'))[1]).toEqual([['customer_advances', 2000000, 0], ['cash', 0, 2000000]]);
    expect((await api().post(`/api/v1/orders/${order.id}/advances`).set(bearer(ctx.t)).send({ mode: 'cash', amountPaise: 100 })).status).toBe(409);
  });

  it('validates the order and checks permissions', async () => {
    const ctx = await setup();
    const empty = await api().post('/api/v1/orders').set(bearer(ctx.t)).send(orderBody(ctx, { items: [] }));
    expect(empty.status).toBe(400);
    const badPurity = await api().post('/api/v1/orders').set(bearer(ctx.t)).send(orderBody(ctx, { items: [{ description: 'Chain', metal: 'gold', purity: 925 }] }));
    expect(badPurity.body.error.details[0].path).toBe('items.0.purity');
    const past = await api().post('/api/v1/orders').set(bearer(ctx.t)).send(orderBody(ctx, { expectedDate: '2020-01-01' }));
    expect(past.body.error.details[0].path).toBe('expectedDate');
    const creditAdvance = await api().post('/api/v1/orders').set(bearer(ctx.t)).send(orderBody(ctx, { advance: { mode: 'credit', amountPaise: 100 } }));
    expect(creditAdvance.status).toBe(400);
    expect((await api().get('/api/v1/orders')).status).toBe(401);
  });
});
