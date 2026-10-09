import { describe, expect, it } from 'vitest';
import { api, bearer, registerOrg } from './helpers.js';

const branchBody = (code, o = {}) => ({ code, name: `Branch ${code}`, address: { stateCode: '19' }, ...o });
const login = (email, password) => api().post('/api/v1/auth/login').send({ email, password });

async function setup(branch = {}) {
  const owner = await registerOrg();
  const email = `slk${Date.now()}${Math.random().toString(36).slice(2, 6)}@abc.local`;
  const created = (await api().post('/api/v1/branches').set(bearer(owner.token)).send(branchBody('SLK', { email, ...branch }))).body.data;
  return { owner, email, branchId: created._id, url: `/api/v1/branches/${created._id}/login` };
}

describe('branch login', () => {
  it('signs in with the branch email and only the password set here, limited to that branch', async () => {
    const { owner, email, branchId, url } = await setup();

    expect((await api().put(url).set(bearer(owner.token)).send({})).body.error.details[0].path).toBe('password');
    const created = await api().put(url).set(bearer(owner.token)).send({ password: '123456' });
    expect(created.status).toBe(200);
    expect(created.body.data).toMatchObject({ email, status: 'active' });

    const list = (await api().get('/api/v1/branches').set(bearer(owner.token))).body.data;
    expect(list.find((b) => b._id === branchId).login.email).toBe(email);
    expect(list.find((b) => b.isHeadOffice).login).toBeNull();

    const res = await login(email.toUpperCase(), '123456');
    expect(res.body.data.realm).toBe('tenant');
    const me = (await api().get('/api/v1/auth/me').set(bearer(res.body.data.accessToken))).body.data;
    expect(me.user).toMatchObject({ allBranches: false, mustChangePassword: false, defaultBranchId: branchId });
    expect(me.branches.map((b) => b.id)).toEqual([branchId]);
    expect(me.user.roles.map((r) => r.key)).toEqual(['branch_manager']);
  });

  it('needs a branch email first', async () => {
    const { owner, url } = await setup({ email: '' });
    const res = await api().put(url).set(bearer(owner.token)).send({ password: '123456' });
    expect(res.body.error.code).toBe('BRANCH_EMAIL_REQUIRED');
  });

  it('changing the password signs out old sessions', async () => {
    const { owner, email, url } = await setup();
    await api().put(url).set(bearer(owner.token)).send({ password: '123456' });
    const oldToken = (await login(email, '123456')).body.data.accessToken;

    expect((await api().put(url).set(bearer(owner.token)).send({ password: '654321' })).status).toBe(200);
    expect((await api().get('/api/v1/auth/me').set(bearer(oldToken))).status).toBe(401);
    expect((await login(email, '123456')).status).toBe(401);
    expect((await login(email, '654321')).status).toBe(200);
  });

  it('follows the branch email when the branch is edited, and keeps it unique and present', async () => {
    const { owner, email, branchId, url } = await setup();
    await api().put(url).set(bearer(owner.token)).send({ password: '123456' });
    const edit = (o) => api().put(`/api/v1/branches/${branchId}`).set(bearer(owner.token)).send(branchBody('SLK', o));

    const renamed = `new${email}`;
    expect((await edit({ email: renamed })).status).toBe(200);
    expect((await login(email, '123456')).status).toBe(401);
    expect((await login(renamed, '123456')).status).toBe(200);

    expect((await edit({ email: owner.input.email })).status).toBe(409);
    expect((await edit({ email: '' })).status).toBe(400);
    expect((await login(renamed, '123456')).status).toBe(200);
  });

  it('only users who manage branches and users across all branches can set it', async () => {
    const { owner, email, url } = await setup();
    await api().put(url).set(bearer(owner.token)).send({ password: '123456' });
    const branchToken = (await login(email, '123456')).body.data.accessToken;
    expect((await api().put(url).set(bearer(branchToken)).send({ password: '999999' })).status).toBe(403);
  });
});

describe('branch panel: HR, payroll and reports', () => {
  it('runs its own staff and payroll and sees reports for its branch only', async () => {
    const { owner, email, branchId, url } = await setup();
    await api().put(url).set(bearer(owner.token)).send({ password: '123456' });
    const t = (await login(email, '123456')).body.data.accessToken;
    const ownerMe = (await api().get('/api/v1/auth/me').set(bearer(owner.token))).body.data;
    const ho = ownerMe.branches.find((b) => b.id !== branchId).id;
    const hire = (token, b, mobile) =>
      api().post('/api/v1/hr/employees').set(bearer(token)).send({ name: 'Staff', mobile, designation: 'Salesman', branchId: b, joiningDate: '2025-01-01', basicPaise: 1500000 });

    // Owner gives an advance at Head Office: a cash journal the branch must not see.
    const hoStaff = (await hire(owner.token, ho, '9700000001')).body.data;
    await api().post('/api/v1/hr/advances').set(bearer(owner.token)).send({ employeeId: hoStaff.id, amountPaise: 50000, installmentPaise: 10000, mode: 'cash' });

    // Branch login: own employee, advance and payroll work; Head Office is off limits.
    expect((await hire(t, ho, '9700000002')).status).toBe(403);
    const mine = (await hire(t, branchId, '9700000003')).body.data;
    expect(mine.code).toMatch(/^E/);
    expect((await api().post('/api/v1/hr/advances').set(bearer(t)).send({ employeeId: mine.id, amountPaise: 20000, installmentPaise: 5000, mode: 'cash' })).status).toBe(201);
    const month = new Date().toISOString().slice(0, 7);
    const run = await api().post('/api/v1/hr/payroll').set(bearer(t)).send({ branchId, month });
    expect(run.status).toBe(201);
    expect(run.body.data.lines.map((l) => l.employeeId)).toEqual([mine.id]);
    expect((await api().get('/api/v1/hr/employees').set(bearer(t))).body.data.map((e) => e.id)).toEqual([mine.id]);

    const keys = (await api().get('/api/v1/reports').set(bearer(t))).body.data.map((r) => r.key);
    expect(keys).toEqual(expect.arrayContaining(['sales-register', 'salary-register', 'attendance-summary', 'day-book', 'trial-balance', 'cash-book']));

    const dayBook = (await api().get('/api/v1/reports/day-book').set(bearer(t))).body.data;
    expect(dayBook.totals.debitPaise).toBe(20000);
    const ownerBook = (await api().get('/api/v1/reports/day-book').set(bearer(owner.token))).body.data;
    expect(ownerBook.totals.debitPaise).toBe(70000);
    const cash = (await api().get('/api/v1/reports/cash-book?account=cash').set(bearer(t))).body.data;
    expect(cash.totals.outPaise).toBe(20000);
    const tb = (await api().get('/api/v1/reports/trial-balance').set(bearer(t))).body.data;
    expect(tb.totals.debitPaise).toBe(20000);
    expect((await api().get(`/api/v1/reports/day-book?branchId=${ho}`).set(bearer(t))).status).toBe(403);
  });

  it('brings system roles of older organisations up to date at start-up', async () => {
    const owner = await registerOrg();
    const me = (await api().get('/api/v1/auth/me').set(bearer(owner.token))).body.data;
    const { runWithContext } = await import('../src/core/context/requestContext.js');
    const { Role } = await import('../src/modules/roles/role.model.js');
    const { syncSystemRoles } = await import('../src/modules/roles/syncSystemRoles.js');
    const read = () => runWithContext({ organisationId: me.organisation.id }, async () => await Role.findOne({ key: 'branch_manager' }).lean());
    await runWithContext({ organisationId: me.organisation.id }, async () => await Role.updateOne({ key: 'branch_manager' }, { $set: { permissions: ['sales.view'] } }));
    expect((await read()).permissions).toEqual(['sales.view']);
    await syncSystemRoles();
    expect((await read()).permissions).toEqual(expect.arrayContaining(['payroll.view', 'payroll.process', 'payroll.approve', 'employee.create', 'report.finance']));
  });
});
