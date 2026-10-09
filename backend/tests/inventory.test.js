import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { runWithContext } from '../src/core/context/requestContext.js';
import { Account } from '../src/core/ledger/account.model.js';
import { JournalEntry } from '../src/core/ledger/journalEntry.model.js';
import { StockMovement } from '../src/core/stock/stockMovement.model.js';
import { Role } from '../src/modules/roles/role.model.js';
import { User } from '../src/modules/users/user.model.js';
import { api, bearer, registerOrg } from './helpers.js';

const SKIP = { skipTenant: true };

async function setup() {
  const owner = await registerOrg();
  const me = (await api().get('/api/v1/auth/me').set(bearer(owner.token))).body.data;
  const ring = (await api().get('/api/v1/categories').set(bearer(owner.token))).body.data.find((c) => c.name === 'Ring');
  return { owner, orgId: me.organisation.id, ho: me.branches[0].id, ring };
}

const productBody = (ctx, o = {}) => ({
  name: 'Plain Band',
  categoryId: ctx.ring.id,
  jewelleryType: 'plain_gold',
  metal: 'gold',
  purity: 916,
  grossWeightMg: 5000,
  wastage: { mode: 'percent', value: 500 },
  making: { type: 'per_gram', value: 40000 },
  costPricePaise: 3000000,
  branchId: ctx.ho,
  ...o,
});

async function draft(ctx, o) {
  return (await api().post('/api/v1/products').set(bearer(ctx.owner.token)).send(productBody(ctx, o))).body.data;
}

async function stocked(ctx, o) {
  const p = await draft(ctx, o);
  const res = await api().post('/api/v1/inventory/opening').set(bearer(ctx.owner.token)).send({ branchId: o?.branchId ?? ctx.ho, productIds: [p.id] });
  if (res.status !== 201) throw new Error(JSON.stringify(res.body));
  return p;
}

async function staff(ctx, permissions, branchAccess = { all: true, branchIds: [] }) {
  const email = `u${Date.now()}${Math.random().toString(36).slice(2, 6)}@example.com`;
  await runWithContext({ organisationId: ctx.orgId }, async () => {
    const role = await Role.create({ key: `k${Date.now()}${Math.random()}`, name: `R ${email}`, permissions });
    await User.create({ name: 'Staff', email, passwordHash: await bcrypt.hash('Secret123', 4), roleIds: [role._id], branchAccess });
  });
  return (await api().post('/api/v1/auth/login').send({ email, password: 'Secret123' })).body.data.accessToken;
}

const journals = (ctx, docType) =>
  runWithContext({ organisationId: ctx.orgId }, async () => {
    const accounts = new Map((await Account.find({}).lean()).map((a) => [String(a._id), a.systemKey]));
    const entries = await JournalEntry.find(docType ? { 'source.docType': docType } : {}).sort({ createdAt: 1 }).lean();
    return entries.map((e) => ({ ...e, lines: e.lines.map((l) => ({ ...l, key: accounts.get(String(l.accountId)) })) }));
  });

describe('metal rates', () => {
  it('records rates as history and returns the latest per purity', async () => {
    const ctx = await setup();
    const post = (rate) => api().post('/api/v1/rates').set(bearer(ctx.owner.token)).send({ rates: [{ metal: 'gold', purity: 916, ratePerGramPaise: rate }, { metal: 'silver', purity: 999, ratePerGramPaise: 9500 }] });
    expect((await post(720000)).status).toBe(201);
    expect((await post(725000)).status).toBe(201);

    const current = (await api().get('/api/v1/rates/current').set(bearer(ctx.owner.token))).body.data;
    expect(current.find((r) => r.metal === 'gold').ratePerGramPaise).toBe(725000);
    expect(current.every((r) => r.isToday)).toBe(true);

    const history = await api().get('/api/v1/rates/history?metal=gold').set(bearer(ctx.owner.token));
    expect(history.body.data.map((r) => r.ratePerGramPaise)).toEqual([725000, 720000]);

    const disabled = await api().post('/api/v1/rates').set(bearer(ctx.owner.token)).send({ rates: [{ metal: 'gold', purity: 999, ratePerGramPaise: 780000 }] });
    expect(disabled.status).toBe(400);
  });
});

describe('opening stock', () => {
  it('moves drafts into stock with movements and a balanced journal', async () => {
    const ctx = await setup();
    const a = await draft(ctx);
    const b = await draft(ctx, { name: 'Band 2', costPricePaise: 1000000 });
    const res = await api()
      .post('/api/v1/inventory/opening')
      .set(bearer(ctx.owner.token))
      .send({ branchId: ctx.ho, productIds: [a.id, b.id], metalLines: [{ metal: 'gold', purity: 995, kind: 'bullion', grossWeightMg: 100000, valuePaise: 7000000 }] });
    expect(res.status).toBe(201);
    expect(res.body.data.docNo).toMatch(/^OS\/HO\/\d{2}-\d{2}\/0001$/);
    expect(res.body.data.totals).toMatchObject({ pieces: 2, valuePaise: 11000000 });

    expect((await api().get(`/api/v1/products/${a.id}`).set(bearer(ctx.owner.token))).body.data.status).toBe('in_stock');

    const summary = (await api().get('/api/v1/inventory/summary').set(bearer(ctx.owner.token))).body.data;
    expect(summary.products[0]).toMatchObject({ metal: 'gold', purity: 916, items: 2, grossMg: 10000, fineMg: 9160 });
    expect(summary.metalPools[0]).toMatchObject({ kind: 'bullion', grossMg: 100000, fineMg: 99500 });

    const [journal] = await journals(ctx, 'stock_entry');
    expect(journal.totalPaise).toBe(11000000);
    expect(journal.lines.map((l) => [l.key, l.debitPaise, l.creditPaise])).toEqual([
      ['inventory', 11000000, 0],
      ['opening_equity', 0, 11000000],
    ]);

    const again = await api().post('/api/v1/inventory/opening').set(bearer(ctx.owner.token)).send({ branchId: ctx.ho, productIds: [a.id] });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVALID_STOCK_STATE');
  });

  it('keeps movements immutable', async () => {
    const ctx = await setup();
    await stocked(ctx);
    await runWithContext({ organisationId: ctx.orgId }, async () => {
      await expect(StockMovement.updateOne({}, { $set: { grossMg: 1 } })).rejects.toThrow(/immutable/);
      await expect(StockMovement.deleteMany({})).rejects.toThrow(/immutable/);
    });
  });
});

describe('stock adjustments', () => {
  it('waits for approval, blocks self-approval by non-admins, and posts on approval', async () => {
    const ctx = await setup();
    const p = await stocked(ctx);
    const maker = await staff(ctx, ['inventory.view', 'inventory.adjust', 'inventory.approve', 'product.view']);

    const res = await api().post('/api/v1/inventory/adjustments').set(bearer(maker)).send({ branchId: ctx.ho, reason: 'lost', productIds: [p.id], note: 'Missing after stock count' });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('pending_approval');
    expect((await api().get(`/api/v1/products/${p.id}`).set(bearer(ctx.owner.token))).body.data.status).toBe('in_stock');

    const dup = await api().post('/api/v1/inventory/adjustments').set(bearer(ctx.owner.token)).send({ branchId: ctx.ho, reason: 'lost', productIds: [p.id], note: 'Again please' });
    expect(dup.body.error.code).toBe('PENDING_ADJUSTMENT');

    const pending = (await api().get('/api/v1/approvals?status=pending').set(bearer(maker))).body.data;
    expect(pending).toHaveLength(1);
    expect((await api().get('/api/v1/approvals/pending-count').set(bearer(ctx.owner.token))).body.data.count).toBe(1);

    const self = await api().post(`/api/v1/approvals/${pending[0].id}/decision`).set(bearer(maker)).send({ decision: 'approve' });
    expect(self.body.error.code).toBe('SELF_APPROVAL');

    const approve = await api().post(`/api/v1/approvals/${pending[0].id}/decision`).set(bearer(ctx.owner.token)).send({ decision: 'approve', comment: 'Checked CCTV' });
    expect(approve.status).toBe(200);
    expect((await api().get(`/api/v1/products/${p.id}`).set(bearer(ctx.owner.token))).body.data.status).toBe('written_off');

    const loss = (await journals(ctx, 'stock_entry')).find((j) => j.voucherType === 'stock_adjustment');
    expect(loss.lines.map((l) => [l.key, l.debitPaise, l.creditPaise])).toEqual([
      ['stock_loss', 3000000, 0],
      ['inventory', 0, 3000000],
    ]);
    const twice = await api().post(`/api/v1/approvals/${pending[0].id}/decision`).set(bearer(ctx.owner.token)).send({ decision: 'reject' });
    expect(twice.status).toBe(409);
  });

  it('rejection leaves stock untouched; metal out cannot exceed the pool', async () => {
    const ctx = await setup();
    await api().put('/api/v1/settings/approvals').set(bearer(ctx.owner.token)).send({ stockAdjustments: false });
    await api().post('/api/v1/inventory/opening').set(bearer(ctx.owner.token)).send({ branchId: ctx.ho, metalLines: [{ metal: 'gold', purity: 995, kind: 'scrap', grossWeightMg: 2000 }] });

    const tooMuch = await api().post('/api/v1/inventory/adjustments').set(bearer(ctx.owner.token)).send({ branchId: ctx.ho, reason: 'weight_correction', metalLines: [{ metal: 'gold', purity: 995, kind: 'scrap', direction: 'out', grossWeightMg: 3000 }], note: 'Scale recheck' });
    expect(tooMuch.status).toBe(409);
    expect(tooMuch.body.error.code).toBe('INSUFFICIENT_STOCK');

    const ok = await api().post('/api/v1/inventory/adjustments').set(bearer(ctx.owner.token)).send({ branchId: ctx.ho, reason: 'weight_correction', metalLines: [{ metal: 'gold', purity: 995, kind: 'scrap', direction: 'out', grossWeightMg: 500 }], note: 'Scale recheck' });
    expect(ok.body.data.status).toBe('posted');
    const pool = (await api().get('/api/v1/inventory/summary').set(bearer(ctx.owner.token))).body.data.metalPools[0];
    expect(pool.grossMg).toBe(1500);

    await api().put('/api/v1/settings/approvals').set(bearer(ctx.owner.token)).send({ stockAdjustments: true });
    const p = await stocked(ctx);
    await api().post('/api/v1/inventory/adjustments').set(bearer(ctx.owner.token)).send({ branchId: ctx.ho, reason: 'damaged', productIds: [p.id], note: 'Clasp broken' });
    const [request] = (await api().get('/api/v1/approvals?status=pending').set(bearer(ctx.owner.token))).body.data;
    await api().post(`/api/v1/approvals/${request.id}/decision`).set(bearer(ctx.owner.token)).send({ decision: 'reject', comment: 'Repair instead' });
    expect((await api().get(`/api/v1/products/${p.id}`).set(bearer(ctx.owner.token))).body.data.status).toBe('in_stock');
    const adjustments = (await api().get('/api/v1/inventory/adjustments?status=rejected').set(bearer(ctx.owner.token))).body.data;
    expect(adjustments[0]).toMatchObject({ status: 'rejected', rejectionReason: 'Repair instead' });
  });
});

describe('branch transfers', () => {
  it('dispatches, receives at destination and moves the branch dimension', async () => {
    const ctx = await setup();
    const b2 = (await api().post('/api/v1/branches').set(bearer(ctx.owner.token)).send({ code: 'B2', name: 'Salt Lake', address: {} })).body.data;
    const p = await stocked(ctx);

    const sameBranch = await api().post('/api/v1/inventory/transfers').set(bearer(ctx.owner.token)).send({ fromBranchId: ctx.ho, toBranchId: ctx.ho, productIds: [p.id] });
    expect(sameBranch.status).toBe(400);

    const t = await api().post('/api/v1/inventory/transfers').set(bearer(ctx.owner.token)).send({ fromBranchId: ctx.ho, toBranchId: b2._id, productIds: [p.id] });
    expect(t.status).toBe(201);
    expect(t.body.data).toMatchObject({ status: 'in_transit', totals: { pieces: 1 } });
    expect((await api().get(`/api/v1/products/${p.id}`).set(bearer(ctx.owner.token))).body.data.status).toBe('in_transit');

    const hoOnly = await staff(ctx, ['inventory.view', 'inventory.transfer'], { all: false, branchIds: [ctx.ho] });
    const wrongSide = await api().post(`/api/v1/inventory/transfers/${t.body.data.id}/receive`).set(bearer(hoOnly));
    expect(wrongSide.status).toBe(403);

    const received = await api().post(`/api/v1/inventory/transfers/${t.body.data.id}/receive`).set(bearer(ctx.owner.token));
    expect(received.body.data.status).toBe('received');
    const product = (await api().get(`/api/v1/products/${p.id}`).set(bearer(ctx.owner.token))).body.data;
    expect(product).toMatchObject({ status: 'in_stock', branch: { name: 'Salt Lake' } });

    const moves = (await api().get(`/api/v1/inventory/movements?productId=${p.id}`).set(bearer(ctx.owner.token))).body.data;
    expect(moves.map((m) => m.type)).toEqual(['transfer_in', 'transfer_out', 'opening']);

    const [journal] = (await journals(ctx, 'stock_transfer'));
    expect(journal.lines.map((l) => [l.key, String(l.branchId), l.debitPaise, l.creditPaise])).toEqual([
      ['inventory', b2._id, 3000000, 0],
      ['inventory', ctx.ho, 0, 3000000],
    ]);
  });

  it('rejection returns items to the source branch', async () => {
    const ctx = await setup();
    const b2 = (await api().post('/api/v1/branches').set(bearer(ctx.owner.token)).send({ code: 'B2', name: 'Salt Lake', address: {} })).body.data;
    const p = await stocked(ctx);
    const t = (await api().post('/api/v1/inventory/transfers').set(bearer(ctx.owner.token)).send({ fromBranchId: ctx.ho, toBranchId: b2._id, productIds: [p.id] })).body.data;
    const rejected = await api().post(`/api/v1/inventory/transfers/${t.id}/reject`).set(bearer(ctx.owner.token)).send({ reason: 'Wrong items sent' });
    expect(rejected.body.data.status).toBe('rejected');
    const product = (await api().get(`/api/v1/products/${p.id}`).set(bearer(ctx.owner.token))).body.data;
    expect(product).toMatchObject({ status: 'in_stock', branch: { code: 'HO' } });
    expect((await journals(ctx, 'stock_transfer'))).toHaveLength(0);
  });
});

describe('opening balance journals', () => {
  it('posts, revises and blocks deletion of parties with balances', async () => {
    const ctx = await setup();
    const c = (await api().post('/api/v1/customers').set(bearer(ctx.owner.token)).send({ name: 'Ledger Test', mobile: '9830000001', address: {}, openingBalancePaise: 500000 })).body.data;
    let entries = await journals(ctx, 'customer_opening');
    expect(entries[0].lines.map((l) => [l.key, l.debitPaise, l.creditPaise, l.party?.type])).toEqual([
      ['sundry_debtors', 500000, 0, 'customer'],
      ['opening_equity', 0, 500000, null],
    ]);

    await api().put(`/api/v1/customers/${c.id}`).set(bearer(ctx.owner.token)).send({ name: 'Ledger Test', mobile: '9830000001', address: {}, openingBalancePaise: -200000 });
    entries = await journals(ctx, 'customer_opening');
    expect(entries).toHaveLength(3);
    const net = entries.flatMap((e) => e.lines).filter((l) => l.key === 'sundry_debtors').reduce((s, l) => s + l.debitPaise - l.creditPaise, 0);
    expect(net).toBe(-200000);

    expect((await api().delete(`/api/v1/customers/${c.id}`).set(bearer(ctx.owner.token))).body.error.code).toBe('HAS_BALANCE');

    await api().post('/api/v1/suppliers').set(bearer(ctx.owner.token)).send({ companyName: 'Bullion Co', mobile: '9830000002', address: {}, openingBalancePaise: 900000 });
    const [supplier] = await journals(ctx, 'supplier_opening');
    expect(supplier.lines.map((l) => [l.key, l.debitPaise, l.creditPaise])).toEqual([
      ['opening_equity', 900000, 0],
      ['sundry_creditors', 0, 900000],
    ]);

    const all = await JournalEntry.find({ organisationId: ctx.orgId }).setOptions(SKIP).lean();
    for (const e of all) expect(e.lines.reduce((s, l) => s + l.debitPaise - l.creditPaise, 0)).toBe(0);
  });
});
