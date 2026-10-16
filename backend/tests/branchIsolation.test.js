import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { runWithContext } from '../src/core/context/requestContext.js';
import { Role } from '../src/modules/roles/role.model.js';
import { User } from '../src/modules/users/user.model.js';
import { api, bearer, registerOrg } from './helpers.js';

/**
 * A branch-limited user — here with a role that allows EVERYTHING — must still never see or change anything of the
 * organisation itself, nor any other branch's data. Everything is checked against the API (not only the menus).
 */
async function setup() {
  const owner = await registerOrg();
  const t = owner.token;
  const me = (await api().get('/api/v1/auth/me').set(bearer(t))).body.data;
  const ho = me.branches[0].id;
  const branch = (await api().post('/api/v1/branches').set(bearer(t)).send({ code: 'SLK', name: 'Salt Lake', address: { stateCode: '19' } })).body.data;
  const branchId = branch._id ?? branch.id;

  const email = `iso${Date.now()}${Math.random().toString(36).slice(2, 6)}@abc.local`;
  await runWithContext({ organisationId: me.organisation.id }, async () => {
    const role = await Role.create({ key: `all_${Date.now()}${Math.random()}`, name: 'Everything', permissions: ['*'] });
    await User.create({ name: 'Branch Staff', email, passwordHash: await bcrypt.hash('Secret123', 4), roleIds: [role._id], branchAccess: { all: false, branchIds: [branchId] }, defaultBranchId: branchId });
  });
  const login = await api().post('/api/v1/auth/login').send({ email, password: 'Secret123' });
  const ring = (await api().get('/api/v1/categories').set(bearer(t))).body.data.find((c) => c.name === 'Ring');
  return { t, me, ho, branchId, bt: login.body.data.accessToken, ring };
}

describe('branch isolation', () => {
  it('a branch login stays in its own branch even when “all branches” is stored for it', async () => {
    const { t, me, ho, branchId: kolkata } = await setup();
    const email = `bl${Date.now()}@abc.local`;
    // Give the branch an email (a branch login signs in with it).
    expect((await api().put(`/api/v1/branches/${kolkata}`).set(bearer(t)).send({ code: 'SLK', name: 'Salt Lake', email, address: { stateCode: '19' } })).status).toBe(200);
    expect((await api().put(`/api/v1/branches/${kolkata}/login`).set(bearer(t)).send({ password: '123456' })).status).toBe(200);
    // As found in a real database: the branch login was later given access to all branches.
    await runWithContext({ organisationId: me.organisation.id }, async () => {
      await User.updateOne({ branchLoginFor: kolkata }, { $set: { branchAccess: { all: true, branchIds: [] } } });
    });

    const bl = (await api().post('/api/v1/auth/login').send({ email, password: '123456' })).body.data.accessToken;
    const session = (await api().get('/api/v1/auth/me').set(bearer(bl))).body.data;
    expect(session.user.allBranches).toBe(false);
    expect(session.branches.map((b) => b.id)).toEqual([kolkata]);
    expect(session.permissions).not.toContain('settings.view');
    for (const url of ['/api/v1/settings', '/api/v1/organisation', '/api/v1/users', '/api/v1/branches', '/api/v1/audit-logs', `/api/v1/dashboard?branchId=${ho}`]) {
      expect((await api().get(url).set(bearer(bl))).status, url).toBe(403);
    }

    // Its branch cannot be widened through the users API (branch logins are not listed there; found via the branch).
    const loginId = (await api().get('/api/v1/branches').set(bearer(t))).body.data.find((b) => b._id === kolkata).login.id;
    const login = (await api().get(`/api/v1/users/${loginId}`).set(bearer(t))).body.data;
    expect(login).toMatchObject({ branchLogin: true, branchAccess: { all: false } });
    const widen = await api().put(`/api/v1/users/${login.id}`).set(bearer(t)).send({ name: login.name, mobile: '', roleIds: login.roles.map((r) => r.id), branchAccess: { all: true, branchIds: [] }, defaultBranchId: kolkata });
    expect(widen.status).toBe(403);
    expect(widen.body.error.code).toBe('BRANCH_LOGIN_PROTECTED');
  });

  it('Branch Manager is a branch role: no organisation-level permissions, never “all branches”', async () => {
    const { t, branchId } = await setup();
    const roles = (await api().get('/api/v1/roles').set(bearer(t))).body.data;
    const manager = roles.find((r) => r.key === 'branch_manager');
    expect(manager.permissions.filter((p) => ['branch.view', 'user.view', 'settings.view'].includes(p))).toEqual([]);

    const grant = await api().put(`/api/v1/roles/${manager.id}`).set(bearer(t)).send({ name: manager.name, description: '', permissions: [...manager.permissions, 'audit.view'] });
    expect(grant.status).toBe(400);
    expect(grant.body.error.code).toBe('BRANCH_ROLE_ORG_PERMISSION');

    const base = { name: 'Rina Manager', mobile: '', password: 'Secret123', roleIds: [manager.id] };
    const everywhere = await api().post('/api/v1/users').set(bearer(t)).send({ ...base, email: `bm${Date.now()}@abc.local`, branchAccess: { all: true, branchIds: [] } });
    expect(everywhere.status).toBe(400);
    expect(everywhere.body.error.code).toBe('BRANCH_ROLE_ALL_BRANCHES');
    const own = await api().post('/api/v1/users').set(bearer(t)).send({ ...base, email: `bm2${Date.now()}@abc.local`, branchAccess: { all: false, branchIds: [branchId] }, defaultBranchId: branchId });
    expect(own.status).toBe(201);
  });

  it('a branch user never holds organisation-level permissions, whatever the role says', async () => {
    const { bt } = await setup();
    const perms = (await api().get('/api/v1/auth/me').set(bearer(bt))).body.data.permissions;
    for (const p of ['organisation.view', 'organisation.edit', 'branch.view', 'branch.edit', 'user.view', 'user.create', 'role.view', 'role.edit', 'settings.view', 'settings.edit', 'audit.view', 'subscription.view', 'category.create', 'category.delete', 'rate.create']) {
      expect(perms).not.toContain(p);
    }
    // Their own branch's work stays allowed.
    for (const p of ['sales.view', 'sales.create', 'sales.print', 'order.view', 'product.view', 'inventory.view', 'customer.view', 'category.view', 'rate.view', 'employee.view', 'report.sales']) {
      expect(perms).toContain(p);
    }
  });

  it('cannot open or change anything of the organisation itself', async () => {
    const { bt, ho, branchId } = await setup();
    const call = (method, url, body) => api()[method](url).set(bearer(bt)).send(body ?? {});
    const forbidden = [
      ['get', '/api/v1/organisation'],
      ['patch', '/api/v1/organisation', { name: 'Hacked' }],
      ['get', '/api/v1/settings'],
      ['put', '/api/v1/settings/invoice', {}],
      ['put', '/api/v1/settings/print', { size: 'a4', design: 'royal' }],
      ['get', '/api/v1/roles'],
      ['post', '/api/v1/roles', { name: 'X', permissions: ['sales.view'] }],
      ['get', '/api/v1/users'],
      ['post', '/api/v1/users', {}],
      ['get', '/api/v1/audit-logs'],
      ['get', '/api/v1/branches'],
      ['put', `/api/v1/branches/${ho}`, { code: 'HO', name: 'Renamed', address: {} }],
      ['get', '/api/v1/billing'],
      ['post', '/api/v1/categories', { name: 'New' }],
      ['post', '/api/v1/rates', { rates: [{ metal: 'gold', purity: 916, ratePerGramPaise: 1 }] }],
    ];
    for (const [method, url, body] of forbidden) {
      const res = await call(method, url, body);
      expect(res.status, `${method.toUpperCase()} ${url}`).toBe(403);
    }
    // Shared lists it needs at the counter stay readable.
    expect((await call('get', '/api/v1/categories')).status).toBe(200);
    expect((await call('get', '/api/v1/rates/current')).status).toBe(200);
  });

  it('sets its own print design through its own API, never the organisation’s settings', async () => {
    const { bt, ho, branchId } = await setup();
    const own = await api().get(`/api/v1/settings/print/branches/${branchId}`).set(bearer(bt));
    expect(own.status).toBe(200);
    expect(Object.keys(own.body.data).sort()).toEqual(['branch', 'choice', 'invoice', 'organisation']);
    const saved = await api().put(`/api/v1/settings/print/branches/${branchId}`).set(bearer(bt)).send({ choice: { size: 'thermal80', design: 'detailed' } });
    expect(saved.body.data.choice).toEqual({ size: 'thermal80', design: 'detailed' });
    expect(saved.body.data.tax).toBeUndefined();
    // Not another branch's.
    expect((await api().get(`/api/v1/settings/print/branches/${ho}`).set(bearer(bt))).status).toBe(403);
    expect((await api().put(`/api/v1/settings/print/branches/${ho}`).set(bearer(bt)).send({ choice: null })).status).toBe(403);
  });

  it('sees nothing of another branch: approvals, supplier figures, sales and stock', async () => {
    const { t, bt, ho, ring } = await setup();
    // Head office: a product in stock, an adjustment waiting for approval, and a purchase bill.
    const p = (await api().post('/api/v1/products').set(bearer(t)).send({ name: 'Band', categoryId: ring.id, jewelleryType: 'plain_gold', metal: 'gold', purity: 916, grossWeightMg: 5000, wastage: { mode: 'percent', value: 500 }, making: { type: 'per_gram', value: 40000 }, costPricePaise: 3000000, branchId: ho })).body.data;
    await api().post('/api/v1/inventory/opening').set(bearer(t)).send({ branchId: ho, productIds: [p.id] });
    await api().post('/api/v1/inventory/adjustments').set(bearer(t)).send({ branchId: ho, reason: 'lost', productIds: [p.id], note: 'Missing after count' });
    const ownerPending = (await api().get('/api/v1/approvals?status=pending').set(bearer(t))).body.data;
    expect(ownerPending.length).toBeGreaterThan(0);

    const approvals = await api().get('/api/v1/approvals?status=pending').set(bearer(bt));
    expect(approvals.body.data).toEqual([]);
    expect((await api().get('/api/v1/approvals/pending-count').set(bearer(bt))).body.data.count).toBe(0);
    expect((await api().post(`/api/v1/approvals/${ownerPending[0].id}/decision`).set(bearer(bt)).send({ decision: 'approve' })).status).toBe(404);

    const supplier = (await api().post('/api/v1/suppliers').set(bearer(t)).send({ companyName: 'Bowbazar Ornaments', mobile: '9830011111', address: {}, supplies: ['jewellery'] })).body.data;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    const piece = (await api().post('/api/v1/products').set(bearer(t)).send({ name: 'Chain', categoryId: ring.id, jewelleryType: 'plain_gold', metal: 'gold', purity: 916, grossWeightMg: 4000, wastage: { mode: 'none', value: 0 }, making: { type: 'per_gram', value: 40000 }, costPricePaise: 2000000, branchId: ho })).body.data;
    const bill = await api().post('/api/v1/purchases').set(bearer(t)).send({ supplierId: supplier.id, branchId: ho, billNo: 'S-1', billDate: today, items: [{ productId: piece.id, costPaise: 5000000 }], gstPaise: 150000 });
    expect(bill.status).toBe(201);
    const ownerView = (await api().get(`/api/v1/suppliers/${supplier.id}`).set(bearer(t))).body.data.stats;
    expect(ownerView.purchasedPaise).toBeGreaterThan(0);
    const branchView = (await api().get(`/api/v1/suppliers/${supplier.id}`).set(bearer(bt))).body.data.stats;
    expect(branchView.purchasedPaise ?? 0).toBe(0);

    expect((await api().get('/api/v1/products').set(bearer(bt))).body.data.find((x) => x.id === p.id)).toBeUndefined();
    expect((await api().get(`/api/v1/products/${p.id}`).set(bearer(bt))).status).toBe(404);
    expect((await api().get('/api/v1/purchases').set(bearer(bt))).body.data).toEqual([]);
    expect((await api().get(`/api/v1/dashboard?branchId=${ho}`).set(bearer(bt))).status).toBe(403);
  });
});
