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

    const res = await api().get(`/api/v1/dashboard?branchId=${ctx.ho}&days=7`).set(bearer(ctx.t));
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d.range.days).toBe(7);
    expect(d.sales.today).toMatchObject({ bills: 1, revenuePaise: quote.totals.grandTotalPaise, collectedPaise: quote.totals.grandTotalPaise });
    expect(d.sales.daily).toHaveLength(7);
    expect(d.sales.daily.at(-1)).toMatchObject({ bills: 1, totalPaise: quote.totals.grandTotalPaise });
    expect(d.sales.byPaymentMode.map((m) => m.key).sort()).toEqual(['cash', 'upi']);
    expect(d.sales.byCategory[0]).toMatchObject({ label: 'Ring', extra: 1 });
    expect(d.orders).toMatchObject({ open: 1, urgent: 1, advanceHeldPaise: 500000, bookedInPeriod: 1 });
    expect(d.stock).toMatchObject({ items: 1, grossWeightMg: 4000 });

    expect((await api().get(`/api/v1/dashboard?branchId=${ctx.ho}&days=12`).set(bearer(ctx.t))).status).toBe(400);
  });

  it('hides the sections a user may not see', async () => {
    const ctx = await setup();
    const email = `dash${Date.now()}@abc.local`;
    await runWithContext({ organisationId: ctx.orgId }, async () => {
      const role = await Role.create({ key: `d${Date.now()}`, name: 'Orders only', permissions: ['order.view'] });
      await User.create({ name: 'Order Desk', email, passwordHash: await bcrypt.hash('Secret123', 4), roleIds: [role._id], branchAccess: { all: true, branchIds: [] } });
    });
    const token = (await api().post('/api/v1/auth/login').send({ email, password: 'Secret123' })).body.data.accessToken;
    const d = (await api().get(`/api/v1/dashboard?branchId=${ctx.ho}`).set(bearer(token))).body.data;
    expect(d.sales).toBeNull();
    expect(d.stock).toBeNull();
    expect(d.orders).toMatchObject({ open: 0 });
  });
});
