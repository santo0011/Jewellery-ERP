import { createHmac } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Plan, SubscriptionPayment } from '../src/modules/billing/billing.models.js';
import { ensureBillingSetup } from '../src/modules/billing/billing.service.js';
import { Subscription } from '../src/modules/organisations/subscription.model.js';
import { PlatformAdmin } from '../src/modules/platform/platformAdmin.model.js';
import { api, bearer, registerOrg } from './helpers.js';

const SKIP = { skipTenant: true };

async function superAdmin() {
  const email = `sa${Date.now()}${Math.random().toString(36).slice(2, 6)}@platform.local`;
  await PlatformAdmin.create({ name: 'Platform Owner', email, passwordHash: await bcrypt.hash('Admin1234', 4) });
  return (await api().post('/api/v1/auth/login').send({ email, password: 'Admin1234' })).body.data.accessToken;
}

async function org() {
  const owner = await registerOrg();
  const me = (await api().get('/api/v1/auth/me').set(bearer(owner.token))).body.data;
  return { t: owner.token, id: me.organisation.id };
}

/** Pretends to be Cashfree: creates orders, then reports them as `status`. Only gateway calls are faked. */
function fakeCashfree(status = 'PAID') {
  const calls = [];
  const realFetch = globalThis.fetch;
  vi.stubGlobal('fetch', async (url, init) => {
    if (!String(url).includes('cashfree.com')) return realFetch(url, init);
    calls.push({ url: String(url), method: init?.method, body: init?.body ? JSON.parse(init.body) : null });
    const json = (data) => ({ ok: true, status: 200, json: async () => data });
    if (String(url).endsWith('/orders/sessions')) {
      const channel = calls.at(-1).body.payment_method.upi.channel;
      return json({ channel, data: { payload: channel === 'qrcode' ? { qrcode: 'data:image/png;base64,QR' } : channel === 'link' ? { phonepe: 'phonepe://pay', gpay: 'tez://pay', paytm: 'paytmmp://pay', bhim: 'upi://pay', default: 'upi://pay' } : null } });
    }
    if (init?.method === 'POST') return json({ cf_order_id: 'cf_1', payment_session_id: 'session_test_123', order_status: 'ACTIVE' });
    if (String(url).endsWith('/payments')) return json(status === 'PAID' ? [{ payment_status: 'SUCCESS', cf_payment_id: 98765, payment_group: 'upi' }] : [{ payment_status: 'FAILED', payment_message: 'Declined by bank', payment_group: 'upi', payment_time: new Date().toISOString() }]);
    return json({ order_status: status });
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('subscriptions & billing', () => {
  it('Super Admin creates a plan and puts an organisation on trial, a manual payment and an extension', async () => {
    await ensureBillingSetup();
    const sa = await superAdmin();
    const o = await org();
    const plans = (await api().get('/api/v1/platform/plans').set(bearer(sa))).body.data;
    expect(plans.length).toBeGreaterThanOrEqual(3);

    const created = await api()
      .post('/api/v1/platform/plans')
      .set(bearer(sa))
      .send({ name: 'Gold Yearly', pricePaise: 999900, durationMonths: 12, limits: { users: 10, branches: 3, products: null }, features: ['All modules'] });
    expect(created.status).toBe(201);
    const plan = created.body.data;
    expect(plan).toMatchObject({ code: 'gold-yearly', monthlyPaise: 83325 });

    const assign = (body) => api().post(`/api/v1/platform/organisations/${o.id}/subscription`).set(bearer(sa)).send({ planId: plan.id, ...body });
    const trial = (await assign({ mode: 'trial', days: 7 })).body.data;
    expect(trial.subscription).toMatchObject({ planName: 'Gold Yearly', status: 'trial', daysLeft: 7, limits: { users: 10, branches: 3, products: null } });

    const paid = (await assign({ mode: 'manual', months: 12, amountPaise: 999900, paymentMode: 'bank', reference: 'NEFT 1' })).body.data;
    expect(paid.subscription).toMatchObject({ status: 'active', expired: false });
    expect(paid.subscription.daysLeft).toBeGreaterThan(360);
    expect(paid.payments[0]).toMatchObject({ status: 'paid', source: 'manual', amountPaise: 999900, paymentMethod: 'bank' });

    const before = new Date(paid.subscription.currentPeriodEnd).getTime();
    const extended = (await assign({ mode: 'extend', days: 10 })).body.data;
    expect(new Date(extended.subscription.currentPeriodEnd).getTime() - before).toBe(10 * 86400000);

    const dash = (await api().get('/api/v1/platform/billing/dashboard').set(bearer(sa))).body.data;
    expect(dash.revenue.totalPaise).toBeGreaterThanOrEqual(999900);
    const payments = (await api().get('/api/v1/platform/payments?source=manual').set(bearer(sa))).body.data;
    expect(payments.some((p) => String(p.organisation.id) === String(o.id))).toBe(true);
  });

  it('blocks an expired organisation except billing, and online payment through Cashfree renews it', async () => {
    await ensureBillingSetup();
    const o = await org();
    await Subscription.updateOne({ organisationId: o.id }, { $set: { trialEndsAt: new Date(Date.now() - 86400000) } }).setOptions(SKIP);

    const blocked = await api().get('/api/v1/customers').set(bearer(o.t));
    expect(blocked.status).toBe(402);
    expect(blocked.body.error.code).toBe('SUBSCRIPTION_EXPIRED');
    expect((await api().get('/api/v1/auth/me').set(bearer(o.t))).body.data.subscription).toMatchObject({ expired: true, status: 'expired' });

    const billing = (await api().get('/api/v1/billing').set(bearer(o.t))).body.data;
    expect(billing.subscription.expired).toBe(true);
    const plan = billing.plans.find((p) => p.pricePaise > 0);

    const calls = fakeCashfree('PAID');
    const checkout = (await api().post('/api/v1/billing/checkout').set(bearer(o.t)).send({ planId: plan.id })).body.data;
    expect(checkout).toMatchObject({ paymentSessionId: 'session_test_123', mode: 'sandbox', amountPaise: plan.pricePaise });
    expect(calls[0].body).toMatchObject({ order_id: checkout.orderId, order_amount: plan.pricePaise / 100, order_currency: 'INR' });

    const verified = (await api().post(`/api/v1/billing/payments/${checkout.orderId}/verify`).set(bearer(o.t))).body.data;
    expect(verified).toMatchObject({ status: 'paid', paymentMethod: 'upi', reference: '98765' });
    // Settles once, however often it is checked.
    await api().post(`/api/v1/billing/payments/${checkout.orderId}/verify`).set(bearer(o.t));
    expect(await SubscriptionPayment.countDocuments({ orderId: checkout.orderId, status: 'paid' })).toBe(1);

    expect((await api().get('/api/v1/customers').set(bearer(o.t))).status).toBe(200);
    const me = (await api().get('/api/v1/auth/me').set(bearer(o.t))).body.data.subscription;
    expect(me).toMatchObject({ status: 'active', expired: false, planName: plan.name });
  });

  it('accepts a signed Cashfree webhook and ignores a forged one', async () => {
    await ensureBillingSetup();
    const o = await org();
    fakeCashfree('PAID');
    const plan = await Plan.findOne({ pricePaise: { $gt: 0 } }).lean();
    const { orderId } = (await api().post('/api/v1/billing/checkout').set(bearer(o.t)).send({ planId: String(plan._id) })).body.data;

    const body = JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK', data: { order: { order_id: orderId } } });
    const ts = String(Date.now());
    const forged = await api().post('/api/v1/billing/cashfree/webhook').set('Content-Type', 'application/json').set('x-webhook-timestamp', ts).set('x-webhook-signature', 'bad').send(body);
    expect(forged.status).toBe(401);
    const signature = createHmac('sha256', 'test-cashfree-secret').update(ts + body).digest('base64');
    const ok = await api().post('/api/v1/billing/cashfree/webhook').set('Content-Type', 'application/json').set('x-webhook-timestamp', ts).set('x-webhook-signature', signature).send(body);
    expect(ok.status).toBe(200);
    expect((await SubscriptionPayment.findOne({ orderId }).lean()).status).toBe('paid');
  });

  it('pays a UPI checkout inside the app: QR for laptops, app links for phones, a request to a UPI ID', async () => {
    await ensureBillingSetup();
    const o = await org();
    const calls = fakeCashfree('ACTIVE');
    const plan = await Plan.findOne({ pricePaise: { $gt: 0 } }).lean();
    const { orderId } = (await api().post('/api/v1/billing/checkout').set(bearer(o.t)).send({ planId: String(plan._id), methods: 'upi' })).body.data;
    expect(calls[0].body.order_meta).toMatchObject({ payment_methods: 'upi' });

    const upi = (body) => api().post(`/api/v1/billing/payments/${orderId}/upi`).set(bearer(o.t)).send(body);
    expect((await upi({ method: 'qr' })).body.data).toEqual({ method: 'qr', qrcode: 'data:image/png;base64,QR' });
    expect(calls.at(-1).body).toMatchObject({ payment_session_id: 'session_test_123', payment_method: { upi: { channel: 'qrcode' } } });
    expect((await upi({ method: 'apps' })).body.data.links).toMatchObject({ phonepe: 'phonepe://pay', gpay: 'tez://pay', paytm: 'paytmmp://pay', bhim: 'upi://pay' });
    expect((await upi({ method: 'upi_id' })).status).toBe(400);
    expect((await upi({ method: 'upi_id', upiId: 'Rakesh@OkHDFCbank' })).body.data).toEqual({ method: 'upi_id', sentTo: 'rakesh@okhdfcbank' });
    expect(calls.at(-1).body.payment_method).toEqual({ upi: { channel: 'collect', upi_id: 'rakesh@okhdfcbank' } });

    // Still unpaid: the screen learns the last try failed.
    const check = (await api().post(`/api/v1/billing/payments/${orderId}/verify`).set(bearer(o.t))).body.data;
    expect(check).toMatchObject({ status: 'created', attempt: { status: 'FAILED', message: 'Declined by bank' } });
  });

  it('restricts the Cashfree page to the chosen kind of method', async () => {
    await ensureBillingSetup();
    const o = await org();
    const calls = fakeCashfree('ACTIVE');
    const plan = await Plan.findOne({ pricePaise: { $gt: 0 } }).lean();
    for (const [methods, code] of [['cards', 'cc,dc'], ['netbanking', 'nb'], ['wallets', 'app'], ['paylater', 'paylater,emi,cardlessemi']]) {
      await api().post('/api/v1/billing/checkout').set(bearer(o.t)).send({ planId: String(plan._id), methods });
      expect(calls.at(-1).body.order_meta.payment_methods).toBe(code);
    }
    await api().post('/api/v1/billing/checkout').set(bearer(o.t)).send({ planId: String(plan._id) });
    expect(calls.at(-1).body.order_meta.payment_methods).toBeUndefined();
  });

  it('deletes a plan nobody has taken, and refuses once an organisation is on it', async () => {
    await ensureBillingSetup();
    const sa = await superAdmin();
    const make = async (name) => (await api().post('/api/v1/platform/plans').set(bearer(sa)).send({ name, pricePaise: 50000, durationMonths: 1, limits: { users: 2, branches: 1, products: null } })).body.data;
    const spare = await make(`Spare ${Date.now()}`);
    expect(spare.trialDays).toBeUndefined();
    const listed = (await api().get('/api/v1/platform/plans').set(bearer(sa))).body.data.find((p) => p.id === spare.id);
    expect(listed.canDelete).toBe(true);
    expect((await api().delete(`/api/v1/platform/plans/${spare.id}`).set(bearer(sa))).status).toBe(200);
    expect(await Plan.findById(spare.id)).toBeNull();

    const taken = await make(`Taken ${Date.now()}`);
    const o = await org();
    await api().post(`/api/v1/platform/organisations/${o.id}/subscription`).set(bearer(sa)).send({ planId: taken.id, mode: 'trial', days: 5 });
    expect((await api().get('/api/v1/platform/plans').set(bearer(sa))).body.data.find((p) => p.id === taken.id).canDelete).toBe(false);
    const refused = await api().delete(`/api/v1/platform/plans/${taken.id}`).set(bearer(sa));
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('PLAN_IN_USE');
  });
});
