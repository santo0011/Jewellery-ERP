import { describe, expect, it } from 'vitest';
import { api, bearer, registerOrg } from './helpers.js';

async function setup() {
  const owner = await registerOrg();
  const t = owner.token;
  const me = (await api().get('/api/v1/auth/me').set(bearer(t))).body.data;
  const ho = me.branches[0].id;
  const check = (type, id) => api().get(`/api/v1/records/${type}/${id}/delete-check`).set(bearer(t));
  const del = (type, id) => api().delete(`/api/v1/records/${type}/${id}`).set(bearer(t));
  return { t, me, ho, check, del };
}

const idOf = (x) => x.id ?? x._id;

describe('deleting records nothing else uses', () => {
  it('deletes an unused employee, and refuses once attendance is marked', async () => {
    const ctx = await setup();
    const hire = async (name) =>
      (await api().post('/api/v1/hr/employees').set(bearer(ctx.t)).send({ name, mobile: `97${Math.floor(10000000 + Math.random() * 89999999)}`, designation: 'Salesman', branchId: ctx.ho, joiningDate: '2025-01-01', basicPaise: 1000000, allowancePaise: 0 })).body.data;
    const unused = await hire('New Joiner');
    expect((await ctx.check('employee', unused.id)).body.data).toMatchObject({ deletable: true, usedBy: [] });
    expect((await ctx.del('employee', unused.id)).status).toBe(200);
    expect((await api().get(`/api/v1/hr/employees/${unused.id}`).set(bearer(ctx.t))).status).toBe(404);

    const marked = await hire('Marked Staff');
    const today = ctx.me.today ?? new Date().toISOString().slice(0, 10);
    await api().put('/api/v1/hr/attendance').set(bearer(ctx.t)).send({ branchId: ctx.ho, date: today, entries: [{ employeeId: marked.id, status: 'present' }] });
    const blocked = (await ctx.check('employee', marked.id)).body.data;
    expect(blocked).toMatchObject({ deletable: false, usedBy: [{ model: 'Attendance', count: 1, label: '1 attendance mark' }] });
    expect(blocked.message).toContain('Mark the employee as left instead');
    const refused = await ctx.del('employee', marked.id);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe('IN_USE');
    expect((await ctx.del('branch', ctx.ho)).body.error.code).toBe('NOT_DELETABLE');
  });

  it('deletes a customer with no invoices or orders, and refuses one with an order', async () => {
    const ctx = await setup();
    const add = async (name, mobile) => (await api().post('/api/v1/customers').set(bearer(ctx.t)).send({ name, mobile, address: { stateCode: '19' } })).body.data;
    const quiet = await add('Quiet Buyer', '9830011101');
    expect((await ctx.del('customer', quiet.id)).status).toBe(200);
    expect((await api().get(`/api/v1/customers/${quiet.id}`).set(bearer(ctx.t))).status).toBe(404);

    const buyer = await add('Order Buyer', '9830011102');
    const order = (await api().post('/api/v1/orders').set(bearer(ctx.t)).send({ branchId: ctx.ho, customerId: buyer.id, items: [{ description: 'Chain', metal: 'gold', purity: 916 }] })).body.data;
    expect((await ctx.check('customer', buyer.id)).body.data).toMatchObject({ deletable: false, usedBy: [expect.objectContaining({ model: 'Order', count: 1 })] });
    // The order itself has no advance and nothing made from it, so it can go — then the customer can too.
    expect((await ctx.del('order', order.id)).status).toBe(200);
    expect((await ctx.check('customer', buyer.id)).body.data.deletable).toBe(true);
    // The old customer route follows the same rule.
    expect((await api().delete(`/api/v1/customers/${buyer.id}`).set(bearer(ctx.t))).status).toBe(200);
  });

  it('guards branches, users, roles and categories by their own rules too', async () => {
    const ctx = await setup();
    expect((await ctx.check('branch', ctx.ho)).body.data).toMatchObject({ deletable: false, message: 'The head office cannot be deleted.' });
    const b2 = (await api().post('/api/v1/branches').set(bearer(ctx.t)).send({ code: 'B2', name: 'Salt Lake', address: {} })).body.data;
    expect((await ctx.del('branch', idOf(b2))).status).toBe(200);

    expect((await ctx.check('user', ctx.me.user.id)).body.data).toMatchObject({ deletable: false, message: 'The organisation owner cannot be deleted.' });
    const role = (await api().get('/api/v1/roles').set(bearer(ctx.t))).body.data.find((r) => r.key === 'sales_staff');
    const user = (await api().post('/api/v1/users').set(bearer(ctx.t)).send({ name: 'Temp Login', email: `temp${Date.now()}@abc.local`, password: '123456', roleIds: [role.id], branchAccess: { all: true, branchIds: [] } })).body.data;
    expect((await ctx.check('role', role.id)).body.data).toMatchObject({ deletable: false, message: expect.stringContaining('Default roles cannot be deleted') });
    expect((await ctx.del('user', user.id)).status).toBe(200);

    const cats = (await api().get('/api/v1/categories').set(bearer(ctx.t))).body.data;
    const ring = cats.find((c) => c.name === 'Ring');
    await api().post('/api/v1/products').set(bearer(ctx.t)).send({ name: 'Ring', categoryId: ring.id, jewelleryType: 'plain_gold', metal: 'gold', purity: 916, grossWeightMg: 5000, wastage: { mode: 'none', value: 0 }, making: { type: 'fixed', value: 1 }, branchId: ctx.ho });
    expect((await ctx.check('category', ring.id)).body.data).toMatchObject({ deletable: false, usedBy: [expect.objectContaining({ model: 'Product', count: 1 })] });
  });

  it('needs the delete permission for the record type', async () => {
    const ctx = await setup();
    expect((await api().get(`/api/v1/records/nothing/${ctx.ho}/delete-check`).set(bearer(ctx.t))).status).toBe(400);
  });
});

describe('customers who have bought something', () => {
  it('can never be deleted, and the list marks them', async () => {
    const ctx = await setup();
    const ring = (await api().get('/api/v1/categories').set(bearer(ctx.t))).body.data.find((c) => c.name === 'Ring');
    await api().post('/api/v1/rates').set(bearer(ctx.t)).send({ rates: [{ metal: 'gold', purity: 916, ratePerGramPaise: 725000 }] });
    const piece = (
      await api().post('/api/v1/products').set(bearer(ctx.t)).send({ name: 'Ring', categoryId: ring.id, jewelleryType: 'plain_gold', metal: 'gold', purity: 916, grossWeightMg: 10000, wastage: { mode: 'none', value: 0 }, making: { type: 'per_gram', value: 50000 }, huid: 'DEL001', hsnCode: '7113', branchId: ctx.ho })
    ).body.data;
    await api().post('/api/v1/inventory/opening').set(bearer(ctx.t)).send({ branchId: ctx.ho, productIds: [piece.id] });
    const buyer = (await api().post('/api/v1/customers').set(bearer(ctx.t)).send({ name: 'Ring Buyer', mobile: '9830011199', address: { stateCode: '19' } })).body.data;
    const quote = (await api().post('/api/v1/sales/quote').set(bearer(ctx.t)).send({ branchId: ctx.ho, customerId: buyer.id, items: [{ productId: piece.id }] })).body.data;
    const sale = await api().post('/api/v1/sales').set(bearer(ctx.t)).send({ branchId: ctx.ho, customerId: buyer.id, items: [{ productId: piece.id }], payments: [{ mode: 'cash', amountPaise: quote.totals.grandTotalPaise }] });
    expect(sale.status).toBe(201);

    expect((await ctx.check('customer', buyer.id)).body.data).toMatchObject({ deletable: false, usedBy: expect.arrayContaining([expect.objectContaining({ model: 'Sale', label: '1 invoice' })]) });
    expect((await ctx.del('customer', buyer.id)).body.error.code).toBe('IN_USE');
    expect((await api().delete(`/api/v1/customers/${buyer.id}`).set(bearer(ctx.t))).status).toBe(409);
    const row = (await api().get('/api/v1/customers?q=Ring Buyer').set(bearer(ctx.t))).body.data[0];
    expect(row).toMatchObject({ id: buyer.id, hasPurchases: true });
  });
});

describe('delete status for a whole table page', () => {
  it('says per row whether Delete is allowed, and why not', async () => {
    const ctx = await setup();
    const hire = async (name) =>
      (await api().post('/api/v1/hr/employees').set(bearer(ctx.t)).send({ name, mobile: `97${Math.floor(10000000 + Math.random() * 89999999)}`, designation: 'Salesman', branchId: ctx.ho, joiningDate: '2025-01-01', basicPaise: 1000000, allowancePaise: 0 })).body.data;
    const [free, marked] = [await hire('Free One'), await hire('Marked One')];
    const today = new Date().toISOString().slice(0, 10);
    await api().put('/api/v1/hr/attendance').set(bearer(ctx.t)).send({ branchId: ctx.ho, date: today, entries: [{ employeeId: marked.id, status: 'present' }] });

    const res = await api().post('/api/v1/records/employee/delete-checks').set(bearer(ctx.t)).send({ ids: [free.id, marked.id] });
    expect(res.body.data[free.id]).toEqual({ deletable: true, message: null });
    expect(res.body.data[marked.id]).toMatchObject({ deletable: false, message: expect.stringContaining('attendance marks') });

    const branches = (await api().post('/api/v1/records/branch/delete-checks').set(bearer(ctx.t)).send({ ids: [ctx.ho] })).body.data;
    expect(branches[ctx.ho]).toEqual({ deletable: false, message: 'The head office cannot be deleted.' });
  });
});
