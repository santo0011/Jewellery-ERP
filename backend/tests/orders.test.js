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
    expect((await api().post('/api/v1/sales/quote').set(bearer(ctx.t)).send({ branchId: ctx.ho, customerId: ctx.customer.id, items: [{ productId: piece.id }] })).status).toBe(200);
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

  it('leaves the advance and due from before alone when booking, and shows them for the delivery bill', async () => {
    const ctx = await setup();
    const get = (url) => api().get(url).set(bearer(ctx.t));
    const item = { description: 'Necklace', metal: 'gold', purity: 916, estimatedPaise: 5000000 };
    // ₹15,000 advance from before; the piece is ₹50,000 and ₹20,000 is paid now → ₹30,000 left on the order.
    const c = (await api().post('/api/v1/customers').set(bearer(ctx.t)).send({ name: 'Mou Pal', mobile: '9876500077', address: { stateCode: '19' }, openingBalancePaise: -1500000 })).body.data;
    const order = (await api().post('/api/v1/orders').set(bearer(ctx.t)).send(orderBody(ctx, { customerId: c.id, items: [item] }))).body.data;
    expect(order).toMatchObject({ advancePaise: 2000000, customerAdvanceUsedPaise: 0, balancePaise: 3000000, previousAdvancePaise: 1500000, previousDuePaise: 0 });
    expect(order.advances.map((a) => a.mode)).toEqual(['cash']);
    expect((await get(`/api/v1/orders/customer-balance/${c.id}`)).body.data).toMatchObject({ advanceLeftPaise: 1500000, duePaise: 0 });

    // ₹15,000 due from before: shown, not added.
    const owes = (await api().post('/api/v1/customers').set(bearer(ctx.t)).send({ name: 'Bina Roy', mobile: '9876500078', address: { stateCode: '19' }, openingBalancePaise: 1500000 })).body.data;
    const withDue = (await api().post('/api/v1/orders').set(bearer(ctx.t)).send(orderBody(ctx, { customerId: owes.id, items: [item] }))).body.data;
    expect(withDue).toMatchObject({ advancePaise: 2000000, balancePaise: 3000000, previousDuePaise: 1500000, previousAdvancePaise: 0 });
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

describe('editing an order', () => {
  it('can be edited while booked or in progress, not once ready', async () => {
    const ctx = await setup();
    const order = (await api().post('/api/v1/orders').set(bearer(ctx.t)).send(orderBody(ctx))).body.data;
    const items = [
      { description: '22K bridal ring, size 15', categoryId: ctx.ring.id, metal: 'gold', purity: 916, approxWeightMg: 12000, size: '15', estimatedPaise: 9500000 },
      { description: 'Matching earrings', metal: 'gold', purity: 916, approxWeightMg: 6000, quantity: 2, estimatedPaise: 4000000 },
    ];
    const res = await api().put(`/api/v1/orders/${order.id}`).set(bearer(ctx.t)).send({ items, priority: 'urgent', notes: 'Changed design' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ estimatedPaise: 9500000 + 2 * 4000000, priority: 'urgent', notes: 'Changed design', advancePaise: 2000000, customer: { name: 'Rupa Sen' } });
    expect(res.body.data.items.map((i) => i.description)).toEqual(['22K bridal ring, size 15', 'Matching earrings']);

    await api().patch(`/api/v1/orders/${order.id}/status`).set(bearer(ctx.t)).send({ status: 'in_progress' });
    expect((await api().put(`/api/v1/orders/${order.id}`).set(bearer(ctx.t)).send({ items })).status).toBe(200);

    await api().patch(`/api/v1/orders/${order.id}/status`).set(bearer(ctx.t)).send({ status: 'ready' });
    const late = await api().put(`/api/v1/orders/${order.id}`).set(bearer(ctx.t)).send({ items });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('INVALID_STATE');
  });
});

describe('a piece made for an order', () => {
  it('can be billed only to that order’s customer', async () => {
    const ctx = await setup();
    const order = (await api().post('/api/v1/orders').set(bearer(ctx.t)).send(orderBody(ctx))).body.data;
    const piece = (
      await api().post(`/api/v1/orders/${order.id}/items/0/finish`).set(bearer(ctx.t)).send({ grossWeightMg: 10000, huid: 'RS5T01', wastage: { mode: 'none', value: 0 }, making: { type: 'per_gram', value: 40000 } })
    ).body.data.items[0].product;
    const other = (await api().post('/api/v1/customers').set(bearer(ctx.t)).send({ name: 'Someone Else', mobile: `97${Math.floor(10000000 + Math.random() * 89999999)}`, address: { stateCode: '19' } })).body.data;
    const quote = (customerId) => api().post('/api/v1/sales/quote').set(bearer(ctx.t)).send({ branchId: ctx.ho, customerId, items: [{ productId: piece.id }] });

    const walkIn = await quote(undefined);
    expect(walkIn.status).toBe(422);
    expect(walkIn.body.error.message).toContain(`made for order ${order.orderNo} of Rupa Sen`);
    expect((await quote(other.id)).status).toBe(422);
    expect((await api().post('/api/v1/sales').set(bearer(ctx.t)).send({ branchId: ctx.ho, customerId: other.id, items: [{ productId: piece.id }], payments: [] })).status).toBe(422);
    expect((await quote(ctx.customer.id)).status).toBe(200);
  });
});

describe('billing an order piece without picking the order', () => {
  it('links the order: its advance is deducted and the order is delivered', async () => {
    const ctx = await setup();
    const order = (await api().post('/api/v1/orders').set(bearer(ctx.t)).send(orderBody(ctx))).body.data; // ₹20,000 advance
    const piece = (
      await api().post(`/api/v1/orders/${order.id}/items/0/finish`).set(bearer(ctx.t)).send({ grossWeightMg: 10000, huid: 'AL1NK1', wastage: { mode: 'none', value: 0 }, making: { type: 'per_gram', value: 40000 } })
    ).body.data.items[0].product;

    // Scanned straight onto the bill for the customer, no order picked.
    const quote = (await api().post('/api/v1/sales/quote').set(bearer(ctx.t)).send({ branchId: ctx.ho, customerId: ctx.customer.id, items: [{ productId: piece.id }] })).body.data;
    expect(quote).toMatchObject({ order: { orderNo: order.orderNo }, advancePaise: 2000000, payablePaise: quote.totals.grandTotalPaise - 2000000 });

    const sale = await api().post('/api/v1/sales').set(bearer(ctx.t)).send({ branchId: ctx.ho, customerId: ctx.customer.id, items: [{ productId: piece.id }], payments: [{ mode: 'card', amountPaise: 1000000 }] });
    expect(sale.status).toBe(201);
    expect(sale.body.data).toMatchObject({ order: { orderNo: order.orderNo }, advanceAdjustedPaise: 2000000, duePaise: quote.totals.grandTotalPaise - 2000000 - 1000000 });
    expect((await api().get(`/api/v1/orders/${order.id}`).set(bearer(ctx.t))).body.data.status).toBe('delivered');

    // The customer list: the advance is gone (it was used); the rest shows as due, partly paid.
    const row = (await api().get('/api/v1/customers').query({ q: ctx.customer.code }).set(bearer(ctx.t))).body.data.find((c) => c.id === ctx.customer.id);
    expect(row).toMatchObject({ advancePaise: 0, duePaise: quote.totals.grandTotalPaise - 3000000, paymentStatus: 'partly_paid' });
  });
});

describe("the customer's own gold and making the order piece", () => {
  it('takes the gold as an advance, makes the piece from customer and shop gold, keeps it out of Products, and bills it', async () => {
    const ctx = await setup();
    // Shop raw stock: 10 g of 22K bullion at ₹7,000/g.
    await api().post('/api/v1/inventory/opening').set(bearer(ctx.t)).send({ branchId: ctx.ho, metalLines: [{ metal: 'gold', purity: 916, kind: 'bullion', grossWeightMg: 10000, valuePaise: 7000000 }] });

    // Booked with ₹10,000 cash and 8.5 g of the customer's 22K (0.5 g less for dirt) → 8 g at today's ₹7,250/g.
    const booked = await api()
      .post('/api/v1/orders')
      .set(bearer(ctx.t))
      .send(orderBody(ctx, { advance: { mode: 'cash', amountPaise: 1000000 }, customerMetal: [{ description: 'Old bangle', metal: 'gold', purity: 916, grossWeightMg: 8500, lessWeightMg: 500 }] }));
    expect(booked.status).toBe(201);
    const order = booked.body.data;
    expect(order.customerMetal[0]).toMatchObject({ netWeightMg: 8000, ratePerGramPaise: 725000, valuePaise: 5800000 });
    expect(order.advancePaise).toBe(1000000 + 5800000);
    expect(order.customerMetalBalance).toEqual([expect.objectContaining({ metal: 'gold', purity: 916, receivedMg: 8000, leftMg: 8000 })]);
    const pools = (await api().get('/api/v1/inventory/summary').set(bearer(ctx.t))).body.data.metalPools;
    expect(pools.find((p) => p.kind === 'customer_gold')).toMatchObject({ grossMg: 8000, valuePaise: 5800000 });

    // Customer's gold cannot be picked by hand on a general production or purchase.
    const misuse = await api().post('/api/v1/inventory/production').set(bearer(ctx.t)).send({ branchId: ctx.ho, metalUsed: [{ metal: 'gold', purity: 916, kind: 'customer_gold', grossWeightMg: 1000 }], pieces: [] });
    expect(misuse.status).toBe(400);

    // More than the customer gave is refused.
    const finish = (body) => api().post(`/api/v1/orders/${order.id}/items/0/finish`).set(bearer(ctx.t)).send({ huid: 'ORD123', wastage: { mode: 'percent', value: 800 }, making: { type: 'per_gram', value: 50000 }, ...body });
    expect((await finish({ grossWeightMg: 10000, materials: [{ source: 'customer', metal: 'gold', purity: 916, grossWeightMg: 9000 }] })).status).toBe(400);

    // Made from all 8 g of the customer's gold + 2.4 g of shop bullion, ₹1,500 karigar in cash; the ring weighs 10 g.
    const made = await finish({ grossWeightMg: 10000, materials: [{ source: 'customer', metal: 'gold', purity: 916, grossWeightMg: 8000 }, { source: 'shop', metal: 'gold', purity: 916, kind: 'bullion', grossWeightMg: 2400 }], karigarPaise: 150000, karigarMode: 'cash' });
    expect(made.status).toBe(200);
    const done = made.body.data;
    const piece = done.items[0].product;
    expect(piece.status).toBe('in_stock');
    // Cost = customer gold as credited (₹58,000) + shop bullion at ₹7,000/g (₹16,800) + karigar ₹1,500.
    expect(done.items[0].make).toMatchObject({ metalCostPaise: 5800000 + 1680000, karigarPaise: 150000, costPaise: 7630000, finishedGrossMg: 10000 });
    // 10.4 g of 22K given; 10 g in the piece: 0.4 g of 22K lost → its fine weight is the wastage.
    expect(done.material).toMatchObject({ customerFineMg: 7328, shopFineMg: 2198, finishedFineMg: 9160 });
    expect(done.material.wastageFineMg).toBe(7328 + 2198 - 9160);
    expect(done.customerMetalBalance[0]).toMatchObject({ usedMg: 8000, leftMg: 0 });

    // Not listed in Products; still found by its own id for the order.
    const products = (await api().get('/api/v1/products').set(bearer(ctx.t))).body.data;
    expect(products.find((p) => p.id === piece.id)).toBeUndefined();
    // Karigar's charge: stock against cash. Nothing goes to opening equity.
    const lines = (await ledger(ctx, 'order')).flat();
    expect(lines.some(([key]) => key === 'opening_equity')).toBe(false);
    expect(lines).toEqual(expect.arrayContaining([['inventory', 150000, 0], ['cash', 0, 150000]]));

    // Billed on the order: both advances (cash and gold value) come off.
    const quote = (await api().post('/api/v1/sales/quote').set(bearer(ctx.t)).send({ branchId: ctx.ho, orderId: order.id, items: [{ productId: piece.id }] })).body.data;
    const due = quote.totals.grandTotalPaise - 6800000;
    const sale = await api().post('/api/v1/sales').set(bearer(ctx.t)).send({ branchId: ctx.ho, orderId: order.id, items: [{ productId: piece.id }], payments: [{ mode: 'upi', amountPaise: due }] });
    expect(sale.status).toBe(201);
    expect((await api().get(`/api/v1/orders/${order.id}`).set(bearer(ctx.t))).body.data.status).toBe('delivered');
  });

  it('gives unused customer gold back on cancel and refunds the rest; a wrong entry can be removed', async () => {
    const ctx = await setup();
    const order = (
      await api()
        .post('/api/v1/orders')
        .set(bearer(ctx.t))
        .send(orderBody(ctx, { advance: { mode: 'cash', amountPaise: 500000 }, customerMetal: [{ metal: 'gold', purity: 916, grossWeightMg: 4000 }] }))
    ).body.data;
    const added = (await api().post(`/api/v1/orders/${order.id}/customer-metal`).set(bearer(ctx.t)).send({ lines: [{ metal: 'gold', purity: 916, grossWeightMg: 2000, ratePerGramPaise: 700000 }] })).body.data;
    expect(added.advancePaise).toBe(500000 + 2900000 + 1400000);

    // The second entry was a mistake: removed, its gold and value go back.
    const wrong = added.customerMetal[1];
    const removed = (await api().delete(`/api/v1/orders/${order.id}/customer-metal/${wrong.id}`).set(bearer(ctx.t))).body.data;
    expect(removed.advancePaise).toBe(500000 + 2900000);
    expect(removed.customerMetalBalance[0]).toMatchObject({ receivedMg: 4000, leftMg: 4000 });

    // Cancelled: the 4 g go back as gold, the ₹5,000 cash is refunded.
    const cancelled = await api().post(`/api/v1/orders/${order.id}/cancel`).set(bearer(ctx.t)).send({ reason: 'Customer changed mind', refundMode: 'cash' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data).toMatchObject({ status: 'cancelled', advancePaise: 0 });
    expect(cancelled.body.data.customerMetalBalance[0]).toMatchObject({ returnedMg: 4000, leftMg: 0 });
    const pools = (await api().get('/api/v1/inventory/summary').set(bearer(ctx.t))).body.data.metalPools;
    expect(pools.find((p) => p.kind === 'customer_gold')?.grossMg ?? 0).toBe(0);
    // Every order journal balances.
    for (const entry of await ledger(ctx, 'order')) expect(entry.reduce((n, [, d, c]) => n + d - c, 0)).toBe(0);
  });
});
