import { describe, expect, it } from 'vitest';
import { runWithContext } from '../src/core/context/requestContext.js';
import { UndoAction } from '../src/core/undo/undoAction.model.js';
import { handlerFor } from '../src/modules/undo/undo.registry.js';
import { api, bearer } from './helpers.js';
import { branchTop, dismiss, ledgerNet, orgTop, undo, undoSetup } from './undoHelpers.js';

/*
 * Undo of money and stock: each is taken back through a reversal — the original stays, marked, and the ledger nets
 * to zero over it — and refused (with the reason) while something built on it is still there.
 */

const todayIso = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const prevMonth = () => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
};

async function setup() {
  const ctx = await undoSetup();
  const get = async (url) => (await api().get(`/api/v1${url}`).set(bearer(ctx.t))).body.data;
  const post = (url, body) => api().post(`/api/v1${url}`).set(bearer(ctx.t)).send(body);
  const ring = (await get('/categories')).find((c) => c.name === 'Ring');
  await post('/rates', { rates: [{ metal: 'gold', purity: 916, ratePerGramPaise: 725000 }] });
  return { ...ctx, get, post, ring };
}

/** A tagged ring at the head office, in stock (product added + opening stock). */
async function stocked(ctx, o = {}) {
  const p = (
    await ctx.post('/products', {
      name: 'Ring',
      categoryId: ctx.ring.id,
      jewelleryType: 'plain_gold',
      metal: 'gold',
      purity: 916,
      grossWeightMg: 5000,
      wastage: { mode: 'none', value: 0 },
      making: { type: 'fixed', value: 100000 },
      costPricePaise: 3000000,
      huid: huid(),
      branchId: ctx.ho,
      ...o,
    })
  ).body.data;
  await ctx.post('/inventory/opening', { branchId: ctx.ho, productIds: [p.id] });
  return p;
}

async function sell(ctx, productId, extra = {}) {
  const body = { branchId: ctx.ho, items: [{ productId }], ...extra };
  const q = (await ctx.post('/sales/quote', body)).body.data;
  const total = q.payablePaise ?? q.totals.grandTotalPaise;
  return { total, res: await ctx.post('/sales', { ...body, payments: extra.payments ?? [{ mode: 'cash', amountPaise: total }] }) };
}

const huid = () => `H${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

const metalPool = async (ctx, kind = 'bullion') => (await ctx.get(`/inventory/summary?branchId=${ctx.ho}`)).metalPools.find((m) => m.kind === kind) ?? { grossMg: 0, valuePaise: 0 };

describe('undo: sales', () => {
  it('cancels the invoice, then the opening stock, then the product — each in turn, newest first', async () => {
    const ctx = await setup();
    const p = await stocked(ctx);
    const { res } = await sell(ctx, p.id);
    expect(res.status).toBe(201);
    const sale = res.body.data;

    let top = await branchTop(ctx.t, ctx.ho);
    expect(top).toMatchObject({ type: 'sale.create', mode: 'reversal', label: sale.invoiceNo, canUndo: true });
    expect(top.effect).toMatch(/1 piece back in stock/);
    expect((await undo(ctx.t, top.id, 'Billed the wrong ring')).status).toBe(200);
    expect(await ctx.get(`/sales/${sale.id}`)).toMatchObject({ status: 'cancelled' });
    expect((await ctx.get(`/products/${p.id}`)).status).toBe('in_stock');
    // The invoice stays; its entries and their reversals net to zero.
    expect(await ledgerNet(ctx, 'sale', sale.id)).toMatchObject({ net: {} });

    top = await branchTop(ctx.t, ctx.ho);
    expect(top.type).toBe('stock.opening');
    expect((await undo(ctx.t, top.id)).status).toBe(200);
    expect((await ctx.get(`/products/${p.id}`)).status).toBe('draft');

    // The product itself has history now (the cancelled invoice and its stock movements point to it): it cannot be
    // removed, so Undo says why — and it can be kept, with a reason, to move on.
    top = await branchTop(ctx.t, ctx.ho);
    expect(top).toMatchObject({ type: 'product.create', canUndo: false });
    expect(top.blockedBy).toMatch(/invoice/);
    expect((await undo(ctx.t, top.id)).body.error.code).toBe('UNDO_BLOCKED');
    expect((await dismiss(ctx.t, top.id, 'Ring stays as a draft')).body.data).toMatchObject({ status: 'dismissed', resolution: { reason: 'Ring stays as a draft' } });
    expect(await branchTop(ctx.t, ctx.ho)).toBeNull();

    // The rates were only used by a cancelled bill: they can be withdrawn too; prices fall back to none.
    const rates = await orgTop(ctx.t);
    expect(rates).toMatchObject({ type: 'rate.set', canUndo: true });
    expect((await undo(ctx.t, rates.id)).status).toBe(200);
    expect(await ctx.get('/rates/current')).toEqual([]);
  });

  it('a due collected on the bill comes off first; rates a live bill used cannot be withdrawn', async () => {
    const ctx = await setup();
    const c = (await ctx.post('/customers', { name: 'Rupa Sen', mobile: '9876500201', address: { stateCode: '19' } })).body.data;
    const p = await stocked(ctx);
    const q = (await ctx.post('/sales/quote', { branchId: ctx.ho, customerId: c.id, items: [{ productId: p.id }] })).body.data;
    const res = await ctx.post('/sales', { branchId: ctx.ho, customerId: c.id, items: [{ productId: p.id }], payments: [{ mode: 'credit', amountPaise: q.payablePaise ?? q.totals.grandTotalPaise }] });
    expect(res.status).toBe(201);
    const due = await ctx.post(`/customers/${c.id}/payments`, { branchId: ctx.ho, mode: 'cash', amountPaise: 100000 });
    expect(due.status).toBe(201);

    // Older actions wait: the receipt is newest.
    const older = (await ctx.get('/undo/history?status=active')).find((h) => h.type === 'sale.create');
    expect((await undo(ctx.t, older.id)).body.error.code).toBe('UNDO_NOT_LATEST');
    const top = await branchTop(ctx.t, ctx.ho);
    expect(top).toMatchObject({ type: 'customerReceipt.create', canUndo: true });
    expect((await undo(ctx.t, top.id)).status).toBe(200);
    expect(await ledgerNet(ctx, 'customer_receipt')).toMatchObject({ net: {} });
    // The bill is owed in full again.
    expect((await ctx.get(`/customers/${c.id}/dues`)).totalDuePaise).toBe(q.payablePaise ?? q.totals.grandTotalPaise);

    // Adding the customer is newer than the rates; she has a bill now, so she stays (kept, with a reason).
    const added = await orgTop(ctx.t);
    expect(added).toMatchObject({ type: 'customer.create', canUndo: false });
    expect((await dismiss(ctx.t, added.id, 'Real customer')).status).toBe(200);
    // The rates were used on a live bill: withdrawing them is refused, with the reason.
    const rates = await orgTop(ctx.t);
    expect(rates).toMatchObject({ type: 'rate.set', canUndo: false });
    expect(rates.blockedBy).toMatch(new RegExp(res.body.data.invoiceNo.replace(/\//g, '\\/')));
    expect((await undo(ctx.t, rates.id)).body.error.code).toBe('UNDO_BLOCKED');
  });
});

describe('undo: purchases and payments', () => {
  async function buying() {
    const ctx = await setup();
    const supplier = (await ctx.post('/suppliers', { companyName: 'Bowbazar Ornaments', mobile: '9830011111', address: {}, supplies: ['jewellery'] })).body.data;
    const item = (await ctx.post('/items', { name: 'Plain Gold Ring', categoryId: ctx.ring.id, jewelleryType: 'plain_gold', metal: 'gold', purity: 916 })).body.data;
    return { ...ctx, supplier, item };
  }

  it('cancels a bill: pieces retired, metal out, payment back, order open again — and the bill no. can be entered again', async () => {
    const ctx = await buying();
    const po = (await ctx.post('/purchases/orders', { supplierId: ctx.supplier.id, branchId: ctx.ho, lines: [{ itemId: ctx.item.id, quantity: 2 }] })).body.data;
    const bill = {
      supplierId: ctx.supplier.id,
      branchId: ctx.ho,
      billNo: 'BO-7',
      billDate: todayIso(),
      orderId: po.id,
      items: [],
      newPieces: [{ itemId: ctx.item.id, grossWeightMg: 4000, costPaise: 2800000 }, { itemId: ctx.item.id, grossWeightMg: 4500, costPaise: 3100000 }],
      metalLines: [{ metal: 'gold', purity: 916, kind: 'bullion', grossWeightMg: 10000, valuePaise: 7000000 }],
      gstPaise: 0,
      paidNow: { amountPaise: 1000000, mode: 'bank' },
    };
    const res = await ctx.post('/purchases', bill);
    expect(res.status).toBe(201);
    const p = res.body.data;
    expect((await ctx.post(`/purchases/${p.id}/payments`, { amountPaise: 500000, mode: 'cash' })).status).toBe(200);

    // The later payment first.
    let top = await branchTop(ctx.t, ctx.ho);
    expect(top).toMatchObject({ type: 'purchase.payment', canUndo: true });
    expect((await undo(ctx.t, top.id, 'Paid twice by mistake')).status).toBe(200);
    expect(await ctx.get(`/purchases/${p.id}`)).toMatchObject({ paidPaise: 1000000, status: 'active' });

    top = await branchTop(ctx.t, ctx.ho);
    expect(top).toMatchObject({ type: 'purchase.create', canUndo: true });
    expect(top.effect).toMatch(/2 pieces leave stock/);
    expect((await undo(ctx.t, top.id, 'Wrong supplier bill')).status).toBe(200);

    const cancelled = await ctx.get(`/purchases/${p.id}`);
    expect(cancelled).toMatchObject({ status: 'cancelled', cancelReason: 'Wrong supplier bill', originalBillNo: 'BO-7' });
    for (const row of cancelled.items) expect((await api().get(`/api/v1/products/${row.productId}`).set(bearer(ctx.t))).status).toBe(404);
    expect((await metalPool(ctx)).grossMg).toBe(0);
    expect(await ledgerNet(ctx, 'purchase', p.id)).toMatchObject({ net: {} });
    expect((await ctx.get(`/purchases/orders/${po.id}`)).status).toBe('open');
    // Cancelled bills owe nothing and count nowhere.
    expect((await ctx.get(`/suppliers/${ctx.supplier.id}`)).stats).toMatchObject({ bills: 0, duePaise: 0 });
    // The same bill can be entered again (correctly this time).
    expect((await ctx.post('/purchases', { ...bill, orderId: undefined, paidNow: undefined, newPieces: [bill.newPieces[0]] })).status).toBe(201);
  });

  it('refuses to cancel a bill whose piece was sold, until that sale is undone', async () => {
    const ctx = await buying();
    const p = (await ctx.post('/purchases', { supplierId: ctx.supplier.id, branchId: ctx.ho, billNo: 'BO-8', billDate: todayIso(), items: [], newPieces: [{ itemId: ctx.item.id, grossWeightMg: 4000, costPaise: 2800000, huid: huid() }], metalLines: [], gstPaise: 0 })).body.data;
    expect(p.items).toHaveLength(1);
    const { res } = await sell(ctx, p.items[0].productId);
    expect(res.status).toBe(201);
    // The bill is not the latest; and dismissing the sale (to reach it) would leave it blocked anyway.
    const bill = (await ctx.get('/undo/history?status=active')).find((h) => h.type === 'purchase.create');
    expect((await undo(ctx.t, bill.id)).body.error.code).toBe('UNDO_NOT_LATEST');
    expect((await undo(ctx.t, (await branchTop(ctx.t, ctx.ho)).id)).status).toBe(200); // the sale
    expect((await branchTop(ctx.t, ctx.ho)).type).toBe('purchase.create');
    expect((await undo(ctx.t, bill.id)).status).toBe(200);
  });

  it('takes back a payment on the supplier’s account: bills and old balance owed again', async () => {
    const ctx = await buying();
    const s = (await ctx.post('/suppliers', { companyName: 'Old Dues & Co', mobile: '9830022222', address: {}, supplies: ['gold'], openingBalancePaise: 500000 })).body.data;
    await ctx.post('/purchases', { supplierId: s.id, branchId: ctx.ho, billNo: 'OD-1', billDate: todayIso(), items: [], newPieces: [{ itemId: ctx.item.id, grossWeightMg: 4000, costPaise: 1000000 }], metalLines: [], gstPaise: 0 });
    const pay = await ctx.post(`/suppliers/${s.id}/payments`, { branchId: ctx.ho, mode: 'bank', amountPaise: 800000 });
    expect(pay.status).toBe(201);
    expect((await ctx.get(`/suppliers/${s.id}`)).stats.duePaise).toBe(700000);

    const top = await branchTop(ctx.t, ctx.ho);
    expect(top).toMatchObject({ type: 'supplierPayment.create', canUndo: true });
    expect((await undo(ctx.t, top.id)).status).toBe(200);
    expect((await ctx.get(`/suppliers/${s.id}`)).stats.duePaise).toBe(1500000);
    expect(await ledgerNet(ctx, 'supplier_payment')).toMatchObject({ net: {} });
  });
});

describe('undo: expenses, old gold, making and transfers', () => {
  it('puts an expense back as it was, then voids it', async () => {
    const ctx = await setup();
    const cat = (await ctx.get('/expenses/categories')).find((c) => c.name === 'Electricity');
    const e = (await ctx.post('/expenses', { branchId: ctx.ho, date: todayIso(), categoryId: cat.id, amountPaise: 250000, mode: 'cash' })).body.data;
    await api().put(`/api/v1/expenses/${e.id}`).set(bearer(ctx.t)).send({ date: todayIso(), categoryId: cat.id, amountPaise: 350000, mode: 'cash', reason: 'Bill was higher' });
    let top = await branchTop(ctx.t, ctx.ho);
    expect(top.type).toBe('expense.update');
    expect((await undo(ctx.t, top.id)).status).toBe(200);
    expect((await ctx.get(`/expenses/${e.id}`)).amountPaise).toBe(250000);
    top = await branchTop(ctx.t, ctx.ho);
    expect(top.type).toBe('expense.create');
    expect((await undo(ctx.t, top.id)).status).toBe(200);
    expect((await ctx.get(`/expenses/${e.id}`)).status).toBe('void');
    expect(await ledgerNet(ctx, 'expense', e.id)).toMatchObject({ net: {} });
  });

  it('cancels old gold bought (metal back out), and refuses once that gold was made into jewellery', async () => {
    const ctx = await setup();
    const c = (await ctx.post('/customers', { name: 'Seller', mobile: '9876500301', address: { stateCode: '19' } })).body.data;
    const og = (await ctx.post('/old-gold', { branchId: ctx.ho, customerId: c.id, lines: [{ description: 'Old bangle', metal: 'gold', purity: 916, grossWeightMg: 10000, lessWeightMg: 500, deductionBps: 200, ratePerGramPaise: 680000 }], payout: { mode: 'cash' } })).body.data;
    const item = (await ctx.post('/items', { name: 'Plain Gold Ring', categoryId: ctx.ring.id, jewelleryType: 'plain_gold', metal: 'gold', purity: 916 })).body.data;
    const made = await ctx.post('/inventory/production', { branchId: ctx.ho, metalUsed: [{ metal: 'gold', purity: 916, kind: 'old_gold', grossWeightMg: 9000 }], pieces: [{ itemId: item.id, grossWeightMg: 8800 }] });
    expect(made.status).toBe(201);

    // Making is newest: cancelling it retires the ring and puts the gold back, at its cost.
    let top = await branchTop(ctx.t, ctx.ho);
    expect(top).toMatchObject({ type: 'production.create', canUndo: true });
    expect((await undo(ctx.t, top.id)).status).toBe(200);
    expect((await metalPool(ctx, 'old_gold')).grossMg).toBe(9500);
    expect((await api().get(`/api/v1/products/${made.body.data.pieces[0].productId}`).set(bearer(ctx.t))).status).toBe(404);

    // Then the old gold itself: it leaves Raw materials and the payout is reversed. (The item is an organisation record.)
    top = await branchTop(ctx.t, ctx.ho);
    expect(top).toMatchObject({ type: 'oldgold.create', canUndo: true });
    expect((await undo(ctx.t, top.id)).status).toBe(200);
    expect((await metalPool(ctx, 'old_gold')).grossMg).toBe(0);
    expect(await ctx.get(`/old-gold/${og.id}`)).toMatchObject({ status: 'cancelled' });
    expect(await ledgerNet(ctx, 'old_gold', og.id)).toMatchObject({ net: {} });
  });

  it('refuses to cancel old gold that went into a piece still in stock', async () => {
    const ctx = await setup();
    const c = (await ctx.post('/customers', { name: 'Seller Two', mobile: '9876500302', address: { stateCode: '19' } })).body.data;
    const og = (await ctx.post('/old-gold', { branchId: ctx.ho, customerId: c.id, lines: [{ description: 'Old chain', metal: 'gold', purity: 916, grossWeightMg: 10000, lessWeightMg: 0, deductionBps: 0, ratePerGramPaise: 680000 }], payout: { mode: 'cash' } })).body.data;
    expect(og.docNo).toBeTruthy();
    await ctx.post('/inventory/production', { branchId: ctx.ho, metalUsed: [{ metal: 'gold', purity: 916, kind: 'old_gold', grossWeightMg: 9000 }], pieces: [{ itemId: (await ctx.post('/items', { name: 'Chain', categoryId: ctx.ring.id, jewelleryType: 'plain_gold', metal: 'gold', purity: 916 })).body.data.id, grossWeightMg: 8800 }] });
    const making = await branchTop(ctx.t, ctx.ho);
    // Keep the making (it is right); the old gold below it cannot be cancelled now — its gold is in the chain.
    expect((await api().post(`/api/v1/undo/${making.id}/dismiss`).set(bearer(ctx.t)).send({ reason: 'The chain is right' })).body.error.code).toBe('UNDO_POSSIBLE');
    const entry = (await ctx.get('/undo/history?status=active')).find((h) => h.type === 'oldgold.create');
    expect(entry.label).toBe(og.docNo);
    expect((await undo(ctx.t, entry.id)).body.error.code).toBe('UNDO_NOT_LATEST');
  });

  it('recalls a transfer, and puts a received one back on its way', async () => {
    const ctx = await setup();
    const p = await stocked(ctx);
    const t = (await ctx.post('/inventory/transfers', { fromBranchId: ctx.ho, toBranchId: ctx.branchId, productIds: [p.id] })).body.data;
    expect((await api().post(`/api/v1/inventory/transfers/${t.id}/receive`).set(bearer(ctx.bt))).status).toBe(200);

    // Received at Salt Lake: on that branch's stack. Its user takes it back — it is on its way again.
    let top = await branchTop(ctx.bt, ctx.branchId);
    expect(top).toMatchObject({ type: 'transfer.close', canUndo: true });
    expect((await undo(ctx.bt, top.id)).status).toBe(200);
    expect((await ctx.get(`/products/${p.id}`)).status).toBe('in_transit');
    expect(await ledgerNet(ctx, 'stock_transfer', t.id)).toMatchObject({ net: {} });

    // Sent from the head office: recalled there.
    top = await branchTop(ctx.t, ctx.ho);
    expect(top).toMatchObject({ type: 'transfer.dispatch', canUndo: true });
    expect((await undo(ctx.t, top.id)).status).toBe(200);
    expect(await ctx.get(`/products/${p.id}`)).toMatchObject({ status: 'in_stock', branch: { id: ctx.ho } });
  });
});

describe('undo: orders and payroll', () => {
  it('refunds an extra advance, then cancels the order with its advance refunded the way it was paid', async () => {
    const ctx = await setup();
    const c = (await ctx.post('/customers', { name: 'Bride', mobile: '9876500401', address: { stateCode: '19' } })).body.data;
    const order = (await ctx.post('/orders', { branchId: ctx.ho, customerId: c.id, items: [{ description: 'Bridal ring', categoryId: ctx.ring.id, metal: 'gold', purity: 916, approxWeightMg: 10000, estimatedPaise: 9000000 }], advance: { mode: 'cash', amountPaise: 2000000 } })).body.data;
    expect((await ctx.post(`/orders/${order.id}/advances`, { mode: 'upi', amountPaise: 500000 })).status).toBe(201);

    let top = await branchTop(ctx.t, ctx.ho);
    expect(top.type).toBe('order.advance');
    expect((await undo(ctx.t, top.id)).status).toBe(200);
    expect((await ctx.get(`/orders/${order.id}`)).advancePaise).toBe(2000000);

    top = await branchTop(ctx.t, ctx.ho);
    expect(top).toMatchObject({ type: 'order.create', canUndo: true });
    expect(top.effect).toMatch(/refunded by cash/);
    expect((await undo(ctx.t, top.id)).status).toBe(200);
    expect(await ctx.get(`/orders/${order.id}`)).toMatchObject({ status: 'cancelled', advancePaise: 0 });
    expect(await ledgerNet(ctx, 'order', order.id)).toMatchObject({ net: {} });
  });

  it('unwinds a payroll month: payment, finalising (advance owed again), the run; then the advance', async () => {
    const ctx = await setup();
    const month = prevMonth();
    const emp = (await ctx.post('/hr/employees', { name: 'Asha Roy', mobile: '9776500501', designation: 'Salesman', branchId: ctx.ho, joiningDate: '2025-01-01', basicPaise: 2400000, allowancePaise: 600000 })).body.data;
    const adv = (await ctx.post('/hr/advances', { employeeId: emp.id, amountPaise: 1000000, installmentPaise: 400000, mode: 'cash' })).body.data;
    const run = (await ctx.post('/hr/payroll', { branchId: ctx.ho, month })).body.data;
    expect((await ctx.post(`/hr/payroll/${run.id}/finalise`)).status).toBe(200);
    expect((await ctx.post(`/hr/payroll/${run.id}/pay`, { mode: 'cash' })).status).toBe(200);

    const step = async (type) => {
      const top = await branchTop(ctx.t, ctx.ho);
      expect(top).toMatchObject({ type, canUndo: true });
      expect((await undo(ctx.t, top.id)).status).toBe(200);
    };
    await step('payroll.pay');
    expect((await ctx.get(`/hr/payroll/${run.id}`)).status).toBe('finalised');
    await step('payroll.finalise');
    expect((await ctx.get(`/hr/payroll/${run.id}`)).status).toBe('draft');
    expect(await ledgerNet(ctx, 'payroll', run.id)).toMatchObject({ net: {} });
    const owed = (await ctx.get(`/hr/advances?employeeId=${emp.id}`))[0];
    expect(owed).toMatchObject({ id: adv.id, balancePaise: 1000000 });
    await step('payroll.create');
    expect((await api().get(`/api/v1/hr/payroll/${run.id}`).set(bearer(ctx.t))).status).toBe(404);
    await step('advance.create');
    expect((await ctx.get(`/hr/advances?employeeId=${emp.id}`))[0].status).toBe('cancelled');
    expect(await ledgerNet(ctx, 'salary_advance', adv.id)).toMatchObject({ net: {} });
  });
});

describe('undo: all or nothing', () => {
  it('rolls everything back when taking an action back fails half way', async () => {
    const ctx = await setup();
    const cat = (await ctx.get('/expenses/categories')).find((c) => c.name === 'Electricity');
    const e = (await ctx.post('/expenses', { branchId: ctx.ho, date: todayIso(), categoryId: cat.id, amountPaise: 250000, mode: 'cash' })).body.data;
    const top = await branchTop(ctx.t, ctx.ho);

    // The void goes through, then something fails: none of it may stay.
    const handler = handlerFor('expense.create');
    const run = handler.run;
    handler.run = async (entry, opts) => {
      await run(entry, opts);
      throw new Error('Power cut');
    };
    try {
      expect((await undo(ctx.t, top.id)).status).toBe(500);
    } finally {
      handler.run = run;
    }
    expect((await ctx.get(`/expenses/${e.id}`)).status).toBe('active');
    expect((await ledgerNet(ctx, 'expense', e.id)).net).not.toEqual({});
    const entry = await runWithContext({ organisationId: ctx.me.organisation.id }, () => UndoAction.findById(top.id).lean().exec());
    expect(entry).toMatchObject({ status: 'active', resolution: null });
    // And it can still be undone properly.
    expect((await undo(ctx.t, top.id)).status).toBe(200);
  });
});
