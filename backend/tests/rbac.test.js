import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { runWithContext } from '../src/core/context/requestContext.js';
import { Role } from '../src/modules/roles/role.model.js';
import { User } from '../src/modules/users/user.model.js';
import { api, bearer, registerOrg } from './helpers.js';

async function createStaffUser(ownerToken, permissions, branchAccess = { all: true, branchIds: [] }) {
  const me = await api().get('/api/v1/auth/me').set(bearer(ownerToken));
  const organisationId = me.body.data.organisation.id;
  const email = `staff${Date.now()}${Math.random().toString(36).slice(2, 6)}@example.com`;

  await runWithContext({ organisationId }, async () => {
    const role = await Role.create({ key: `t_${Date.now()}${Math.random()}`, name: `Test ${email}`, permissions });
    await User.create({ name: 'Staff', email, passwordHash: await bcrypt.hash('Secret123', 4), roleIds: [role._id], branchAccess });
  });

  const login = await api().post('/api/v1/auth/login').send({ email, password: 'Secret123' });
  return { token: login.body.data.accessToken, organisationId, me };
}

describe('permission enforcement', () => {
  it('returns 403 when the user lacks the permission', async () => {
    const owner = await registerOrg();
    const { token } = await createStaffUser(owner.token, ['branch.view']);

    expect((await api().get('/api/v1/branches').set(bearer(token))).status).toBe(200);
    const create = await api().post('/api/v1/branches').set(bearer(token)).send({ code: 'NO', name: 'Nope', address: {} });
    expect(create.status).toBe(403);
    expect((await api().get('/api/v1/roles').set(bearer(token))).status).toBe(403);
    expect((await api().patch('/api/v1/organisation').set(bearer(token)).send({})).status).toBe(403);
  });

  it('only exposes branches the user is assigned to', async () => {
    const owner = await registerOrg();
    const second = await api().post('/api/v1/branches').set(bearer(owner.token)).send({ code: 'B2', name: 'Second', address: {} });
    const { token } = await createStaffUser(owner.token, ['branch.view'], { all: false, branchIds: [second.body.data._id] });

    const list = await api().get('/api/v1/branches').set(bearer(token));
    expect(list.body.data.map((b) => b.code)).toEqual(['B2']);
    const me = await api().get('/api/v1/auth/me').set(bearer(token));
    expect(me.body.data.branches.map((b) => b.code)).toEqual(['B2']);
  });
});

describe('roles', () => {
  it('system roles cannot be edited or deleted, but can be duplicated', async () => {
    const { token } = await registerOrg();
    const roles = (await api().get('/api/v1/roles').set(bearer(token))).body.data;
    const sales = roles.find((r) => r.key === 'sales_staff');

    const edit = await api().put(`/api/v1/roles/${sales.id}`).set(bearer(token)).send({ name: 'Changed', permissions: ['sales.view'] });
    expect(edit.status).toBe(403);
    expect((await api().delete(`/api/v1/roles/${sales.id}`).set(bearer(token))).status).toBe(403);

    const dup = await api().post(`/api/v1/roles/${sales.id}/duplicate`).set(bearer(token));
    expect(dup.status).toBe(201);
    expect(dup.body.data.isSystem).toBe(false);
    expect(dup.body.data.permissions).toEqual(sales.permissions);

    const dup2 = await api().post(`/api/v1/roles/${sales.id}/duplicate`).set(bearer(token));
    expect(dup2.body.data.name).toBe('Sales Staff (copy 2)');
  });

  it('creates, updates and deletes custom roles', async () => {
    const { token } = await registerOrg();
    const created = await api().post('/api/v1/roles').set(bearer(token)).send({ name: 'Cashier', permissions: ['sales.view', 'sales.create'] });
    expect(created.status).toBe(201);
    const id = created.body.data.id;

    const dupName = await api().post('/api/v1/roles').set(bearer(token)).send({ name: 'cashier', permissions: ['sales.view'] });
    expect(dupName.status).toBe(409);

    const updated = await api().put(`/api/v1/roles/${id}`).set(bearer(token)).send({ name: 'Cashier', description: 'Counter', permissions: ['sales.view'] });
    expect(updated.status).toBe(200);
    expect(updated.body.data.permissions).toEqual(['sales.view']);

    expect((await api().delete(`/api/v1/roles/${id}`).set(bearer(token))).status).toBe(200);
  });

  it('prevents granting permissions the actor does not hold', async () => {
    const owner = await registerOrg();
    const { token } = await createStaffUser(owner.token, ['role.view', 'role.create', 'sales.view']);

    const ok = await api().post('/api/v1/roles').set(bearer(token)).send({ name: 'Viewer2', permissions: ['sales.view'] });
    expect(ok.status).toBe(201);

    const escalate = await api().post('/api/v1/roles').set(bearer(token)).send({ name: 'Boss', permissions: ['sales.view', 'role.delete'] });
    expect(escalate.status).toBe(403);
    expect(escalate.body.error.code).toBe('PERMISSION_ESCALATION');
  });

  it('refuses to delete a role assigned to users', async () => {
    const owner = await registerOrg();
    await createStaffUser(owner.token, ['sales.view']);
    const roles = (await api().get('/api/v1/roles').set(bearer(owner.token))).body.data;
    const custom = roles.find((r) => !r.isSystem);
    const res = await api().delete(`/api/v1/roles/${custom.id}`).set(bearer(owner.token));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ROLE_IN_USE');
  });
});

describe('branches', () => {
  it('enforces plan limits and protects the head office', async () => {
    const { token } = await registerOrg();
    const me = await api().get('/api/v1/auth/me').set(bearer(token));
    const ho = me.body.data.branches[0].id;

    const deactivate = await api().patch(`/api/v1/branches/${ho}/status`).set(bearer(token)).send({ status: 'inactive' });
    expect(deactivate.status).toBe(409);

    expect((await api().post('/api/v1/branches').set(bearer(token)).send({ code: 'B2', name: 'Two', address: {} })).status).toBe(201);
    const third = await api().post('/api/v1/branches').set(bearer(token)).send({ code: 'B3', name: 'Three', address: {} });
    expect(third.status).toBe(403);
    expect(third.body.error.code).toBe('BRANCH_LIMIT_REACHED');
  });

  it('validates GSTIN and normalises code', async () => {
    const { token } = await registerOrg();
    const bad = await api().post('/api/v1/branches').set(bearer(token)).send({ code: 'b2', name: 'Two', gstin: 'BAD', address: {} });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details[0].path).toBe('gstin');

    const good = await api().post('/api/v1/branches').set(bearer(token)).send({ code: 'b2', name: 'Two', gstin: '19aabcu9603r1zm', address: { pincode: '' } });
    expect(good.status).toBe(201);
    expect(good.body.data.code).toBe('B2');
    expect(good.body.data.gstin).toBe('19AABCU9603R1ZM');
  });
});

describe('organisation', () => {
  it('updates organisation profile with audit trail', async () => {
    const { token } = await registerOrg();
    const res = await api()
      .patch('/api/v1/organisation')
      .set(bearer(token))
      .send({ name: 'Renamed Jewellers', legalName: 'Renamed Pvt Ltd', pan: 'abcde1234f', timezone: 'Asia/Kolkata', address: { city: 'Kolkata', stateCode: '19' } });
    expect(res.status).toBe(200);
    expect(res.body.data.pan).toBe('ABCDE1234F');
    const sub = await api().get('/api/v1/organisation/subscription').set(bearer(token));
    expect(sub.body.data.limits.branches).toBe(2);
  });
});
