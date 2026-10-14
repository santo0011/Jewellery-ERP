import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { ensureBillingSetup } from '../src/modules/billing/billing.service.js';
import { PlatformAdmin } from '../src/modules/platform/platformAdmin.model.js';
import { api, bearer, registerOrg } from './helpers.js';

async function superAdmin() {
  const email = `sa${Date.now()}${Math.random().toString(36).slice(2, 6)}@platform.local`;
  await PlatformAdmin.create({ name: 'Platform Owner', email, passwordHash: await bcrypt.hash('Admin1234', 4) });
  return (await api().post('/api/v1/auth/login').send({ email, password: 'Admin1234' })).body.data.accessToken;
}

async function org() {
  const owner = await registerOrg();
  const me = (await api().get('/api/v1/auth/me').set(bearer(owner.token))).body.data;
  return { t: owner.token, id: me.organisation.id, name: me.organisation.name };
}

describe('Super Admin reports', () => {
  it('lists the reports and runs each one with numbers that match the payments made', async () => {
    await ensureBillingSetup();
    const sa = await superAdmin();
    const run = (key, query = {}) => api().get(`/api/v1/platform/reports/${key}`).query(query).set(bearer(sa));
    const plan = (await api().post('/api/v1/platform/plans').set(bearer(sa)).send({ name: `Report Plan ${Date.now()}`, pricePaise: 500000, durationMonths: 12, limits: { users: 5, branches: 2, products: null } })).body.data;
    const [paying, trial] = [await org(), await org()];
    await api().post(`/api/v1/platform/organisations/${paying.id}/subscription`).set(bearer(sa)).send({ planId: plan.id, mode: 'manual', months: 12, amountPaise: 500000, paymentMode: 'bank', reference: 'NEFT R1' });
    await api().post(`/api/v1/platform/organisations/${trial.id}/subscription`).set(bearer(sa)).send({ planId: plan.id, mode: 'trial', days: 5 });

    const list = (await api().get('/api/v1/platform/reports').set(bearer(sa))).body.data;
    expect(list.map((r) => r.key)).toEqual(['revenue-register', 'revenue-monthly', 'revenue-by-plan', 'subscription-status', 'renewals', 'signups', 'usage']);

    // Revenue: the ₹5,000 payment is there; the ₹0 trial record is not.
    const register = (await run('revenue-register')).body.data;
    const mine = register.rows.filter((r) => r.organisation === paying.name || r.organisation === trial.name);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ amountPaise: 500000, source: 'Recorded by admin', reference: 'NEFT R1' });
    expect(register.totals.amountPaise).toBe(register.summary[0].value);

    const monthly = (await run('revenue-monthly')).body.data;
    expect(monthly.rows).toHaveLength(12);
    expect(monthly.totals.revenuePaise).toBeGreaterThanOrEqual(500000);

    const byPlan = (await run('revenue-by-plan')).body.data.rows.find((r) => r.plan === plan.name);
    expect(byPlan).toMatchObject({ payments: 1, organisations: 1, revenuePaise: 500000, current: 1 });

    // Subscriptions: one paid, one on trial; the trial ends within 30 days so it is a renewal to chase.
    const status = (await run('subscription-status')).body.data.rows;
    expect(status.find((r) => r.organisation === paying.name)).toMatchObject({ status: 'Active', plan: plan.name, paidPaise: 500000 });
    expect(status.find((r) => r.organisation === trial.name)).toMatchObject({ status: 'Free trial', paidPaise: 0 });
    const onlyTrials = (await run('subscription-status', { status: 'trial' })).body.data.rows;
    expect(onlyTrials.every((r) => r.status === 'Free trial')).toBe(true);
    const renewals = (await run('renewals')).body.data.rows;
    expect(renewals.find((r) => r.organisation === trial.name)).toMatchObject({ when: 'In 5 days' });
    expect(renewals.find((r) => r.organisation === paying.name)).toBeUndefined();

    // Sign-ups and usage include both new organisations.
    const signups = (await run('signups')).body.data.rows;
    expect(signups.find((r) => r.organisation === paying.name)).toMatchObject({ paidPaise: 500000, branches: 1 });
    const usage = (await run('usage')).body.data.rows.find((r) => r.organisation === trial.name);
    expect(usage).toMatchObject({ branches: 1, users: 1, bills: 0 });

    expect((await run('revenue-register', { from: '2026-05-10', to: '2026-05-01' })).status).toBe(400);
    expect((await run('nope')).status).toBe(404);
    // Organisation users cannot open platform reports.
    expect((await api().get('/api/v1/platform/reports').set(bearer(paying.t))).status).toBe(401);
  });
});
