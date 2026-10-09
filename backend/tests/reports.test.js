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

    const cgst = (await run(ctx, 'gst-cgst')).body.data;
    const sgst = (await run(ctx, 'gst-sgst')).body.data;
    expect(cgst.totals.taxablePaise).toBe(quote.totals.taxablePaise);
    expect(cgst.totals.taxPaise + sgst.totals.taxPaise).toBe(quote.totals.gstPaise);

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

describe('GST reports', () => {
  it('splits tax into CGST, SGST and IGST reports, less credit notes', async () => {
    const ctx = await setup();
    const ring = (await api().get('/api/v1/categories').set(bearer(ctx.t))).body.data.find((c) => c.name === 'Ring');
    const piece = async (grossWeightMg) => {
      const p = (await api().post('/api/v1/products').set(bearer(ctx.t)).send({ name: 'Ring', categoryId: ring.id, jewelleryType: 'plain_gold', metal: 'gold', purity: 916, grossWeightMg, wastage: { mode: 'none', value: 0 }, making: { type: 'per_gram', value: 50000 }, huid: `G${Math.random().toString(36).slice(2, 7).toUpperCase()}`, hsnCode: '7113', branchId: ctx.ho })).body.data;
      await api().post('/api/v1/inventory/opening').set(bearer(ctx.t)).send({ branchId: ctx.ho, productIds: [p.id] });
      return p;
    };
    const buyer = async (body) => (await api().post('/api/v1/customers').set(bearer(ctx.t)).send({ mobile: `98${Math.floor(10000000 + Math.random() * 89999999)}`, ...body })).body.data;
    const sell = async (customer, grossWeightMg) => {
      const items = [{ productId: (await piece(grossWeightMg)).id }];
      const q = (await api().post('/api/v1/sales/quote').set(bearer(ctx.t)).send({ branchId: ctx.ho, customerId: customer?.id, items })).body.data;
      const res = await api().post('/api/v1/sales').set(bearer(ctx.t)).send({ branchId: ctx.ho, customerId: customer?.id, items, payments: [{ mode: 'upi', amountPaise: q.totals.grandTotalPaise }] });
      expect(res.status).toBe(201);
      return res.body.data;
    };

    const local = await sell(await buyer({ name: 'Local Buyer', address: { stateCode: '19' } }), 10000);
    const trade = await sell(await buyer({ name: 'Trade Buyer', gstin: '19AABCU9603R1ZM', address: { stateCode: '19' } }), 10000);
    const outside = await sell(await buyer({ name: 'Mumbai Buyer', address: { stateCode: '27' } }), 20000);
    const cancelled = await sell(null, 5000);
    await api().post(`/api/v1/sales/${cancelled.id}/cancel`).set(bearer(ctx.t)).send({ reason: 'Wrong item' });
    expect((await api().post(`/api/v1/sales/${trade.id}/returns`).set(bearer(ctx.t)).send({ productIds: [trade.items[0].productId], refundMode: 'credit', reason: 'Exchange later' })).status).toBe(201);

    const gstKeys = (await api().get('/api/v1/reports').set(bearer(ctx.t))).body.data.filter((r) => r.group === 'GST').map((r) => r.key);
    expect(gstKeys).toEqual(['gst-cgst', 'gst-sgst', 'gst-igst']);

    for (const kind of ['cgst', 'sgst']) {
      const rep = (await run(ctx, `gst-${kind}`)).body.data;
      expect(rep.rows.map((r) => [r.type, r.docNo])).toEqual([
        ['Invoice', local.invoiceNo],
        ['Invoice', trade.invoiceNo],
        ['Credit note', expect.stringMatching(/^CN\//)],
      ]);
      expect(rep.rows[0]).toMatchObject({ rate: '1.5%', taxPaise: local.totals[`${kind}Paise`], gstin: 'Unregistered' });
      expect(rep.rows[1].gstin).toBe('19AABCU9603R1ZM');
      expect(rep.rows[2].taxPaise).toBe(-trade.totals[`${kind}Paise`]);
      expect(rep.totals.taxPaise).toBe(local.totals[`${kind}Paise`]);
      expect(rep.summary.at(-1)).toMatchObject({ label: `Net ${kind.toUpperCase()} payable`, value: local.totals[`${kind}Paise`] });
    }

    const igst = (await run(ctx, 'gst-igst')).body.data;
    expect(igst.rows).toHaveLength(1);
    expect(igst.rows[0]).toMatchObject({ docNo: outside.invoiceNo, pos: '27 - Maharashtra', rate: '3%', taxPaise: outside.totals.gstPaise });
    expect(igst.totals.taxPaise).toBe(outside.totals.igstPaise);
  });
});
