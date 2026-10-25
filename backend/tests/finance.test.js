import { describe, expect, it } from 'vitest';
import { runWithContext } from '../src/core/context/requestContext.js';
import { Account } from '../src/core/ledger/account.model.js';
import { JournalEntry } from '../src/core/ledger/journalEntry.model.js';
import { api, bearer, registerOrg } from './helpers.js';

const todayIso = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => todayIso().slice(0, 7);
const prevMonth = () => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
};

async function setup() {
  const { token: t } = await registerOrg();
  const me = (await api().get('/api/v1/auth/me').set(bearer(t))).body.data;
  const ring = (await api().get('/api/v1/categories').set(bearer(t))).body.data.find((c) => c.name === 'Ring');
  await api().post('/api/v1/rates').set(bearer(t)).send({ rates: [{ metal: 'gold', purity: 916, ratePerGramPaise: 725000 }] });
  const supplier = (await api().post('/api/v1/suppliers').set(bearer(t)).send({ companyName: 'Bullion House', mobile: '9830077777', address: {} })).body.data;
  return { t, orgId: me.organisation.id, ho: me.branches[0].id, ring, supplier };
}

/** Net balance of a system account (debit − credit), optionally only entries from one source. */
const balance = (ctx, key, docType) =>
  runWithContext({ organisationId: ctx.orgId }, async () => {
    const acc = await Account.findOne({ systemKey: key }).lean();
    if (!acc) return 0;
    const entries = await JournalEntry.find({ 'lines.accountId': acc._id, ...(docType && { 'source.docType': docType }) }).lean();
    return entries.flatMap((e) => e.lines).filter((l) => String(l.accountId) === String(acc._id)).reduce((n, l) => n + l.debitPaise - l.creditPaise, 0);
  });

const buyMetal = (ctx, billNo, grossWeightMg, valuePaise) =>
  api()
    .post('/api/v1/purchases')
    .set(bearer(ctx.t))
    .send({ supplierId: ctx.supplier.id, branchId: ctx.ho, billNo, billDate: todayIso(), metalLines: [{ metal: 'gold', purity: 916, kind: 'bullion', grossWeightMg, valuePaise }], gstPaise: 0 });

describe('raw material and finished jewellery', () => {
  it('keeps bought metal out of Products, and turns it into pieces at its average cost plus making', async () => {
    const ctx = await setup();
    // 10 g at ₹6,000 and 10 g at ₹8,000: the pool holds 20 g worth ₹14,000 — ₹700 a gram on average.
    expect((await buyMetal(ctx, 'M-1', 10000, 600000)).status).toBe(201);
    expect((await buyMetal(ctx, 'M-2', 10000, 800000)).status).toBe(201);
    expect((await api().get('/api/v1/products').set(bearer(ctx.t))).body.data).toHaveLength(0); // raw metal is not a product
    let pools = (await api().get(`/api/v1/inventory/summary?branchId=${ctx.ho}`).set(bearer(ctx.t))).body.data.metalPools;
    expect(pools).toMatchObject([{ metal: 'gold', purity: 916, kind: 'bullion', grossMg: 20000, valuePaise: 1400000 }]);

    const item = (await api().post('/api/v1/items').set(bearer(ctx.t)).send({ name: 'Plain Gold Ring', categoryId: ctx.ring.id, jewelleryType: 'plain_gold', metal: 'gold', purity: 916 })).body.data;
    const silverItem = (await api().post('/api/v1/items').set(bearer(ctx.t)).send({ name: 'Silver Toe Ring', categoryId: ctx.ring.id, jewelleryType: 'silver', metal: 'silver', purity: 925 })).body.data;
    const make = (body) => api().post('/api/v1/inventory/production').set(bearer(ctx.t)).send({ branchId: ctx.ho, ...body });
    const metalUsed = [{ metal: 'gold', purity: 916, kind: 'bullion', grossWeightMg: 8000 }];

    // More metal than in stock, a piece of a metal not used, or a making charge with no way paid: refused.
    expect((await make({ metalUsed: [{ ...metalUsed[0], grossWeightMg: 50000 }], pieces: [{ itemId: item.id, grossWeightMg: 8000 }] })).status).toBe(409);
    expect((await make({ metalUsed, pieces: [{ itemId: silverItem.id, grossWeightMg: 8000 }] })).status).toBe(400);
    expect((await make({ metalUsed, pieces: [{ itemId: item.id, grossWeightMg: 8000 }], makingPaise: 40000 })).body.error.details[0].path).toBe('makingMode');
    // Pieces heavier than the metal given: refused.
    const heavy = await make({ metalUsed, pieces: [{ itemId: item.id, grossWeightMg: 5000 }, { itemId: item.id, grossWeightMg: 3001 }] });
    expect(heavy.status).toBe(400);
    expect(heavy.body.error.details[0].path).toBe('pieces');

    // 8 g used (₹5,600 at ₹700/g) + ₹400 making in cash → two rings costing ₹6,000 together, shared by weight.
    const res = await make({ metalUsed, pieces: [{ itemId: item.id, grossWeightMg: 5000 }, { itemId: item.id, grossWeightMg: 3000 }], makingPaise: 40000, makingMode: 'cash' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ productionNo: expect.stringMatching(/^MFG\//), metalValuePaise: 560000, makingPaise: 40000, totalCostPaise: 600000 });
    expect(res.body.data.pieces.map((p) => p.costPaise)).toEqual([375000, 225000]);

    const products = (await api().get('/api/v1/products').set(bearer(ctx.t))).body.data;
    expect(products).toHaveLength(2);
    expect(products.every((p) => p.status === 'in_stock')).toBe(true);
    pools = (await api().get(`/api/v1/inventory/summary?branchId=${ctx.ho}`).set(bearer(ctx.t))).body.data.metalPools;
    expect(pools[0]).toMatchObject({ grossMg: 12000, valuePaise: 840000 });

    // The metal stock's own history shows only metal: bought in, then used.
    const raw = (await api().get('/api/v1/inventory/movements?stock=raw').set(bearer(ctx.t))).body.data;
    expect(raw.map((m) => [m.type, m.direction, m.grossMg]).sort()).toEqual([['production_use', -1, 8000], ['purchase', 1, 10000], ['purchase', 1, 10000]].sort());
    // Books: stock still holds every rupee spent on it (₹14,000 metal + ₹400 making); cash paid the making.
    expect(await balance(ctx, 'inventory')).toBe(1440000);
    expect(await balance(ctx, 'cash', 'production')).toBe(-40000);
  });
});

describe('expenses and profit', () => {
  it('books each expense once, keeps edits and voids in its own month, and works out net profit from the ledger', async () => {
    const ctx = await setup();
    const cats = (await api().get('/api/v1/expenses/categories').set(bearer(ctx.t))).body.data;
    expect(cats.map((c) => c.name)).toEqual(expect.arrayContaining(['Electricity', 'Shop rent', 'Transport', 'Other']));
    expect(cats.some((c) => /salary/i.test(c.name))).toBe(false); // salary comes from Payroll, never entered twice
    const electricity = cats.find((c) => c.name === 'Electricity');
    const rent = cats.find((c) => c.name === 'Shop rent');
    expect((await api().post('/api/v1/expenses/categories').set(bearer(ctx.t)).send({ name: ' electricity ' })).status).toBe(409);
    const own = (await api().post('/api/v1/expenses/categories').set(bearer(ctx.t)).send({ name: 'Security guard' })).body.data;
    expect(own.name).toBe('Security guard');

    const add = (body) => api().post('/api/v1/expenses').set(bearer(ctx.t)).send({ branchId: ctx.ho, date: todayIso(), mode: 'cash', ...body });
    const tomorrow = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    expect((await add({ categoryId: electricity.id, amountPaise: 150000, date: tomorrow })).status).toBe(400);
    const bill = (await add({ categoryId: electricity.id, amountPaise: 150000, note: 'September bill' })).body.data;
    expect(bill).toMatchObject({ expenseNo: expect.stringMatching(/^EXP\//), amountPaise: 150000, category: { name: 'Electricity' }, status: 'active' });
    const wrong = (await add({ categoryId: rent.id, amountPaise: 2000000, mode: 'bank' })).body.data;

    // Corrected to ₹1,200 (reason kept), the rent entry voided: the books hold ₹1,200 of expenses, cash paid ₹1,200.
    expect((await api().put(`/api/v1/expenses/${bill.id}`).set(bearer(ctx.t)).send({ categoryId: electricity.id, date: todayIso(), amountPaise: 150000, mode: 'cash', note: 'September bill', reason: 'Same' })).body.error.code).toBe('NO_CHANGES');
    const edited = await api().put(`/api/v1/expenses/${bill.id}`).set(bearer(ctx.t)).send({ categoryId: electricity.id, date: todayIso(), amountPaise: 120000, mode: 'cash', note: 'September bill', reason: 'Typed wrong' });
    expect(edited.body.data.history.map((h) => h.action)).toEqual(['created', 'edited']);
    expect((await api().post(`/api/v1/expenses/${wrong.id}/void`).set(bearer(ctx.t)).send({ reason: 'Entered twice' })).body.data.status).toBe('void');
    expect((await api().put(`/api/v1/expenses/${wrong.id}`).set(bearer(ctx.t)).send({ categoryId: rent.id, date: todayIso(), amountPaise: 1, mode: 'cash', reason: 'Again' })).status).toBe(409);
    expect(await balance(ctx, 'shop_expenses')).toBe(120000);
    expect(await balance(ctx, 'cash', 'expense')).toBe(-120000);
    const list = (await api().get('/api/v1/expenses').set(bearer(ctx.t))).body;
    expect(list.meta.summary).toMatchObject({ totalPaise: 120000, count: 1 });

    // A sale: ₹ before GST is sales, the piece's cost is cost of goods.
    const p = (
      await api()
        .post('/api/v1/products')
        .set(bearer(ctx.t))
        .send({ name: 'Chain', categoryId: ctx.ring.id, jewelleryType: 'plain_gold', metal: 'gold', purity: 916, grossWeightMg: 10000, wastage: { mode: 'percent', value: 800 }, making: { type: 'per_gram', value: 50000 }, costPricePaise: 6000000, huid: 'FIN123', branchId: ctx.ho })
    ).body.data;
    await api().post('/api/v1/inventory/opening').set(bearer(ctx.t)).send({ branchId: ctx.ho, productIds: [p.id] });
    const quote = (await api().post('/api/v1/sales/quote').set(bearer(ctx.t)).send({ branchId: ctx.ho, items: [{ productId: p.id }] })).body.data;
    expect((await api().post('/api/v1/sales').set(bearer(ctx.t)).send({ branchId: ctx.ho, items: [{ productId: p.id }], payments: [{ mode: 'cash', amountPaise: quote.payablePaise }] })).status).toBe(201);

    const sum = (await api().get(`/api/v1/finance/summary?month=${thisMonth()}`).set(bearer(ctx.t))).body.data;
    const sales = -(await balance(ctx, 'sales'));
    expect(sum.totals).toMatchObject({ salesPaise: sales, cogsPaise: 6000000, grossProfitPaise: sales - 6000000, shopExpensesPaise: 120000, salaryPaise: 0, expensesPaise: 120000 });
    expect(sum.totals.netProfitPaise).toBe(sales - 6000000 - 120000 - sum.totals.otherPaise);
    expect(sum.days.find((d) => d.date === todayIso())).toMatchObject({ salesPaise: sales, expensesPaise: 120000 });
    expect(sum.byCategory).toEqual([{ name: 'Electricity', amountPaise: 120000, count: 1 }]);
    expect(sum.months).toHaveLength(6);
    expect(sum.months.at(-1)).toMatchObject({ month: thisMonth(), salesPaise: sales });
  });

  it('counts salary in the month it is for, from finalised payroll only', async () => {
    const ctx = await setup();
    const month = prevMonth();
    await api().post('/api/v1/hr/employees').set(bearer(ctx.t)).send({ name: 'Asha', mobile: '9876500099', designation: 'Salesman', branchId: ctx.ho, joiningDate: '2025-01-01', basicPaise: 3000000, allowancePaise: 0 });
    const run = (await api().post('/api/v1/hr/payroll').set(bearer(ctx.t)).send({ branchId: ctx.ho, month })).body.data;
    // A draft is not a cost yet.
    expect((await api().get(`/api/v1/finance/summary?month=${month}`).set(bearer(ctx.t))).body.data.totals.salaryPaise).toBe(0);
    expect((await api().post(`/api/v1/hr/payroll/${run.id}/finalise`).set(bearer(ctx.t))).status).toBe(200);
    const last = (await api().get(`/api/v1/finance/summary?month=${month}`).set(bearer(ctx.t))).body.data;
    expect(last.totals.salaryPaise).toBe(3000000);
    expect(last.totals.netProfitPaise).toBe(-3000000);
    // Finalised this month, but it is last month's salary: not counted again now.
    expect((await api().get(`/api/v1/finance/summary?month=${thisMonth()}`).set(bearer(ctx.t))).body.data.totals.salaryPaise).toBe(0);
  });
});
