import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { runWithContext } from '../src/core/context/requestContext.js';
import { Role } from '../src/modules/roles/role.model.js';
import { User } from '../src/modules/users/user.model.js';
import { api, bearer, registerOrg } from './helpers.js';

async function setup() {
  const owner = await registerOrg();
  const t = owner.token;
  const me = (await api().get('/api/v1/auth/me').set(bearer(t))).body.data;
  const ring = (await api().get('/api/v1/categories').set(bearer(t))).body.data.find((c) => c.name === 'Ring');
  await api().post('/api/v1/rates').set(bearer(t)).send({ rates: [{ metal: 'gold', purity: 916, ratePerGramPaise: 725000 }] });
  const stocked = async (grossWeightMg) => {
    const p = (
      await api()
        .post('/api/v1/products')
        .set(bearer(t))
        .send({ name: 'Ring', categoryId: ring.id, jewelleryType: 'plain_gold', metal: 'gold', purity: 916, grossWeightMg, wastage: { mode: 'none', value: 0 }, making: { type: 'per_gram', value: 50000 }, huid: `D${Math.random().toString(36).slice(2, 7).toUpperCase()}`, branchId: me.branches[0].id })
    ).body.data;
    await api().post('/api/v1/inventory/opening').set(bearer(t)).send({ branchId: me.branches[0].id, productIds: [p.id] });
    return p;
  };
  return { t, orgId: me.organisation.id, ho: me.branches[0].id, stocked };
}

describe('branch dashboard', () => {
  it('summarises sales, payments, orders and stock for the branch and period', async () => {
    const ctx = await setup();
    const sold = await ctx.stocked(10000);
    await ctx.stocked(4000);
    const quote = (await api().post('/api/v1/sales/quote').set(bearer(ctx.t)).send({ branchId: ctx.ho, items: [{ productId: sold.id }] })).body.data;
    await api()
      .post('/api/v1/sales')
      .set(bearer(ctx.t))
      .send({ branchId: ctx.ho, items: [{ productId: sold.id }], payments: [{ mode: 'cash', amountPaise: 100000 }, { mode: 'upi', amountPaise: quote.totals.grandTotalPaise - 100000 }] });
    const customer = (await api().post('/api/v1/customers').set(bearer(ctx.t)).send({ name: 'Dash Buyer', mobile: '9830098300', address: { stateCode: '19' } })).body.data;
    await api().post('/api/v1/orders').set(bearer(ctx.t)).send({ branchId: ctx.ho, customerId: customer.id, priority: 'urgent', items: [{ description: 'Chain', metal: 'gold', purity: 916 }], advance: { mode: 'cash', amountPaise: 500000 } });

    const res = await api().get(`/api/v1/dashboard?branchId=${ctx.ho}&period=month`).set(bearer(ctx.t));
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.range).toMatchObject({ period: 'month', from: `${d.range.to.slice(0, 7)}-01` });
    // Collected today: the bill's payments and the order advance.
    expect(d.sales.today).toMatchObject({ bills: 1, revenuePaise: quote.totals.grandTotalPaise, collectedPaise: quote.totals.grandTotalPaise + 500000 });
    expect(d.sales.today.collectedBreakdown).toEqual({ bills: quote.totals.grandTotalPaise, orderAdvances: 500000, dueCollections: 0, customerAdvances: 0 });
    expect(d.sales.daily).toHaveLength(d.range.span);
    expect(d.sales.daily.at(-1)).toMatchObject({ bills: 1, totalPaise: quote.totals.grandTotalPaise });
    expect(d.sales.byPaymentMode.map((m) => m.key).sort()).toEqual(['cash', 'upi']);
    expect(d.sales.byCategory[0]).toMatchObject({ label: 'Ring', extra: 1 });
    expect(d.orders).toMatchObject({ open: 1, urgent: 1, advanceHeldPaise: 500000, bookedInPeriod: 1 });
    expect(d.stock).toMatchObject({ items: 1, grossWeightMg: 4000 });

    expect((await api().get(`/api/v1/dashboard?branchId=${ctx.ho}&period=year`).set(bearer(ctx.t))).status).toBe(400);

    const today = (await api().get(`/api/v1/dashboard?branchId=${ctx.ho}&period=today`).set(bearer(ctx.t))).body.data;
    expect(today.range).toMatchObject({ period: 'today', span: 1 });
    expect(today.sales.period.bills).toBe(1);
    expect(today.sales.period.collectedPaise).toBe(quote.totals.grandTotalPaise + 500000);
    expect(today.sales.period).toMatchObject({ creditDuePaise: 0, dueBills: 0 });

    // All time (the default): from the branch's first bill — here today — to today.
    const all = (await api().get(`/api/v1/dashboard?branchId=${ctx.ho}`).set(bearer(ctx.t))).body.data;
    expect(all.range).toMatchObject({ period: 'all', span: 1, bucket: 'day', from: all.range.to });
    expect(all.sales.period.bills).toBe(1);
  });

  it('collects every payment received today once: bills, order advances, dues and customer advances', async () => {
    const ctx = await setup();
    const dash = async () => (await api().get(`/api/v1/dashboard?branchId=${ctx.ho}&period=today`).set(bearer(ctx.t))).body.data.sales;

    // Advance paid when the customer is added: a receipt, counted. An old balance (no payment) is not.
    const paidAdvance = (
      await api()
        .post('/api/v1/customers')
        .set(bearer(ctx.t))
        .send({ name: 'Advance Payer', mobile: '9830011111', address: { stateCode: '19' }, openingBalancePaise: -300000, advancePayment: { branchId: ctx.ho, mode: 'upi', reference: 'UPI1' } })
    ).body.data;
    await api().post('/api/v1/customers').set(bearer(ctx.t)).send({ name: 'Old Advance', mobile: '9830022222', address: { stateCode: '19' }, openingBalancePaise: -700000 });
    let s = await dash();
    expect(s.today.collectedBreakdown).toEqual({ bills: 0, orderAdvances: 0, dueCollections: 0, customerAdvances: 300000 });

    // Raising the advance on edit counts only the extra amount; it cannot go below what was received as payment.
    const edit = (body) => api().put(`/api/v1/customers/${paidAdvance.id}`).set(bearer(ctx.t)).send({ name: 'Advance Payer', mobile: '9830011111', address: { stateCode: '19' }, ...body });
    expect((await edit({ openingBalancePaise: -400000, advancePayment: { branchId: ctx.ho, mode: 'cash' } })).status).toBe(200);
    expect((await edit({ openingBalancePaise: -100000 })).status).toBe(422);
    s = await dash();
    expect(s.today.collectedBreakdown.customerAdvances).toBe(400000);

    // Order: advance at booking and a part payment later are counted; the advance used on the bill is not counted again.
    const buyer = (await api().post('/api/v1/customers').set(bearer(ctx.t)).send({ name: 'Order Buyer', mobile: '9830033333', address: { stateCode: '19' } })).body.data;
    const order = (
      await api()
        .post('/api/v1/orders')
        .set(bearer(ctx.t))
        .send({ branchId: ctx.ho, customerId: buyer.id, items: [{ description: 'Ring', metal: 'gold', purity: 916 }], advance: { mode: 'cash', amountPaise: 200000 } })
    ).body.data;
    expect((await api().post(`/api/v1/orders/${order.id}/advances`).set(bearer(ctx.t)).send({ mode: 'card', amountPaise: 100000 })).status).toBe(201);

    // A bill on part credit, and the due collected later the same day.
    const item = await ctx.stocked(5000);
    const quote = (await api().post('/api/v1/sales/quote').set(bearer(ctx.t)).send({ branchId: ctx.ho, customerId: buyer.id, items: [{ productId: item.id }] })).body.data;
    const sale = await api()
      .post('/api/v1/sales')
      .set(bearer(ctx.t))
      .send({ branchId: ctx.ho, customerId: buyer.id, items: [{ productId: item.id }], payments: [{ mode: 'cash', amountPaise: 50000 }, { mode: 'credit', amountPaise: quote.payablePaise - 50000 }] });
    expect(sale.status).toBe(201);
    expect((await api().post(`/api/v1/customers/${buyer.id}/payments`).set(bearer(ctx.t)).send({ branchId: ctx.ho, mode: 'upi', amountPaise: 20000 })).status).toBe(201);

    s = await dash();
    expect(s.today.collectedBreakdown).toEqual({ bills: 50000, orderAdvances: 300000, dueCollections: 20000, customerAdvances: 400000 });
    expect(s.today.collectedPaise).toBe(770000);
    expect(s.period.collectedPaise).toBe(770000);
    // Payment mix: the same money by mode, plus what the bill left on credit; no separate "order advance" row.
    const mix = Object.fromEntries(s.byPaymentMode.map((m) => [m.key, m.value]));
    expect(mix).toEqual({ cash: 50000 + 100000 + 200000, upi: 300000 + 20000, card: 100000, credit: quote.payablePaise - 50000 });
  });

  it('hides the sections a user may not see', async () => {
    const ctx = await setup();
    const signIn = async (name, permissions) => {
      const email = `dash${Date.now()}${Math.random().toString(36).slice(2, 6)}@abc.local`;
      await runWithContext({ organisationId: ctx.orgId }, async () => {
        const role = await Role.create({ key: `d${Date.now()}${Math.random().toString(36).slice(2, 6)}`, name, permissions });
        await User.create({ name, email, passwordHash: await bcrypt.hash('Secret123', 4), roleIds: [role._id], branchAccess: { all: true, branchIds: [] } });
      });
      return (await api().post('/api/v1/auth/login').send({ email, password: 'Secret123' })).body.data.accessToken;
    };

    // No Dashboard → View: no dashboard at all.
    const noDashboard = await signIn('Orders only', ['order.view']);
    expect((await api().get(`/api/v1/dashboard?branchId=${ctx.ho}`).set(bearer(noDashboard))).status).toBe(403);

    const orders = await signIn('Order desk', ['dashboard.view', 'order.view']);
    const d = (await api().get(`/api/v1/dashboard?branchId=${ctx.ho}`).set(bearer(orders))).body.data;
    expect(d.sales).toBeNull();
    expect(d.stock).toBeNull();
    expect(d.orders).toMatchObject({ open: 0 });

    // Sales without View financial figures: the money stays hidden.
    const counter = await signIn('Counter', ['dashboard.view', 'sales.view']);
    expect((await api().get(`/api/v1/dashboard?branchId=${ctx.ho}`).set(bearer(counter))).body.data.sales).toBeNull();
    const manager = await signIn('Manager', ['dashboard.view', 'dashboard.viewFinancials', 'sales.view']);
    expect((await api().get(`/api/v1/dashboard?branchId=${ctx.ho}`).set(bearer(manager))).body.data.sales).not.toBeNull();
  });
});
