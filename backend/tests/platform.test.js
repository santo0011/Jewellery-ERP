import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { BRANCH_PERMISSIONS } from '@jerp/shared';
import { runWithContext } from '../src/core/context/requestContext.js';
import { PlatformAdmin } from '../src/modules/platform/platformAdmin.model.js';
import { Role } from '../src/modules/roles/role.model.js';
import { User } from '../src/modules/users/user.model.js';
import { api, bearer, refreshCookie, registerOrg } from './helpers.js';

async function superAdmin() {
  const email = `sa${Date.now()}${Math.random().toString(36).slice(2, 6)}@platform.local`;
  await PlatformAdmin.create({ name: 'Platform Owner', email, passwordHash: await bcrypt.hash('Admin1234', 4) });
  const res = await api().post('/api/v1/auth/login').send({ email, password: 'Admin1234' });
  return { email, token: res.body.data.accessToken, cookie: refreshCookie(res) ?? [].concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('jerp_prt='))?.split(';')[0] };
}

const orgBody = (o = {}) => ({
  organisationName: `ABC Jewellery ${Date.now()}`,
  ownerName: 'Amit Das',
  email: `owner${Date.now()}${Math.random().toString(36).slice(2, 6)}@abc.local`,
  mobile: '9830012345',
  stateCode: '19',
  password: 'Temp1234',
  branchLimit: 3,
  ...o,
});

async function ownerSession(email) {
  let token = (await api().post('/api/v1/auth/login').send({ email, password: 'Temp1234' })).body.data.accessToken;
  token = (await api().post('/api/v1/auth/change-password').set(bearer(token)).send({ currentPassword: 'Temp1234', newPassword: 'Owner1234' })).body.data.accessToken;
  return token;
}

const branch = (code) => ({ code, name: `Branch ${code}`, address: { stateCode: '19' } });

describe('super admin', () => {
  it('signs in separately; tenant and platform tokens are not interchangeable', async () => {
    const sa = await superAdmin();
    expect((await api().get('/api/v1/platform/auth/me').set(bearer(sa.token))).body.data.name).toBe('Platform Owner');

    const tenant = await registerOrg();
    expect((await api().get('/api/v1/platform/dashboard').set(bearer(tenant.token))).status).toBe(401);
    expect((await api().get('/api/v1/auth/me').set(bearer(sa.token))).status).toBe(401);
    expect((await api().post('/api/v1/auth/refresh').set('Cookie', sa.cookie.replace('jerp_prt', 'jerp_rt'))).status).toBe(401);
  });

  it('signs in through the shared login form and reports the SUPER_ADMIN role', async () => {
    const sa = await superAdmin();
    const res = await api().post('/api/v1/auth/login').send({ email: sa.email, password: 'Admin1234' });
    expect(res.status).toBe(200);
    expect(res.body.data.realm).toBe('platform');
    expect([].concat(res.headers['set-cookie'] ?? []).some((c) => c.startsWith('jerp_prt='))).toBe(true);
    expect((await api().get('/api/v1/platform/auth/me').set(bearer(res.body.data.accessToken))).body.data).toMatchObject({ email: sa.email, role: 'SUPER_ADMIN' });

    const wrong = await api().post('/api/v1/auth/login').send({ email: sa.email, password: 'Wrong1234' });
    expect(wrong.status).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');

    const tenant = await registerOrg();
    expect((await api().post('/api/v1/auth/login').send({ email: tenant.input.email, password: tenant.input.password })).body.data.realm).toBe('tenant');
  });

  it('never lets an organisation reuse a Super Admin email', async () => {
    const sa = await superAdmin();
    const res = await api().post('/api/v1/platform/organisations').set(bearer(sa.token)).send(orgBody({ email: sa.email }));
    expect(res.status).toBe(409);
    expect(res.body.error.details[0].path).toBe('email');
  });

  it.each([
    ['missing', undefined],
    ['zero', 0],
    ['negative', -2],
    ['fractional', 2.5],
    ['text', '5'],
    ['above the maximum', 501],
  ])('rejects a %s branch limit', async (label, branchLimit) => {
    const sa = await superAdmin();
    const res = await api().post('/api/v1/platform/organisations').set(bearer(sa.token)).send(orgBody({ branchLimit }));
    expect(res.status).toBe(400);
    expect(res.body.error.details.some((d) => d.path === 'branchLimit')).toBe(true);
  });

  it('edits organisation details and branch limit, but never below branches in use', async () => {
    const sa = await superAdmin();
    const body = orgBody({ branchLimit: 3 });
    const org = (await api().post('/api/v1/platform/organisations').set(bearer(sa.token)).send(body)).body.data;
    const edit = { organisationName: 'ABC Gold House', email: 'accounts@abc.local', mobile: '9830099999', stateCode: '27', branchLimit: 4 };

    const res = await api().patch(`/api/v1/platform/organisations/${org.id}`).set(bearer(sa.token)).send(edit);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: 'ABC Gold House', email: 'accounts@abc.local', phone: '9830099999', stateCode: '27', branchLimit: 4, branchesUsed: 1 });
    expect(res.body.data.owner.email).toBe('accounts@abc.local'); // the organisation email is its login

    const tooLow = await api().patch(`/api/v1/platform/organisations/${org.id}`).set(bearer(sa.token)).send({ ...edit, branchLimit: 0 });
    expect(tooLow.status).toBe(400);
    const invalid = await api().patch(`/api/v1/platform/organisations/${org.id}`).set(bearer(sa.token)).send({ ...edit, email: 'nope', mobile: '12' });
    expect(invalid.body.error.details.map((d) => d.path).sort()).toEqual(['email', 'mobile']);

    const owner = await ownerSession('accounts@abc.local');
    await api().post('/api/v1/branches').set(bearer(owner)).send(branch('KOL'));
    const belowUsage = await api().patch(`/api/v1/platform/organisations/${org.id}`).set(bearer(sa.token)).send({ ...edit, branchLimit: 1 });
    expect(belowUsage.body.error.code).toBe('BRANCH_LIMIT_BELOW_USAGE');

    expect((await api().patch(`/api/v1/platform/organisations/${org.id}`).set(bearer(owner)).send(edit)).status).toBe(401);
  });

  it('changes the organisation login email and resets its password, signing out old sessions', async () => {
    const sa = await superAdmin();
    const body = orgBody();
    const org = (await api().post('/api/v1/platform/organisations').set(bearer(sa.token)).send(body)).body.data;
    const oldSession = (await api().post('/api/v1/auth/login').send({ email: body.email, password: 'Temp1234' })).body.data.accessToken;
    for (let i = 0; i < 3; i += 1) await api().post('/api/v1/auth/login').send({ email: body.email, password: 'wrong-one' });

    const newEmail = `new${Date.now()}@abc.local`;
    const edit = { organisationName: org.name, email: newEmail.toUpperCase(), password: '123456', mobile: '9830012345', stateCode: '19', branchLimit: 3 };
    const res = await api().patch(`/api/v1/platform/organisations/${org.id}`).set(bearer(sa.token)).send(edit);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ email: newEmail, owner: { email: newEmail } });

    expect((await api().get('/api/v1/auth/me').set(bearer(oldSession))).status).toBe(401);
    expect((await api().post('/api/v1/auth/login').send({ email: body.email, password: 'Temp1234' })).status).toBe(401);
    const login = await api().post('/api/v1/auth/login').send({ email: newEmail, password: '123456' });
    expect(login.body.data.realm).toBe('tenant');

    // A blank password keeps the current one; another account's email is refused.
    expect((await api().patch(`/api/v1/platform/organisations/${org.id}`).set(bearer(sa.token)).send({ ...edit, email: newEmail, password: '' })).status).toBe(200);
    expect((await api().post('/api/v1/auth/login').send({ email: newEmail, password: '123456' })).status).toBe(200);
    const taken = await api().patch(`/api/v1/platform/organisations/${org.id}`).set(bearer(sa.token)).send({ ...edit, email: sa.email, password: '' });
    expect(taken.status).toBe(409);
  });

  it("enforces the plan's user limit", async () => {
    const sa = await superAdmin();
    const body = orgBody({ branchLimit: 2 });
    const org = (await api().post('/api/v1/platform/organisations').set(bearer(sa.token)).send(body)).body.data;
    expect(org).toMatchObject({ plan: 'trial', userLimit: 5, activeUsers: 1 });
    const owner = (await api().post('/api/v1/auth/login').send({ email: body.email, password: 'Temp1234' })).body.data.accessToken;
    const roleId = (await api().get('/api/v1/roles').set(bearer(owner))).body.data.find((r) => r.key === 'staff').id;
    const addUser = (n) =>
      api().post('/api/v1/users').set(bearer(owner)).send({ name: `Staff ${n}`, email: `s${n}${Date.now()}@abc.local`, password: '123456', roleIds: [roleId], branchAccess: { all: true, branchIds: [] } });
    for (let n = 1; n <= 4; n += 1) expect((await addUser(n)).status).toBe(201);
    expect((await addUser(5)).body.error.code).toBe('PLAN_LIMIT_REACHED');
  });

  it('creates an organisation whose email and password sign straight in to its own panel', async () => {
    const sa = await superAdmin();
    const body = orgBody();
    const created = await api().post('/api/v1/platform/organisations').set(bearer(sa.token)).send(body);
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ branchLimit: 3, branchesUsed: 1, branchesAvailable: 2, owner: { email: body.email } });

    expect(await bcrypt.compare('Temp1234', (await User.findOne({ email: body.email }).setOptions({ skipTenant: true }).select('+passwordHash').lean()).passwordHash)).toBe(true);

    const login = await api().post('/api/v1/auth/login').send({ email: body.email.toUpperCase(), password: 'Temp1234' });
    expect(login.body.data.realm).toBe('tenant');
    const { org } = JSON.parse(Buffer.from(login.body.data.accessToken.split('.')[1], 'base64url').toString());
    expect(org).toBe(String(created.body.data.id));
    const me = (await api().get('/api/v1/auth/me').set(bearer(login.body.data.accessToken))).body.data;
    expect(me).toMatchObject({ organisation: { id: String(created.body.data.id) }, user: { mustChangePassword: false } });
    expect((await api().get('/api/v1/branches').set(bearer(login.body.data.accessToken))).status).toBe(200);

    const dup = await api().post('/api/v1/platform/organisations').set(bearer(sa.token)).send(orgBody({ email: body.email }));
    expect(dup.status).toBe(409);
  });

  it('enforces the branch limit and lets super admin raise or lower it', async () => {
    const sa = await superAdmin();
    const body = orgBody({ branchLimit: 3 });
    const org = (await api().post('/api/v1/platform/organisations').set(bearer(sa.token)).send(body)).body.data;
    const owner = await ownerSession(body.email);

    expect((await api().post('/api/v1/branches').set(bearer(owner)).send(branch('KOL'))).status).toBe(201);
    expect((await api().post('/api/v1/branches').set(bearer(owner)).send(branch('BNG'))).status).toBe(201);
    const fourth = await api().post('/api/v1/branches').set(bearer(owner)).send(branch('BRS'));
    expect(fourth.status).toBe(403);
    expect(fourth.body.error.code).toBe('BRANCH_LIMIT_REACHED');
    expect((await api().get('/api/v1/branches/usage').set(bearer(owner))).body.data).toEqual({ limit: 3, used: 3, available: 0 });

    const tooLow = await api().patch(`/api/v1/platform/organisations/${org.id}/branch-limit`).set(bearer(sa.token)).send({ branchLimit: 2 });
    expect(tooLow.body.error.code).toBe('BRANCH_LIMIT_BELOW_USAGE');

    const raised = await api().patch(`/api/v1/platform/organisations/${org.id}/branch-limit`).set(bearer(sa.token)).send({ branchLimit: 5 });
    expect(raised.body.data).toMatchObject({ branchLimit: 5, branchesUsed: 3, branchesAvailable: 2 });
    expect((await api().post('/api/v1/branches').set(bearer(owner)).send(branch('BRS'))).status).toBe(201);

    const me = (await api().get('/api/v1/auth/me').set(bearer(owner))).body.data;
    expect(me.organisation.branchLimit).toBe(5);

    const kol = (await api().get('/api/v1/branches?q=KOL').set(bearer(owner))).body.data[0];
    await api().patch(`/api/v1/branches/${kol._id}/status`).set(bearer(owner)).send({ status: 'inactive' });
    const lowered = await api().patch(`/api/v1/platform/organisations/${org.id}/branch-limit`).set(bearer(sa.token)).send({ branchLimit: 3 });
    expect(lowered.status).toBe(200);
    const reactivate = await api().patch(`/api/v1/branches/${kol._id}/status`).set(bearer(owner)).send({ status: 'active' });
    expect(reactivate.body.error.code).toBe('BRANCH_LIMIT_REACHED');
  });

  it('suspending an organisation blocks its users; list and dashboard report usage', async () => {
    const sa = await superAdmin();
    const body = orgBody();
    const org = (await api().post('/api/v1/platform/organisations').set(bearer(sa.token)).send(body)).body.data;
    const owner = await ownerSession(body.email);

    await api().patch(`/api/v1/platform/organisations/${org.id}/status`).set(bearer(sa.token)).send({ status: 'suspended' });
    expect((await api().get('/api/v1/auth/me').set(bearer(owner))).body.error.code).toBe('ORG_SUSPENDED');
    expect((await api().post('/api/v1/auth/login').send({ email: body.email, password: 'Owner1234' })).body.error.code).toBe('ORG_SUSPENDED');

    const list = await api().get(`/api/v1/platform/organisations?q=${encodeURIComponent(body.organisationName)}`).set(bearer(sa.token));
    expect(list.body.data[0]).toMatchObject({ status: 'suspended', branchLimit: 3, activeUsers: 1 });
    const dash = (await api().get('/api/v1/platform/dashboard').set(bearer(sa.token))).body.data;
    expect(dash.suspended).toBeGreaterThanOrEqual(1);
  });

  it('deactivating signs everyone out with a clear message, and reactivating lets them back in', async () => {
    const sa = await superAdmin();
    const body = orgBody();
    const org = (await api().post('/api/v1/platform/organisations').set(bearer(sa.token)).send(body)).body.data;
    const first = await api().post('/api/v1/auth/login').send({ email: body.email, password: 'Temp1234' });
    const token = first.body.data.accessToken;
    const cookie = refreshCookie(first);

    await api().patch(`/api/v1/platform/organisations/${org.id}/status`).set(bearer(sa.token)).send({ status: 'suspended' });
    const request = await api().get('/api/v1/branches').set(bearer(token));
    expect(request.status).toBe(403);
    expect(request.body.error).toMatchObject({ code: 'ORG_SUSPENDED', message: expect.stringMatching(/currently deactivated/) });
    const refresh = await api().post('/api/v1/auth/refresh').set('Cookie', cookie);
    expect(refresh.body.error.code).toBe('ORG_SUSPENDED');
    const login = await api().post('/api/v1/auth/login').send({ email: body.email, password: 'Temp1234' });
    expect(login.status).toBe(403);
    expect(login.body.error.message).toMatch(/deactivated.*platform administrator/);

    await api().patch(`/api/v1/platform/organisations/${org.id}/status`).set(bearer(sa.token)).send({ status: 'active' });
    expect((await api().post('/api/v1/auth/refresh').set('Cookie', cookie)).body.error.code).toBe('REFRESH_INVALID');
    expect((await api().post('/api/v1/auth/login').send({ email: body.email, password: 'Temp1234' })).status).toBe(200);
  });
});

describe('branch permissions', () => {
  async function setup() {
    const owner = await registerOrg();
    const me = (await api().get('/api/v1/auth/me').set(bearer(owner.token))).body.data;
    const kol = (await api().post('/api/v1/branches').set(bearer(owner.token)).send(branch('KOL'))).body.data;
    return { owner: owner.token, orgId: me.organisation.id, ho: me.branches[0].id, kol: kol._id };
  }

  const kolkataAccess = BRANCH_PERMISSIONS.filter((p) => ['sales.', 'customer.', 'inventory.', 'product.', 'order.'].some((m) => p.startsWith(m)));

  it('defaults to everything, and the organisation can restrict a branch', async () => {
    const ctx = await setup();
    const before = (await api().get(`/api/v1/branches/${ctx.kol}`).set(bearer(ctx.owner))).body.data;
    expect(before.allowedPermissions).toHaveLength(BRANCH_PERMISSIONS.length);

    const res = await api().put(`/api/v1/branches/${ctx.kol}/permissions`).set(bearer(ctx.owner)).send({ permissions: kolkataAccess });
    expect(res.status).toBe(200);
    expect(res.body.data.allowedPermissions).toEqual(kolkataAccess);

    const orgLevel = await api().put(`/api/v1/branches/${ctx.kol}/permissions`).set(bearer(ctx.owner)).send({ permissions: ['role.create'] });
    expect(orgLevel.status).toBe(400);
  });

  it('limits what users can do while working in that branch — on the server', async () => {
    const ctx = await setup();
    await api().put(`/api/v1/branches/${ctx.kol}/permissions`).set(bearer(ctx.owner)).send({ permissions: kolkataAccess });

    const inKolkata = (await api().get('/api/v1/auth/me').set(bearer(ctx.owner)).set('X-Branch-Id', ctx.kol)).body.data;
    expect(inKolkata.activeBranchId).toBe(ctx.kol);
    expect(inKolkata.permissions).toContain('sales.create');
    expect(inKolkata.permissions).not.toContain('supplier.create');
    expect(inKolkata.permissions).not.toContain('payroll.view');
    expect(inKolkata.permissions).toContain('role.create');

    const blocked = await api().post('/api/v1/suppliers').set(bearer(ctx.owner)).set('X-Branch-Id', ctx.kol).send({ companyName: 'Vendor', mobile: '9830011111', address: {} });
    expect(blocked.status).toBe(403);
    const allowed = await api().post('/api/v1/suppliers').set(bearer(ctx.owner)).set('X-Branch-Id', ctx.ho).send({ companyName: 'Vendor', mobile: '9830011111', address: {} });
    expect(allowed.status).toBe(201);
  });

  it('applies to branch staff by default branch and never grants more than their role', async () => {
    const ctx = await setup();
    await api().put(`/api/v1/branches/${ctx.kol}/permissions`).set(bearer(ctx.owner)).send({ permissions: ['customer.view', 'sales.view'] });

    const email = `staff${Date.now()}@abc.local`;
    await runWithContext({ organisationId: ctx.orgId }, async () => {
      const role = await Role.create({ key: `k${Date.now()}`, name: 'Counter', permissions: ['customer.view', 'customer.create', 'product.view'] });
      await User.create({ name: 'Counter Staff', email, passwordHash: await bcrypt.hash('Secret123', 4), roleIds: [role._id], branchAccess: { all: false, branchIds: [ctx.kol] }, defaultBranchId: ctx.kol });
    });
    const staff = (await api().post('/api/v1/auth/login').send({ email, password: 'Secret123' })).body.data.accessToken;

    const me = (await api().get('/api/v1/auth/me').set(bearer(staff))).body.data;
    expect(me.permissions.sort()).toEqual(['customer.view']);
    expect((await api().get('/api/v1/customers').set(bearer(staff))).status).toBe(200);
    expect((await api().post('/api/v1/customers').set(bearer(staff)).send({ name: 'Walk In', mobile: '9830099999', address: {} })).status).toBe(403);
    expect((await api().get('/api/v1/products').set(bearer(staff))).status).toBe(403);
    expect((await api().get('/api/v1/auth/me').set(bearer(staff)).set('X-Branch-Id', ctx.ho)).status).toBe(403);
  });

  it('only the organisation (all-branch users with branch.edit) can change branch access', async () => {
    const ctx = await setup();
    const email = `mgr${Date.now()}@abc.local`;
    await runWithContext({ organisationId: ctx.orgId }, async () => {
      const role = await Role.create({ key: `m${Date.now()}`, name: 'Manager', permissions: ['branch.view', 'branch.edit'] });
      await User.create({ name: 'Branch Manager', email, passwordHash: await bcrypt.hash('Secret123', 4), roleIds: [role._id], branchAccess: { all: false, branchIds: [ctx.kol] } });
    });
    const manager = (await api().post('/api/v1/auth/login').send({ email, password: 'Secret123' })).body.data.accessToken;
    const res = await api().put(`/api/v1/branches/${ctx.kol}/permissions`).set(bearer(manager)).send({ permissions: BRANCH_PERMISSIONS });
    expect(res.status).toBe(403);
  });
});

describe('super admin: free days and deleting unused organisations', () => {
  it('gives a new organisation the free days chosen; 0 means it must subscribe before using the app', async () => {
    const sa = await superAdmin();
    const ten = (await api().post('/api/v1/platform/organisations').set(bearer(sa.token)).send(orgBody({ freeDays: 10 }))).body.data;
    expect(ten.subscription).toMatchObject({ status: 'trial', expired: false, daysLeft: 10 });

    const none = orgBody({ freeDays: 0 });
    await api().post('/api/v1/platform/organisations').set(bearer(sa.token)).send(none);
    const token = await ownerSession(none.email);
    const blocked = await api().get('/api/v1/customers').set(bearer(token));
    expect(blocked.status).toBe(402);

    const bad = await api().post('/api/v1/platform/organisations').set(bearer(sa.token)).send(orgBody({ freeDays: -1 }));
    expect(bad.body.error.details.some((d) => d.path === 'freeDays')).toBe(true);
  });

  it('deletes an organisation with no records of its own, and refuses once it has any', async () => {
    const sa = await superAdmin();
    const unused = (await api().post('/api/v1/platform/organisations').set(bearer(sa.token)).send(orgBody())).body.data;
    expect(unused).toMatchObject({ canDelete: true, records: [] });
    const del = await api().delete(`/api/v1/platform/organisations/${unused.id}`).set(bearer(sa.token));
    expect(del.status).toBe(200);
    expect((await api().get(`/api/v1/platform/organisations/${unused.id}`).set(bearer(sa.token))).status).toBe(404);
    expect(await User.countDocuments({ organisationId: unused.id }).setOptions({ skipTenant: true })).toBe(0);

    const body = orgBody();
    const used = (await api().post('/api/v1/platform/organisations').set(bearer(sa.token)).send(body)).body.data;
    const token = await ownerSession(body.email);
    await api().post('/api/v1/customers').set(bearer(token)).send({ name: 'First Buyer', mobile: '9830011111', address: { stateCode: '19' } });
    const detail = (await api().get(`/api/v1/platform/organisations/${used.id}`).set(bearer(sa.token))).body.data;
    expect(detail.canDelete).toBe(false);
    expect(detail.records).toEqual([{ type: 'customer', count: 1 }]);
    const refused = await api().delete(`/api/v1/platform/organisations/${used.id}`).set(bearer(sa.token));
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('ORGANISATION_IN_USE');
  });
});

describe('super admin: editing free days and the edit history', () => {
  it('changes the free days while on the free period, and both panels show who changed what', async () => {
    const sa = await superAdmin();
    const body = orgBody({ freeDays: 14 });
    const org = (await api().post('/api/v1/platform/organisations').set(bearer(sa.token)).send(body)).body.data;
    expect(org.freeDays).toBe(14);

    const edit = { organisationName: org.name, email: body.email, mobile: body.mobile, stateCode: '19', branchLimit: 3 };
    const longer = (await api().patch(`/api/v1/platform/organisations/${org.id}`).set(bearer(sa.token)).send({ ...edit, freeDays: 30, branchLimit: 4 })).body.data;
    expect(longer).toMatchObject({ freeDays: 30, branchLimit: 4 });
    expect(longer.subscription.daysLeft).toBe(30);

    const owner = await ownerSession(body.email);
    const renamed = await api().patch('/api/v1/organisation').set(bearer(owner)).send({ name: 'Renamed By Owner', timezone: 'Asia/Kolkata', address: { stateCode: '19' } });
    expect(renamed.status).toBe(200);

    const adminView = (await api().get(`/api/v1/platform/organisations/${org.id}/history`).set(bearer(sa.token))).body.data;
    const ownView = (await api().get('/api/v1/organisation/history').set(bearer(owner))).body.data;
    expect(ownView).toEqual(adminView);
    expect(adminView.map((e) => e.title)).toEqual(['Details edited', 'Details edited', 'Organisation created']);
    expect(adminView[0]).toMatchObject({ by: { kind: 'user', name: 'Amit Das' } });
    expect(adminView[0].changes).toContainEqual({ field: 'name', label: 'Business name', from: org.name, to: 'Renamed By Owner' });
    expect(adminView[1]).toMatchObject({ by: { kind: 'admin', name: 'Platform Owner' } });
    expect(adminView[1].changes).toEqual(
      expect.arrayContaining([
        { field: 'branchLimit', label: 'Branch limit', from: '3', to: '4' },
        { field: 'freeDays', label: 'Free days', from: '14 days', to: '30 days' },
      ]),
    );
  });
});
