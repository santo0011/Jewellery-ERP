import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { runWithContext } from '../src/core/context/requestContext.js';
import { roundBill } from '../src/core/pricing/pricingEngine.js';
import { Role } from '../src/modules/roles/role.model.js';
import { User } from '../src/modules/users/user.model.js';
import { api, bearer, registerOrg } from './helpers.js';
import { ledgerNet } from './undoHelpers.js';

/*
 * Round-off on the billing screen: automatic (Tax settings), to a chosen ₹1 / ₹10 / ₹50 / ₹100 (nearest, down,
 * up), manual (+/−), or none — within the round-off limit; rounding lower than automatic needs discount rights.
 * It sits after GST, on the invoice, in the ledger (Round-off account) and in the sales register.
 */

async function setup() {
  const owner = await registerOrg();
  const t = owner.token;
  const me = (await api().get('/api/v1/auth/me').set(bearer(t))).body.data;
  const ho = me.branches[0].id;
  const ring = (await api().get('/api/v1/categories').set(bearer(t))).body.data.find((c) => c.name === 'Ring');
  await api().post('/api/v1/rates').set(bearer(t)).send({ rates: [{ metal: 'gold', purity: 916, ratePerGramPaise: 725050 }] });
  // 10.000 g at ₹7,250.50 + ₹1,234.56 making = ₹73,739.56; + 3% GST (₹2,212.19) = ₹75,951.75 before rounding.
  const p = (
    await api()
      .post('/api/v1/products')
      .set(bearer(t))
      .send({ name: 'Chain', categoryId: ring.id, jewelleryType: 'plain_gold', metal: 'gold', purity: 916, grossWeightMg: 10000, wastage: { mode: 'none', value: 0 }, making: { type: 'fixed', value: 123456 }, costPricePaise: 7000000, huid: `H${Math.random().toString(36).slice(2, 7).toUpperCase()}`, branchId: ho })
  ).body.data;
  await api().post('/api/v1/inventory/opening').set(bearer(t)).send({ branchId: ho, productIds: [p.id] });
  const body = (roundOff) => ({ branchId: ho, items: [{ productId: p.id }], ...(roundOff && { roundOff }) });
  const quote = (roundOff, token = t) => api().post('/api/v1/sales/quote').set(bearer(token)).send(body(roundOff));
  return { t, me, ho, p, body, quote };
}

describe('round-off rules', () => {
  it('rounds to the nearest, down, up, by hand, or not at all', () => {
    expect(roundBill(7595175, 'nearest_rupee')).toBe(7595200);
    expect(roundBill(7595175, 'nearest_rupee', { mode: 'none' })).toBe(7595175);
    expect(roundBill(7595175, 'none', { mode: 'nearest', unitPaise: 1000 })).toBe(7595000);
    expect(roundBill(7595175, 'none', { mode: 'down', unitPaise: 10000 })).toBe(7590000);
    expect(roundBill(7595175, 'none', { mode: 'up', unitPaise: 5000 })).toBe(7600000);
    expect(roundBill(7595175, 'none', { mode: 'manual', adjustmentPaise: -1175 })).toBe(7594000);
  });
});

describe('round-off on a bill', () => {
  it('shows the amount before rounding, the round-off and the final total for each choice', async () => {
    const ctx = await setup();
    const auto = (await ctx.quote()).body.data;
    const before = auto.totals.beforeRoundPaise;
    expect(auto.totals).toMatchObject({ roundOff: { mode: 'auto', setting: 'nearest_rupee' }, grandTotalPaise: Math.round(before / 100) * 100 });
    expect(auto.totals.roundOffPaise).toBe(auto.totals.grandTotalPaise - before);
    expect(auto.roundOffLimitPaise).toBe(10000);

    const up = (await ctx.quote({ mode: 'up', unitPaise: 1000 })).body.data.totals;
    expect(up).toMatchObject({ grandTotalPaise: Math.ceil(before / 1000) * 1000, roundOff: { mode: 'up', unitPaise: 1000 } });
    const manual = (await ctx.quote({ mode: 'manual', adjustmentPaise: 25 })).body.data.totals;
    expect(manual).toMatchObject({ grandTotalPaise: before + 25, roundOffPaise: 25, roundOff: { mode: 'manual' } });
    const none = (await ctx.quote({ mode: 'none' })).body.data.totals;
    expect(none).toMatchObject({ grandTotalPaise: before, roundOffPaise: 0 });
    // GST and taxable value are the same whatever the rounding.
    expect(up.gstPaise).toBe(auto.totals.gstPaise);
    expect(up.taxablePaise).toBe(auto.totals.taxablePaise);
  });

  it('keeps within the limit (Tax settings) and needs discount rights to round lower than automatic', async () => {
    const ctx = await setup();
    const tooMuch = await ctx.quote({ mode: 'manual', adjustmentPaise: -20000 });
    expect(tooMuch.status).toBe(422);
    expect(tooMuch.body.error.code).toBe('ROUND_OFF_LIMIT');
    // The limit can be raised.
    const tax = (await api().get('/api/v1/settings').set(bearer(ctx.t))).body.data.tax;
    expect((await api().put('/api/v1/settings/tax').set(bearer(ctx.t)).send({ ...tax, maxRoundOffPaise: 50000 })).status).toBe(200);
    expect((await ctx.quote({ mode: 'manual', adjustmentPaise: -20000 })).status).toBe(200);

    // A cashier without discount rights may round up, not down.
    const email = `cashier${Date.now()}@abc.local`;
    await runWithContext({ organisationId: ctx.me.organisation.id }, async () => {
      const role = await Role.create({ key: `cashier_${Date.now()}`, name: 'Counter', permissions: ['sales.view', 'sales.create', 'rate.view', 'product.view'] });
      await User.create({ name: 'Counter', email, passwordHash: await bcrypt.hash('Secret123', 4), roleIds: [role._id], branchAccess: { all: true, branchIds: [] } });
    });
    const ct = (await api().post('/api/v1/auth/login').send({ email, password: 'Secret123' })).body.data.accessToken;
    expect((await ctx.quote({ mode: 'up', unitPaise: 1000 }, ct)).status).toBe(200);
    const down = await ctx.quote({ mode: 'down', unitPaise: 1000 }, ct);
    expect(down.status).toBe(403);
    expect(down.body.error.code).toBe('ROUND_OFF_FORBIDDEN');
  });

  it('carries the round-off to the invoice, the ledger and the sales register', async () => {
    const ctx = await setup();
    const q = (await ctx.quote({ mode: 'down', unitPaise: 10000 })).body.data;
    const total = q.totals.grandTotalPaise;
    expect(total % 10000).toBe(0);
    const sale = await api().post('/api/v1/sales').set(bearer(ctx.t)).send({ ...ctx.body({ mode: 'down', unitPaise: 10000 }), payments: [{ mode: 'upi', amountPaise: total }] });
    expect(sale.status).toBe(201);
    expect(sale.body.data.totals).toMatchObject({ grandTotalPaise: total, roundOffPaise: q.totals.roundOffPaise, roundOff: { mode: 'down', unitPaise: 10000 } });

    // Books balance: the rounding is on the Round-off account (a loss here: the bill went down).
    const books = await ledgerNet(ctx, 'sale', sale.body.data.id);
    expect(books.net.round_off).toBe(-q.totals.roundOffPaise);

    const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
    const register = (await api().get(`/api/v1/reports/sales-register?from=${today}&to=${today}`).set(bearer(ctx.t))).body.data;
    const row = register.rows.find((r) => r.invoiceNo === sale.body.data.invoiceNo);
    expect(row.taxablePaise + row.gstPaise + row.roundOffPaise).toBe(row.totalPaise);
  });
});
