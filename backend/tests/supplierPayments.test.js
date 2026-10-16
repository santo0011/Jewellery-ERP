import { describe, expect, it } from 'vitest';
import { runWithContext } from '../src/core/context/requestContext.js';
import { Account } from '../src/core/ledger/account.model.js';
import { JournalEntry } from '../src/core/ledger/journalEntry.model.js';
import { api, bearer, registerOrg } from './helpers.js';

// A supplier's old balance and their purchase bills are one due: the Payment button clears the old balance first,
// then the oldest bills, and every screen (list, summary card, bills, ledger) agrees on what is still owed.

async function setup() {
  const { token: t } = await registerOrg();
  const me = (await api().get('/api/v1/auth/me').set(bearer(t))).body.data;
  return { t, orgId: me.organisation.id, ho: me.branches[0].id };
}

const bill = (ctx, supplierId, billNo, billDate, valuePaise) =>
  api()
    .post('/api/v1/purchases')
    .set(bearer(ctx.t))
    .send({ supplierId, branchId: ctx.ho, billNo, billDate, metalLines: [{ metal: 'gold', purity: 995, kind: 'bullion', grossWeightMg: 1000, valuePaise }], gstPaise: 0 });

/** The supplier's balance on sundry creditors: plus = we owe them. */
const ledger = (ctx, supplierId) =>
  runWithContext({ organisationId: ctx.orgId }, async () => {
    const acc = await Account.findOne({ systemKey: 'sundry_creditors' }).lean();
    const entries = await JournalEntry.find({ 'lines.party.id': supplierId }).lean();
    return entries.flatMap((e) => e.lines).filter((l) => String(l.accountId) === String(acc._id) && String(l.party?.id) === supplierId).reduce((n, l) => n + l.creditPaise - l.debitPaise, 0);
  });

describe('supplier payments', () => {
  it('old balance is only positive, adds to the due, and a payment clears it first and then the oldest bills', async () => {
    const ctx = await setup();
    const base = { companyName: 'Old Dues Bullion', mobile: '9830044444', address: {} };
    const neg = await api().post('/api/v1/suppliers').set(bearer(ctx.t)).send({ ...base, openingBalancePaise: -100000 });
    expect(neg.status).toBe(400);
    expect(neg.body.error.details[0]).toMatchObject({ path: 'openingBalancePaise', message: 'Old balance cannot be negative' });

    const s = (await api().post('/api/v1/suppliers').set(bearer(ctx.t)).send({ ...base, openingBalancePaise: 100000 })).body.data; // ₹1,000 old balance
    const b1 = (await bill(ctx, s.id, 'B-1', '2026-01-10', 300000)).body.data;
    const b2 = (await bill(ctx, s.id, 'B-2', '2026-02-10', 200000)).body.data;
    const listed = async () => (await api().get('/api/v1/suppliers').query({ q: s.code }).set(bearer(ctx.t))).body;

    let list = await listed();
    expect(list.data[0]).toMatchObject({ openingDuePaise: 100000, billDuePaise: 500000, duePaise: 600000 });
    expect(list.meta.summary).toMatchObject({ duePaise: 600000, oldDuePaise: 100000, billDuePaise: 500000, dueSuppliers: 1 });
    expect(await ledger(ctx, s.id)).toBe(600000);

    // More than is due is refused.
    expect((await api().post(`/api/v1/suppliers/${s.id}/payments`).set(bearer(ctx.t)).send({ branchId: ctx.ho, amountPaise: 600001, mode: 'cash' })).status).toBe(400);

    // ₹2,500: ₹1,000 clears the old balance, ₹1,500 goes to the oldest bill (B-1).
    const pay = await api().post(`/api/v1/suppliers/${s.id}/payments`).set(bearer(ctx.t)).send({ branchId: ctx.ho, amountPaise: 250000, mode: 'bank', reference: 'NEFT1' });
    expect(pay.status).toBe(201);
    expect(pay.body.data).toMatchObject({
      paymentNo: expect.stringMatching(/^SP\//),
      duePaiseAfter: 350000,
      allocations: [
        { purchaseId: null, amountPaise: 100000 },
        { purchaseNo: b1.purchaseNo, billNo: 'B-1', amountPaise: 150000 },
      ],
    });
    expect((await api().get(`/api/v1/purchases/${b1.id}`).set(bearer(ctx.t))).body.data).toMatchObject({ paidPaise: 150000, duePaise: 150000, paymentStatus: 'partly_paid' });
    list = await listed();
    expect(list.data[0]).toMatchObject({ openingDuePaise: 0, billDuePaise: 350000, duePaise: 350000 });
    expect(await ledger(ctx, s.id)).toBe(350000);

    // Paid on a bill directly, too: both show in the history, newest first, the account payment once.
    await api().post(`/api/v1/purchases/${b2.id}/payments`).set(bearer(ctx.t)).send({ amountPaise: 50000, mode: 'upi' });
    const history = (await api().get(`/api/v1/suppliers/${s.id}/payments`).set(bearer(ctx.t))).body.data;
    expect(history.map((h) => [h.source, h.amountPaise])).toEqual([
      ['bill', 50000],
      ['account', 250000],
    ]);

    // With purchases and payments on record the old balance is locked (other details can still be edited).
    const lower = await api().put(`/api/v1/suppliers/${s.id}`).set(bearer(ctx.t)).send({ ...base, openingBalancePaise: 50000 });
    expect(lower.status).toBe(422);
    expect(lower.body.error).toMatchObject({ code: 'OLD_BALANCE_LOCKED', details: [{ path: 'openingBalancePaise' }] });
    expect((await api().put(`/api/v1/suppliers/${s.id}`).set(bearer(ctx.t)).send({ ...base, openingBalancePaise: 100000, notes: 'Renamed contact' })).status).toBe(200);

    // The rest: everything is clear and nothing more can be paid.
    expect((await api().post(`/api/v1/suppliers/${s.id}/payments`).set(bearer(ctx.t)).send({ branchId: ctx.ho, amountPaise: 300000, mode: 'cash' })).body.data.duePaiseAfter).toBe(0);
    expect((await api().post(`/api/v1/suppliers/${s.id}/payments`).set(bearer(ctx.t)).send({ branchId: ctx.ho, amountPaise: 100, mode: 'cash' })).status).toBe(409);
    expect(await ledger(ctx, s.id)).toBe(0);
    const detail = (await api().get(`/api/v1/suppliers/${s.id}`).set(bearer(ctx.t))).body.data;
    expect(detail.stats).toMatchObject({ duePaise: 0, paidPaise: 600000, openingPaidPaise: 100000 });
  });

  it('old balance can be edited until the first purchase, then it is locked and adds to the bill due', async () => {
    const ctx = await setup();
    const base = { companyName: 'Fresh Supplier', mobile: '9830055555', address: {} };
    const s = (await api().post('/api/v1/suppliers').set(bearer(ctx.t)).send({ ...base, openingBalancePaise: 1000000 })).body.data; // ₹10,000
    const edit = (body) => api().put(`/api/v1/suppliers/${s.id}`).set(bearer(ctx.t)).send({ ...base, ...body });
    const get = async () => (await api().get(`/api/v1/suppliers/${s.id}`).set(bearer(ctx.t))).body.data;

    // No purchase or payment yet: the old balance can be corrected.
    expect((await get()).openingBalanceLocked).toBe(false);
    expect((await edit({ openingBalancePaise: 1200000 })).status).toBe(200);

    // First purchase (nothing paid on it): ₹12,000 old + ₹3,000 bill = ₹15,000 due, and the old balance is locked.
    expect((await bill(ctx, s.id, 'F-1', '2026-03-01', 300000)).status).toBe(201);
    const after = await get();
    expect(after).toMatchObject({ openingBalanceLocked: true, openingBalancePaise: 1200000, stats: { openingDuePaise: 1200000, billDuePaise: 300000, duePaise: 1500000 } });
    expect((await edit({ openingBalancePaise: 0 })).body.error.code).toBe('OLD_BALANCE_LOCKED');
    expect((await get()).openingBalancePaise).toBe(1200000);
  });
});
