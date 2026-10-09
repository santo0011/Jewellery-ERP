import { describe, expect, it } from 'vitest';
import { runWithContext } from '../src/core/context/requestContext.js';
import { Account } from '../src/core/ledger/account.model.js';
import { JournalEntry } from '../src/core/ledger/journalEntry.model.js';
import { api, bearer, registerOrg } from './helpers.js';

async function setup() {
  const { token: t } = await registerOrg();
  const me = (await api().get('/api/v1/auth/me').set(bearer(t))).body.data;
  const ho = me.branches[0].id;
  const ring = (await api().get('/api/v1/categories').set(bearer(t))).body.data.find((c) => c.name === 'Ring');
  const supplier = (await api().post('/api/v1/suppliers').set(bearer(t)).send({ companyName: 'Bowbazar Ornaments', mobile: '9830011111', address: {}, supplies: ['jewellery'] })).body.data;
  const draft = async () =>
    (await api().post('/api/v1/products').set(bearer(t)).send({ name: 'Ring', categoryId: ring.id, jewelleryType: 'plain_gold', metal: 'gold', purity: 916, grossWeightMg: 5000, wastage: { mode: 'none', value: 0 }, making: { type: 'fixed', value: 1 }, branchId: ho })).body.data;
  return { t, orgId: me.organisation.id, ho, supplier, draft };
}

const journals = (ctx) =>
  runWithContext({ organisationId: ctx.orgId }, async () => {
    const keys = new Map((await Account.find().lean()).map((a) => [String(a._id), a.systemKey]));
    const entries = await JournalEntry.find({ 'source.docType': 'purchase' }).sort({ createdAt: 1 }).lean();
    return entries.map((e) => [e.voucherType, e.lines.map((l) => [keys.get(String(l.accountId)), l.debitPaise, l.creditPaise])]);
  });

describe('purchases', () => {
  it('orders from a supplier, receives the bill into stock, books it and tracks payment', async () => {
    const ctx = await setup();
    const today = new Date().toISOString().slice(0, 10);
    const order = (
      await api().post('/api/v1/purchases/orders').set(bearer(ctx.t)).send({ supplierId: ctx.supplier.id, branchId: ctx.ho, lines: [{ description: '22K rings', metal: 'gold', purity: 916, quantity: 2, weightMg: 10000, amountPaise: 12000000 }] })
    ).body.data;
    expect(order).toMatchObject({ status: 'open', orderNo: expect.stringMatching(/^PO\/HO\//), totals: { quantity: 2, amountPaise: 12000000 } });

    const [a, b] = [await ctx.draft(), await ctx.draft()];
    const body = {
      supplierId: ctx.supplier.id,
      branchId: ctx.ho,
      billNo: 'BO-101',
      billDate: today,
      orderId: order.id,
      items: [{ productId: a.id, costPaise: 6000000 }, { productId: b.id, costPaise: 6200000 }],
      metalLines: [{ metal: 'gold', purity: 995, kind: 'bullion', grossWeightMg: 10000, valuePaise: 13000000 }],
      gstPaise: 756000,
      paidNow: { amountPaise: 10000000, mode: 'bank' },
    };
    const res = await api().post('/api/v1/purchases').set(bearer(ctx.t)).send(body);
    expect(res.status).toBe(201);
    const p = res.body.data;
    expect(p).toMatchObject({ purchaseNo: expect.stringMatching(/^PUR\/HO\//), paymentStatus: 'partly_paid', paidPaise: 10000000, totals: { pieces: 2, goodsPaise: 25200000, gstPaise: 756000, totalPaise: 25956000 }, order: { orderNo: order.orderNo } });

    // Pieces are in stock at their bill cost; the order is closed.
    const piece = (await api().get(`/api/v1/products/${a.id}`).set(bearer(ctx.t))).body.data;
    expect(piece).toMatchObject({ status: 'in_stock', costPricePaise: 6000000 });
    expect((await api().get(`/api/v1/purchases/orders/${order.id}`).set(bearer(ctx.t))).body.data).toMatchObject({ status: 'received', purchase: { purchaseNo: p.purchaseNo } });

    // Same bill twice is refused; pieces already in stock cannot be bought again.
    expect((await api().post('/api/v1/purchases').set(bearer(ctx.t)).send({ ...body, orderId: undefined, paidNow: undefined })).status).toBe(409);

    const pay = await api().post(`/api/v1/purchases/${p.id}/payments`).set(bearer(ctx.t)).send({ amountPaise: p.duePaise, mode: 'cash' });
    expect(pay.body.data).toMatchObject({ paymentStatus: 'paid', duePaise: 0 });
    expect((await api().post(`/api/v1/purchases/${p.id}/payments`).set(bearer(ctx.t)).send({ amountPaise: 100, mode: 'cash' })).status).toBe(409);

    expect(await journals(ctx)).toEqual([
      ['purchase', [['inventory', 25200000, 0], ['gst_input', 756000, 0], ['sundry_creditors', 0, 25956000]]],
      ['supplier_payment', [['sundry_creditors', 10000000, 0], ['bank', 0, 10000000]]],
      ['supplier_payment', [['sundry_creditors', 15956000, 0], ['cash', 0, 15956000]]],
    ]);

    const list = (await api().get('/api/v1/purchases').set(bearer(ctx.t))).body;
    expect(list.meta).toMatchObject({ monthPaise: 25956000, duePaise: 0 });
  });

  it('cancels an open order with a reason', async () => {
    const ctx = await setup();
    const order = (await api().post('/api/v1/purchases/orders').set(bearer(ctx.t)).send({ supplierId: ctx.supplier.id, branchId: ctx.ho, lines: [{ description: 'Chains', metal: 'gold', purity: 916 }] })).body.data;
    const res = await api().post(`/api/v1/purchases/orders/${order.id}/cancel`).set(bearer(ctx.t)).send({ reason: 'Supplier out of stock' });
    expect(res.body.data.status).toBe('cancelled');
    expect(res.body.data.timeline.map((x) => x.status)).toEqual(['open', 'cancelled']);
    expect((await api().post(`/api/v1/purchases/orders/${order.id}/cancel`).set(bearer(ctx.t)).send({ reason: 'Again' })).status).toBe(409);
  });
});

describe('supplier page figures', () => {
  it('shows bought, paid, owed and open orders for a supplier', async () => {
    const ctx = await setup();
    const today = new Date().toISOString().slice(0, 10);
    const piece = await ctx.draft();
    await api().post('/api/v1/purchases').set(bearer(ctx.t)).send({ supplierId: ctx.supplier.id, branchId: ctx.ho, billNo: 'S-1', billDate: today, items: [{ productId: piece.id, costPaise: 5000000 }], gstPaise: 150000, paidNow: { amountPaise: 2000000, mode: 'cash' } });
    await api().post('/api/v1/purchases/orders').set(bearer(ctx.t)).send({ supplierId: ctx.supplier.id, branchId: ctx.ho, lines: [{ description: 'Chains', metal: 'gold', purity: 916 }] });
    const s = (await api().get(`/api/v1/suppliers/${ctx.supplier.id}`).set(bearer(ctx.t))).body.data;
    expect(s.stats).toMatchObject({ bills: 1, purchasedPaise: 5150000, paidPaise: 2000000, billDuePaise: 3150000, duePaise: 3150000, unpaidBills: 1, openOrders: 1, lastBillDate: today });
  });
});

describe('items catalogue', () => {
  it('saves an item once and creates pieces from it on a purchase', async () => {
    const ctx = await setup();
    const today = new Date().toISOString().slice(0, 10);
    const ring = (await api().get('/api/v1/categories').set(bearer(ctx.t))).body.data.find((c) => c.name === 'Ring');
    const body = { name: 'Plain Gold Ring', categoryId: ring.id, jewelleryType: 'plain_gold', metal: 'gold', purity: 916, wastage: { mode: 'percent', value: 800 }, making: { type: 'per_gram', value: 50000 } };
    const created = await api().post('/api/v1/items').set(bearer(ctx.t)).send(body);
    expect(created.status).toBe(201);
    const item = created.body.data;
    expect(item).toMatchObject({ code: 'IT0001', purityLabel: '22K (916)', category: { name: 'Ring' } });
    expect((await api().post('/api/v1/items').set(bearer(ctx.t)).send({ ...body, name: ' plain gold  RING ' })).status).toBe(409);

    const found = (await api().get('/api/v1/items?q=gold ring').set(bearer(ctx.t))).body;
    expect(found.data.map((i) => i.id)).toEqual([item.id]);

    const bill = (overrides) =>
      api().post('/api/v1/purchases').set(bearer(ctx.t)).send({ supplierId: ctx.supplier.id, branchId: ctx.ho, billDate: today, gstPaise: 0, ...overrides });
    expect((await bill({ billNo: 'IT-0', newPieces: [{ itemId: item.id, grossWeightMg: 4000, huid: 'ab12cd', costPaise: 100 }, { itemId: item.id, grossWeightMg: 4100, huid: 'AB12CD', costPaise: 100 }] })).body.error.details[0].path).toBe('newPieces.1.huid');

    const res = await bill({ billNo: 'IT-1', newPieces: [{ itemId: item.id, grossWeightMg: 4000, huid: 'ab12cd', costPaise: 3200000 }, { itemId: item.id, grossWeightMg: 5250, costPaise: 4100000 }] });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ totals: { pieces: 2, grossMg: 9250, goodsPaise: 7300000 } });
    const pieces = await Promise.all(res.body.data.items.map(async (i) => (await api().get(`/api/v1/products/${i.productId}`).set(bearer(ctx.t))).body.data));
    expect(pieces.map((p) => [p.name, p.status, p.costPricePaise, p.huid ?? null])).toEqual([
      ['Plain Gold Ring', 'in_stock', 3200000, 'AB12CD'],
      ['Plain Gold Ring', 'in_stock', 4100000, null],
    ]);
    expect(pieces[0]).toMatchObject({ wastage: { mode: 'percent', value: 800 }, making: { type: 'per_gram', value: 50000 } });
    expect((await api().get(`/api/v1/items/${item.id}`).set(bearer(ctx.t))).body.data.usedCount).toBe(2);
  });
});
