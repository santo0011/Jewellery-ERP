import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { runWithContext } from '../src/core/context/requestContext.js';
import { Account } from '../src/core/ledger/account.model.js';
import { JournalEntry } from '../src/core/ledger/journalEntry.model.js';
import { MetalStock } from '../src/core/stock/metalStock.model.js';
import { Role } from '../src/modules/roles/role.model.js';
import { User } from '../src/modules/users/user.model.js';
import { api, bearer, registerOrg } from './helpers.js';

async function setup() {
  const owner = await registerOrg();
  const t = owner.token;
  const me = (await api().get('/api/v1/auth/me').set(bearer(t))).body.data;
  const ring = (await api().get('/api/v1/categories').set(bearer(t))).body.data.find((c) => c.name === 'Ring');
  await api().post('/api/v1/rates').set(bearer(t)).send({ rates: [{ metal: 'gold', purity: 916, ratePerGramPaise: 725000 }] });
  return { t, orgId: me.organisation.id, ho: me.branches[0].id, ring };
}

// 10 g chain: bill total 85,799.00 (see sales.test.js).
async function stockedProduct(ctx) {
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
  };
  const p = (await api().post('/api/v1/products').set(bearer(ctx.t)).send(body)).body.data;
  await api().post('/api/v1/inventory/opening').set(bearer(ctx.t)).send({ branchId: ctx.ho, productIds: [p.id] });
  return p;
}

const customer = async (ctx) =>
  (await api().post('/api/v1/customers').set(bearer(ctx.t)).send({ name: 'Mita Das', mobile: `97${Math.floor(10000000 + Math.random() * 89999999)}`, address: { stateCode: '19' } })).body.data;

// 10 g old 22K bangle, 0.5 g of stones, at 6,800/g less 2%: 9.5 g net → 64,600.00 − 1,292.00 = 63,308.00.
const bangle = { description: 'Old bangle', metal: 'gold', purity: 916, grossWeightMg: 10000, lessWeightMg: 500, deductionBps: 200, ratePerGramPaise: 680000 };
const BANGLE_VALUE = 6330800;

const ledger = (ctx, docType) =>
  runWithContext({ organisationId: ctx.orgId }, async () => {
    const keys = new Map((await Account.find({}).lean()).map((a) => [String(a._id), a.systemKey]));
    const entries = await JournalEntry.find({ 'source.docType': docType }).sort({ createdAt: 1 }).lean();
    return entries.map((e) => ({ ...e, lines: e.lines.map((l) => [keys.get(String(l.accountId)), l.debitPaise, l.creditPaise]) }));
  });

const oldGoldPool = (ctx) => runWithContext({ organisationId: ctx.orgId }, async () => await MetalStock.findOne({ kind: 'old_gold', metal: 'gold', purity: 916 }).lean());

describe('old gold exchange on a bill', () => {
  it('takes the old gold off what the customer pays, stocks the metal and posts it as stock', async () => {
    const ctx = await setup();
    const p = await stockedProduct(ctx);
    const c = await customer(ctx);

    const q = (await api().post('/api/v1/sales/quote').set(bearer(ctx.t)).send({ branchId: ctx.ho, customerId: c.id, items: [{ productId: p.id }], oldGold: [bangle] })).body.data;
    expect(q.oldGoldPaise).toBe(BANGLE_VALUE);
    expect(q.oldGold.lines[0]).toMatchObject({ netWeightMg: 9500, fineWeightMg: 8702, grossValuePaise: 6460000, deductionPaise: 129200, valuePaise: BANGLE_VALUE });
    expect(q.payablePaise).toBe(8579900 - BANGLE_VALUE);

    const res = await api()
      .post('/api/v1/sales')
      .set(bearer(ctx.t))
      .send({ branchId: ctx.ho, customerId: c.id, items: [{ productId: p.id }], oldGold: [bangle], payments: [{ mode: 'cash', amountPaise: 8579900 - BANGLE_VALUE }] });
    expect(res.status).toBe(201);
    const sale = res.body.data;
    expect(sale).toMatchObject({ oldGoldPaise: BANGLE_VALUE, duePaise: 0, paymentStatus: 'paid' });
    expect(sale.oldGold.docNo).toMatch(/^OG\/HO\/\d{2}-\d{2}\/0001$/);

    const [journal] = await ledger(ctx, 'sale');
    expect(journal.lines).toEqual([
      ['cash', 8579900 - BANGLE_VALUE, 0],
      ['inventory', BANGLE_VALUE, 0],
      ['sales', 0, 8330000],
      ['gst_output', 0, 249900],
    ]);
    expect(await oldGoldPool(ctx)).toMatchObject({ grossMg: 9500, fineMg: 8702, valuePaise: BANGLE_VALUE });

    const list = (await api().get('/api/v1/old-gold').set(bearer(ctx.t))).body;
    expect(list.data[0]).toMatchObject({ type: 'exchange', status: 'completed', totalPaise: BANGLE_VALUE, sale: { id: sale.id, invoiceNo: sale.invoiceNo }, customer: { name: 'Mita Das' } });
    expect(list.meta.summary).toMatchObject({ count: 1, exchangePaise: BANGLE_VALUE, purchasePaise: 0, goldFineMg: 8702 });

    // Exchange documents are cancelled through their invoice.
    const direct = await api().post(`/api/v1/old-gold/${list.data[0].id}/cancel`).set(bearer(ctx.t)).send({ reason: 'Wrong entry' });
    expect(direct.status).toBe(409);
    expect(direct.body.error.code).toBe('EXCHANGE_ON_BILL');
  });

  it('cancelling the bill gives the old gold back and reverses the books', async () => {
    const ctx = await setup();
    const p = await stockedProduct(ctx);
    const sale = (await api().post('/api/v1/sales').set(bearer(ctx.t)).send({ branchId: ctx.ho, items: [{ productId: p.id }], oldGold: [bangle], payments: [{ mode: 'upi', amountPaise: 8579900 - BANGLE_VALUE }] })).body.data;

    const res = await api().post(`/api/v1/sales/${sale.id}/cancel`).set(bearer(ctx.t)).send({ reason: 'Customer changed mind' });
    expect(res.status).toBe(200);
    expect(await oldGoldPool(ctx)).toMatchObject({ grossMg: 0, fineMg: 0, valuePaise: 0 });
    const og = (await api().get('/api/v1/old-gold').set(bearer(ctx.t))).body.data[0];
    expect(og).toMatchObject({ status: 'cancelled', cancelReason: 'Customer changed mind' });
    const entries = await ledger(ctx, 'sale');
    expect(entries.filter((e) => e.reversalOf)).toHaveLength(2);
  });

  it('refuses old gold worth more than the bill, and without Old gold → Create', async () => {
    const ctx = await setup();
    const p = await stockedProduct(ctx);
    const heavy = { ...bangle, grossWeightMg: 20000 };
    const res = await api().post('/api/v1/sales/quote').set(bearer(ctx.t)).send({ branchId: ctx.ho, items: [{ productId: p.id }], oldGold: [heavy] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('OLD_GOLD_EXCEEDS_BILL');

    const bad = await api().post('/api/v1/sales/quote').set(bearer(ctx.t)).send({ branchId: ctx.ho, items: [{ productId: p.id }], oldGold: [{ ...bangle, purity: 123 }] });
    expect(bad.status).toBe(400);

    const email = `cashier${Date.now()}@example.com`;
    await runWithContext({ organisationId: ctx.orgId }, async () => {
      const role = await Role.create({ key: `t_${Date.now()}`, name: 'Cashier only', permissions: ['sales.create'] });
      await User.create({ name: 'Cashier', email, passwordHash: await bcrypt.hash('Secret123', 4), roleIds: [role._id], branchAccess: { all: true, branchIds: [] } });
    });
    const cashier = (await api().post('/api/v1/auth/login').send({ email, password: 'Secret123' })).body.data.accessToken;
    const denied = await api().post('/api/v1/sales/quote').set(bearer(cashier)).send({ branchId: ctx.ho, items: [{ productId: p.id }], oldGold: [bangle] });
    expect(denied.status).toBe(403);
    expect((await api().get('/api/v1/old-gold').set(bearer(cashier))).status).toBe(403);
  });
});

describe('buying old gold for money', () => {
  it('pays the customer, stocks the metal and can be cancelled while the metal is unused', async () => {
    const ctx = await setup();
    const c = await customer(ctx);
    const res = await api().post('/api/v1/old-gold').set(bearer(ctx.t)).send({ branchId: ctx.ho, customerId: c.id, lines: [bangle], payout: { mode: 'cash' } });
    expect(res.status).toBe(201);
    const og = res.body.data;
    expect(og).toMatchObject({ type: 'purchase', status: 'completed', totalPaise: BANGLE_VALUE, payout: { mode: 'cash' }, sale: null });

    const [journal] = await ledger(ctx, 'old_gold');
    expect(journal.lines).toEqual([
      ['inventory', BANGLE_VALUE, 0],
      ['cash', 0, BANGLE_VALUE],
    ]);
    expect(await oldGoldPool(ctx)).toMatchObject({ grossMg: 9500, valuePaise: BANGLE_VALUE });

    const cancelled = await api().post(`/api/v1/old-gold/${og.id}/cancel`).set(bearer(ctx.t)).send({ reason: 'Customer took it back' });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe('cancelled');
    expect(await oldGoldPool(ctx)).toMatchObject({ grossMg: 0, valuePaise: 0 });
    expect((await ledger(ctx, 'old_gold')).filter((e) => e.reversalOf)).toHaveLength(1);

    const again = await api().post(`/api/v1/old-gold/${og.id}/cancel`).set(bearer(ctx.t)).send({ reason: 'Customer took it back' });
    expect(again.status).toBe(409);
  });

  it('needs a customer and a payout mode', async () => {
    const ctx = await setup();
    const res = await api().post('/api/v1/old-gold').set(bearer(ctx.t)).send({ branchId: ctx.ho, lines: [bangle], payout: { mode: 'cash' } });
    expect(res.status).toBe(400);
    const c = await customer(ctx);
    const noMode = await api().post('/api/v1/old-gold').set(bearer(ctx.t)).send({ branchId: ctx.ho, customerId: c.id, lines: [bangle], payout: {} });
    expect(noMode.status).toBe(400);
  });

  it('keeps one organisation’s old gold from another', async () => {
    const a = await setup();
    const b = await setup();
    const c = await customer(a);
    const og = (await api().post('/api/v1/old-gold').set(bearer(a.t)).send({ branchId: a.ho, customerId: c.id, lines: [bangle], payout: { mode: 'upi' } })).body.data;
    expect((await api().get(`/api/v1/old-gold/${og.id}`).set(bearer(b.t))).status).toBe(404);
    expect((await api().get('/api/v1/old-gold').set(bearer(b.t))).body.data).toHaveLength(0);
  });
});
