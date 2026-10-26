import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { PlatformAdmin } from '../src/modules/platform/platformAdmin.model.js';
import { api, bearer } from './helpers.js';

/* The Super Admin panel's Undo: its own stack, apart from every organisation's, with the same rules. */

async function superAdmin() {
  const email = `sa${Date.now()}${Math.random().toString(36).slice(2, 6)}@platform.local`;
  await PlatformAdmin.create({ name: 'Platform Owner', email, passwordHash: await bcrypt.hash('Admin1234', 4) });
  const token = (await api().post('/api/v1/auth/login').send({ email, password: 'Admin1234' })).body.data.accessToken;
  const call = (method, url, body) => api()[method](`/api/v1/platform${url}`).set(bearer(token)).send(body);
  return {
    token,
    call,
    latest: async () => (await call('get', '/undo/latest')).body.data,
    undo: (id, reason = 'Done by mistake') => call('post', `/undo/${id}/undo`, { reason }),
    dismiss: (id, reason = 'Keep it as it is') => call('post', `/undo/${id}/dismiss`, { reason }),
  };
}

const orgBody = (o = {}) => ({
  organisationName: `ABC Jewellery ${Date.now()}`,
  ownerName: 'Amit Das',
  email: `owner${Date.now()}${Math.random().toString(36).slice(2, 6)}@abc.local`,
  mobile: '9830012345',
  stateCode: '19',
  password: 'Temp1234',
  ...o,
});

const plan = { name: 'Gold Plan', pricePaise: 120000, durationMonths: 12, limits: { users: 5, branches: 2, products: 1000 }, features: ['Billing'] };

describe('super admin undo', () => {
  it('deletes an organisation it just created (unused), and reactivates one it deactivated', async () => {
    const sa = await superAdmin();
    const org = (await sa.call('post', '/organisations', orgBody())).body.data;
    expect((await sa.call('patch', `/organisations/${org.id}/status`, { status: 'suspended' })).status).toBe(200);

    let top = await sa.latest();
    expect(top).toMatchObject({ scope: 'platform', type: 'platform.orgStatus', canUndo: true, createdBy: { name: 'Platform Owner' } });
    expect((await sa.undo(top.id, 'Wrong organisation')).body.data).toMatchObject({ status: 'undone', resolution: { reason: 'Wrong organisation', by: { name: 'Platform Owner' } } });
    expect((await sa.call('get', `/organisations/${org.id}`)).body.data.status).toBe('active');

    top = await sa.latest();
    expect(top).toMatchObject({ type: 'platform.orgCreate', canUndo: true });
    expect((await sa.undo(top.id)).status).toBe(200);
    expect((await sa.call('get', `/organisations/${org.id}`)).status).toBe(404);
    // Everything stays on record; the platform's audit log has the undo with its reason.
    const history = (await sa.call('get', '/undo/history')).body.data;
    expect(history.map((h) => [h.type, h.status])).toEqual([
      ['platform.orgStatus', 'undone'],
      ['platform.orgCreate', 'undone'],
    ]);
  });

  it('will not delete an organisation that has records — it can be kept instead, with a reason', async () => {
    const sa = await superAdmin();
    const body = orgBody();
    await sa.call('post', '/organisations', body);
    let token = (await api().post('/api/v1/auth/login').send({ email: body.email, password: 'Temp1234' })).body.data.accessToken;
    token = (await api().post('/api/v1/auth/change-password').set(bearer(token)).send({ currentPassword: 'Temp1234', newPassword: 'Owner1234' })).body.data.accessToken;
    await api().post('/api/v1/customers').set(bearer(token)).send({ name: 'First Buyer', mobile: '9830011111', address: { stateCode: '19' } });

    const top = await sa.latest();
    expect(top).toMatchObject({ type: 'platform.orgCreate', canUndo: false });
    expect(top.blockedBy).toMatch(/customer/);
    expect((await sa.undo(top.id)).body.error.code).toBe('UNDO_BLOCKED');
    expect((await sa.dismiss(top.id, 'They are using it')).body.data.status).toBe('dismissed');
    expect(await sa.latest()).toBeNull();

    // The organisation's own stack is theirs alone: no platform actions on it, and no way to reach the platform's.
    const theirs = (await api().get('/api/v1/undo/stacks').set(bearer(token))).body.data;
    expect(theirs.flatMap((s) => (s.latest ? [s.latest.type] : []))).not.toContain('platform.orgCreate');
    expect((await api().get('/api/v1/platform/undo/latest').set(bearer(token))).status).toBe(401);
  });

  it('puts a plan back after an edit, removes a new one, and brings a deleted one back', async () => {
    const sa = await superAdmin();
    const created = (await sa.call('post', '/plans', plan)).body.data;
    expect((await sa.call('put', `/plans/${created.id}`, { ...plan, pricePaise: 150000 })).status).toBe(200);

    let top = await sa.latest();
    expect(top.type).toBe('platform.planUpdate');
    expect((await sa.undo(top.id)).status).toBe(200);
    const plans = async () => (await sa.call('get', '/plans')).body.data;
    expect((await plans()).find((p) => p.id === created.id).pricePaise).toBe(120000);

    top = await sa.latest();
    expect(top.type).toBe('platform.planCreate');
    expect((await sa.undo(top.id)).status).toBe(200);
    expect((await plans()).find((p) => p.id === created.id)).toBeUndefined();

    const again = (await sa.call('post', '/plans', { ...plan, name: 'Silver Plan' })).body.data;
    expect((await sa.call('delete', `/plans/${again.id}`)).status).toBe(200);
    top = await sa.latest();
    expect(top.type).toBe('platform.planDelete');
    expect((await sa.undo(top.id)).status).toBe(200);
    expect((await plans()).find((p) => p.id === again.id)).toMatchObject({ name: 'Silver Plan' });
  });

  it('takes back a subscription payment: the period goes back and the payment is kept, reversed', async () => {
    const sa = await superAdmin();
    const org = (await sa.call('post', '/organisations', orgBody())).body.data;
    const p = (await sa.call('post', '/plans', { ...plan, name: 'Yearly' })).body.data;
    const before = (await sa.call('get', `/organisations/${org.id}/billing`)).body.data.subscription;
    const paid = await sa.call('post', `/organisations/${org.id}/subscription`, { planId: p.id, mode: 'manual', months: 12, amountPaise: 120000, paymentMode: 'bank' });
    expect(paid.status).toBe(200);
    expect(paid.body.data.subscription.status).toBe('active');

    const top = await sa.latest();
    expect(top).toMatchObject({ type: 'platform.subscription', mode: 'reversal', canUndo: true });
    expect((await sa.undo(top.id, 'Payment bounced')).status).toBe(200);
    const after = (await sa.call('get', `/organisations/${org.id}/billing`)).body.data;
    expect(after.subscription).toMatchObject({ status: before.status, planName: before.planName });
    expect(after.payments.find((x) => x.amountPaise === 120000)).toMatchObject({ status: 'reversed' });
    // Not revenue any more.
    expect((await sa.call('get', '/billing/dashboard')).body.data.totals?.revenuePaise ?? 0).toBe(0);
  });
});
