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
  const ho = me.branches[0].id;
  const ring = (await api().get('/api/v1/categories').set(bearer(t))).body.data.find((c) => c.name === 'Ring');
  await api().post('/api/v1/rates').set(bearer(t)).send({ rates: [{ metal: 'gold', purity: 916, ratePerGramPaise: 725000 }] });
  const product = async () => {
    const p = (
      await api()
        .post('/api/v1/products')
        .set(bearer(t))
        .send({ name: 'Ring', categoryId: ring.id, jewelleryType: 'plain_gold', metal: 'gold', purity: 916, grossWeightMg: 10000, wastage: { mode: 'none', value: 0 }, making: { type: 'per_gram', value: 50000 }, costPricePaise: 6000000, huid: `R${Math.random().toString(36).slice(2, 7).toUpperCase()}`, hsnCode: '7113', branchId: ho })
    ).body.data;
    await api().post('/api/v1/inventory/opening').set(bearer(t)).send({ branchId: ho, productIds: [p.id] });
    return p;
  };
  return { t, orgId: me.organisation.id, ho, product };
}

const run = (ctx, key, query = '') => api().get(`/api/v1/reports/${key}${query}`).set(bearer(ctx.t));

describe('reports', () => {
  it('runs every report with real figures', async () => {
    const ctx = await setup();
    const sold = await ctx.product();
    await ctx.product();
    const customer = (await api().post('/api/v1/customers').set(bearer(ctx.t)).send({ name: 'Report Buyer', mobile: '9830011122', address: { stateCode: '19' }, openingBalancePaise: 20000 })).body.data;
    const quote = (await api().post('/api/v1/sales/quote').set(bearer(ctx.t)).send({ branchId: ctx.ho, customerId: customer.id, items: [{ productId: sold.id }] })).body.data;
    const total = quote.totals.grandTotalPaise;
    await api()
      .post('/api/v1/sales')
      .set(bearer(ctx.t))
      .send({ branchId: ctx.ho, customerId: customer.id, items: [{ productId: sold.id }], payments: [{ mode: 'cash', amountPaise: total - 100000 }, { mode: 'credit', amountPaise: 100000 }] });

    const list = (await api().get('/api/v1/reports').set(bearer(ctx.t))).body.data;
    expect(list.length).toBeGreaterThanOrEqual(20);

    for (const r of list) {
      const res = await run(ctx, r.key);
      expect(res.status, r.key).toBe(200);
      expect(Array.isArray(res.body.data.columns), r.key).toBe(true);
      expect(Array.isArray(res.body.data.rows), r.key).toBe(true);
    }

    const register = (await run(ctx, 'sales-register')).body.data;
    expect(register.rows).toHaveLength(1);
    expect(register.totals).toMatchObject({ totalPaise: total, duePaise: 100000, receivedPaise: total - 100000 });

    const gst = (await run(ctx, 'gst-hsn')).body.data;
    expect(gst.rows[0]).toMatchObject({ hsn: '7113', taxablePaise: quote.totals.taxablePaise, taxPaise: quote.totals.gstPaise });
    expect(gst.totals.cgstPaise + gst.totals.sgstPaise).toBe(quote.totals.gstPaise);

    const profit = (await run(ctx, 'profit')).body.data;
    expect(profit.totals).toMatchObject({ costPaise: 6000000, profitPaise: quote.totals.taxablePaise - 6000000 });

    const owing = (await run(ctx, 'customer-outstanding')).body.data;
    expect(owing.rows[0]).toMatchObject({ customer: 'Report Buyer', creditPaise: 100000, oldDuePaise: 20000, duePaise: 120000 });

    const stock = (await run(ctx, 'stock-summary')).body.data;
    expect(stock.totals).toMatchObject({ items: 1, grossMg: 10000 });

    const pay = (await run(ctx, 'sales-payment')).body.data;
    expect(pay.rows.map((r) => r.mode).sort()).toEqual(['Cash', 'On credit (due)']);

    const tb = (await run(ctx, 'trial-balance')).body.data;
    expect(tb.totals.debitPaise).toBe(tb.totals.creditPaise);
    expect(tb.totals.debitPaise).toBeGreaterThan(0);

    const cash = (await run(ctx, 'cash-book', '?account=cash')).body.data;
    expect(cash.totals.inPaise).toBe(total - 100000);

    expect((await run(ctx, 'sales-register', '?from=2026-05-10&to=2026-05-01')).status).toBe(400);
    expect((await run(ctx, 'no-such-report')).status).toBe(404);
  });

  it('shows only the reports a role may run', async () => {
    const ctx = await setup();
    const email = `rep${Date.now()}@abc.local`;
    await runWithContext({ organisationId: ctx.orgId }, async () => {
      const role = await Role.create({ key: `r${Date.now()}`, name: 'Sales reports', permissions: ['report.sales'] });
      await User.create({ name: 'Report Viewer', email, passwordHash: await bcrypt.hash('Secret123', 4), roleIds: [role._id], branchAccess: { all: true, branchIds: [] } });
    });
    const token = (await api().post('/api/v1/auth/login').send({ email, password: 'Secret123' })).body.data.accessToken;
    const keys = (await api().get('/api/v1/reports').set(bearer(token))).body.data.map((r) => r.key);
    expect(keys).toContain('sales-register');
    expect(keys).not.toContain('trial-balance');
    expect(keys).not.toContain('salary-register');
    expect(keys).not.toContain('orders-open');
    expect((await api().get('/api/v1/reports/trial-balance').set(bearer(token))).status).toBe(403);
  });
});
