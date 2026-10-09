import { describe, expect, it } from 'vitest';
import { api, bearer, registerOrg } from './helpers.js';

const uniqueEmail = () => `staff${Date.now()}${Math.random().toString(36).slice(2, 7)}@example.com`;

async function context(token) {
  const me = (await api().get('/api/v1/auth/me').set(bearer(token))).body.data;
  const roles = (await api().get('/api/v1/roles').set(bearer(token))).body.data;
  const role = (key) => roles.find((r) => r.key === key).id;
  return { me, role, headOffice: me.branches[0].id };
}

const newUser = (overrides) => ({
  name: 'Counter Staff',
  email: uniqueEmail(),
  mobile: '9123456780',
  password: 'Temp1234',
  roleIds: [],
  branchAccess: { all: false, branchIds: [] },
  ...overrides,
});

async function signIn(email, password) {
  const res = await api().post('/api/v1/auth/login').send({ email, password });
  return res.body.data?.accessToken;
}

describe('user management', () => {
  it('creates a user who must change password before using the app', async () => {
    const owner = await registerOrg();
    const { role, headOffice } = await context(owner.token);
    const body = newUser({ roleIds: [role('sales_staff')], branchAccess: { all: false, branchIds: [headOffice] } });

    const created = await api().post('/api/v1/users').set(bearer(owner.token)).send(body);
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({ email: body.email, mustChangePassword: true, status: 'active' });
    expect(created.body.data.roles[0].name).toBe('Sales Staff');
    expect(created.body.data.defaultBranch.id).toBe(headOffice);

    const token = await signIn(body.email, 'Temp1234');
    const blocked = await api().get('/api/v1/branches').set(bearer(token));
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
    const me = await api().get('/api/v1/auth/me').set(bearer(token));
    expect(me.body.data.user.mustChangePassword).toBe(true);

    const changed = await api().post('/api/v1/auth/change-password').set(bearer(token)).send({ currentPassword: 'Temp1234', newPassword: 'Mine12345' });
    expect(changed.status).toBe(200);
    const after = await api().get('/api/v1/auth/me').set(bearer(changed.body.data.accessToken));
    expect(after.body.data.user.mustChangePassword).toBe(false);
    expect(after.body.data.permissions).toContain('sales.create');
    expect(after.body.data.permissions).not.toContain('user.view');
  });

  it('validates branch access, roles and duplicate email', async () => {
    const owner = await registerOrg();
    const other = await registerOrg();
    const { role } = await context(owner.token);
    const { headOffice: foreignBranch, role: foreignRole } = await context(other.token);

    const noBranch = await api().post('/api/v1/users').set(bearer(owner.token)).send(newUser({ roleIds: [role('viewer')] }));
    expect(noBranch.status).toBe(400);
    expect(noBranch.body.error.details[0].path).toBe('branchAccess.branchIds');

    const crossBranch = await api().post('/api/v1/users').set(bearer(owner.token)).send(newUser({ roleIds: [role('viewer')], branchAccess: { all: false, branchIds: [foreignBranch] } }));
    expect(crossBranch.status).toBe(400);

    const crossRole = await api().post('/api/v1/users').set(bearer(owner.token)).send(newUser({ roleIds: [foreignRole('viewer')], branchAccess: { all: true } }));
    expect(crossRole.status).toBe(400);

    const dup = await api().post('/api/v1/users').set(bearer(owner.token)).send(newUser({ email: owner.input.email, roleIds: [role('viewer')], branchAccess: { all: true } }));
    expect(dup.status).toBe(409);
  });

  it('enforces the plan user limit', async () => {
    const owner = await registerOrg();
    const { role } = await context(owner.token);
    for (let i = 0; i < 4; i += 1) {
      const res = await api().post('/api/v1/users').set(bearer(owner.token)).send(newUser({ roleIds: [role('viewer')], branchAccess: { all: true } }));
      expect(res.status).toBe(201);
    }
    const sixth = await api().post('/api/v1/users').set(bearer(owner.token)).send(newUser({ roleIds: [role('viewer')], branchAccess: { all: true } }));
    expect(sixth.status).toBe(403);
    expect(sixth.body.error.code).toBe('PLAN_LIMIT_REACHED');
  });

  it('protects the owner and the acting user', async () => {
    const owner = await registerOrg();
    const { me, role } = await context(owner.token);
    const ownerId = me.user.id;

    const disableSelf = await api().patch(`/api/v1/users/${ownerId}/status`).set(bearer(owner.token)).send({ status: 'disabled' });
    expect(disableSelf.status).toBe(403);

    const demote = await api()
      .put(`/api/v1/users/${ownerId}`)
      .set(bearer(owner.token))
      .send({ name: 'Owner', roleIds: [role('viewer')], branchAccess: { all: true } });
    expect(demote.status).toBe(403);

    const rename = await api()
      .put(`/api/v1/users/${ownerId}`)
      .set(bearer(owner.token))
      .send({ name: 'Renamed Owner', roleIds: [role('org_admin')], branchAccess: { all: true } });
    expect(rename.status).toBe(200);
    expect(rename.body.data.name).toBe('Renamed Owner');
  });

  it('prevents assigning roles with permissions the actor lacks', async () => {
    const owner = await registerOrg();
    const { role } = await context(owner.token);
    const managerBody = newUser({ roleIds: [role('hr_manager')], branchAccess: { all: true } });
    const hrRole = (await api().get('/api/v1/roles').set(bearer(owner.token))).body.data.find((r) => r.key === 'hr_manager');

    const custom = await api()
      .post('/api/v1/roles')
      .set(bearer(owner.token))
      .send({ name: 'People Admin', permissions: [...hrRole.permissions, 'user.view', 'user.create', 'user.edit', 'role.view'] });
    managerBody.roleIds = [custom.body.data.id];
    await api().post('/api/v1/users').set(bearer(owner.token)).send(managerBody);

    let token = await signIn(managerBody.email, 'Temp1234');
    token = (await api().post('/api/v1/auth/change-password').set(bearer(token)).send({ currentPassword: 'Temp1234', newPassword: 'Mine12345' })).body.data.accessToken;

    const escalate = await api().post('/api/v1/users').set(bearer(token)).send(newUser({ roleIds: [role('org_admin')], branchAccess: { all: true } }));
    expect(escalate.status).toBe(403);
    expect(escalate.body.error.code).toBe('PERMISSION_ESCALATION');

    const allowed = await api().post('/api/v1/users').set(bearer(token)).send(newUser({ roleIds: [role('hr_manager')], branchAccess: { all: true } }));
    expect(allowed.status).toBe(201);
  });

  it('deactivation and admin reset sign the user out everywhere', async () => {
    const owner = await registerOrg();
    const { role } = await context(owner.token);
    const body = newUser({ roleIds: [role('viewer')], branchAccess: { all: true } });
    const id = (await api().post('/api/v1/users').set(bearer(owner.token)).send(body)).body.data.id;

    const token = await signIn(body.email, 'Temp1234');
    const reset = await api().post(`/api/v1/users/${id}/reset-password`).set(bearer(owner.token)).send({ password: 'Fresh1234' });
    expect(reset.status).toBe(200);
    expect((await api().get('/api/v1/auth/me').set(bearer(token))).status).toBe(401);
    expect(await signIn(body.email, 'Temp1234')).toBeUndefined();

    const fresh = await signIn(body.email, 'Fresh1234');
    expect(fresh).toBeTruthy();
    const disabled = await api().patch(`/api/v1/users/${id}/status`).set(bearer(owner.token)).send({ status: 'disabled' });
    expect(disabled.body.data.status).toBe('disabled');
    expect((await api().get('/api/v1/auth/me').set(bearer(fresh))).status).toBe(401);
    const login = await api().post('/api/v1/auth/login').send({ email: body.email, password: 'Fresh1234' });
    expect(login.body.error.code).toBe('ACCOUNT_DISABLED');
  });

  it('lists with search and filters, and isolates organisations', async () => {
    const owner = await registerOrg();
    const other = await registerOrg();
    const { role } = await context(owner.token);
    await api().post('/api/v1/users').set(bearer(owner.token)).send(newUser({ name: 'Priya Sen', roleIds: [role('accountant')], branchAccess: { all: true } }));

    const search = await api().get('/api/v1/users?q=priya').set(bearer(owner.token));
    expect(search.body.data.map((u) => u.name)).toEqual(['Priya Sen']);
    const byRole = await api().get(`/api/v1/users?roleId=${role('accountant')}`).set(bearer(owner.token));
    expect(byRole.body.meta.total).toBe(1);

    const otherList = await api().get('/api/v1/users').set(bearer(other.token));
    expect(otherList.body.meta.total).toBe(1);
    const priyaId = search.body.data[0].id;
    expect((await api().get(`/api/v1/users/${priyaId}`).set(bearer(other.token))).status).toBe(404);
  });
});
