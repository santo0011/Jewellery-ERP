import { describe, expect, it } from 'vitest';
import { runWithContext } from '../src/core/context/requestContext.js';
import { Account } from '../src/core/ledger/account.model.js';
import { JournalEntry } from '../src/core/ledger/journalEntry.model.js';
import { SalaryAdvance } from '../src/modules/hr/hr.models.js';
import { api, bearer, registerOrg } from './helpers.js';

const prevMonth = () => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  return d.toISOString().slice(0, 7);
};
const daysIn = (month) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate();

async function setup() {
  const owner = await registerOrg();
  const t = owner.token;
  const me = (await api().get('/api/v1/auth/me').set(bearer(t))).body.data;
  const hire = async (o) =>
    (
      await api()
        .post('/api/v1/hr/employees')
        .set(bearer(t))
        .send({ name: 'Staff', mobile: `97${Math.floor(10000000 + Math.random() * 89999999)}`, designation: 'Salesman', branchId: me.branches[0].id, joiningDate: '2025-01-01', basicPaise: 2400000, allowancePaise: 600000, ...o })
    ).body.data;
  return { t, orgId: me.organisation.id, ho: me.branches[0].id, hire };
}

const journals = (ctx, docType) =>
  runWithContext({ organisationId: ctx.orgId }, async () => {
    const accounts = await Account.find().lean();
    const keys = new Map(accounts.map((a) => [String(a._id), a.systemKey]));
    const entries = await JournalEntry.find({ 'source.docType': docType }).sort({ createdAt: 1 }).lean();
    return entries.map((e) => ({ type: e.voucherType, lines: e.lines.map((l) => [keys.get(String(l.accountId)), l.debitPaise, l.creditPaise]) }));
  });

describe('HR & payroll', () => {
  it('runs a month: attendance -> advance recovery -> finalise -> pay, with ledger postings', async () => {
    const ctx = await setup();
    const month = prevMonth();
    const days = daysIn(month);
    const asha = await ctx.hire({ name: 'Asha Roy' });
    const bimal = await ctx.hire({ name: 'Bimal Das', basicPaise: 1500000, allowancePaise: 0 });
    expect(asha.code).toMatch(/^E\d{4}$/);
    expect(asha.grossPaise).toBe(3000000);

    // Asha: 1 absent, 1 half day, 1 paid leave. Bimal: nothing marked = full month.
    for (const [day, status] of [['05', 'absent'], ['06', 'half_day'], ['07', 'paid_leave']]) {
      const res = await api().put('/api/v1/hr/attendance').set(bearer(ctx.t)).send({ branchId: ctx.ho, date: `${month}-${day}`, entries: [{ employeeId: asha.id, status }] });
      expect(res.status).toBe(200);
    }
    const day = (await api().get(`/api/v1/hr/attendance?branchId=${ctx.ho}&date=${month}-07`).set(bearer(ctx.t))).body.data;
    expect(day.employees.find((e) => e.id === asha.id)).toMatchObject({ status: 'paid_leave', month: { absent: 1, halfDay: 1, paidLeave: 1 } });

    const adv = await api().post('/api/v1/hr/advances').set(bearer(ctx.t)).send({ employeeId: asha.id, amountPaise: 1000000, installmentPaise: 400000, mode: 'cash' });
    expect(adv.status).toBe(201);
    expect(adv.body.data).toMatchObject({ advanceNo: expect.stringMatching(/^ADV\/HO\//), balancePaise: 1000000 });

    const created = await api().post('/api/v1/hr/payroll').set(bearer(ctx.t)).send({ branchId: ctx.ho, month });
    expect(created.status).toBe(201);
    const run = created.body.data;
    const a = run.lines.find((l) => l.name === 'Asha Roy');
    const earned = Math.round((3000000 * (days - 1.5)) / days);
    // Sundays are the default weekly off: unmarked ones count as holiday (still paid).
    const sundays = Array.from({ length: days }, (_, i) => i + 1).filter((d) => ![5, 6, 7].includes(d) && new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, d)).getUTCDay() === 0).length;
    expect(a).toMatchObject({ payableDays: days - 1.5, earnedPaise: earned, advanceDeductionPaise: 400000, netPaise: earned - 400000, days: { absent: 1, halfDay: 1, paidLeave: 1, holiday: sundays, unmarked: days - 3 - sundays } });
    expect(run.lines.find((l) => l.name === 'Bimal Das')).toMatchObject({ payableDays: days, earnedPaise: 1500000, netPaise: 1500000 });

    expect((await api().post('/api/v1/hr/payroll').set(bearer(ctx.t)).send({ branchId: ctx.ho, month })).status).toBe(409);
    const tooMuch = await api().put(`/api/v1/hr/payroll/${run.id}/lines/${asha.id}`).set(bearer(ctx.t)).send({ bonusPaise: 0, otherDeductionPaise: 0, advanceDeductionPaise: 2000000 });
    expect(tooMuch.status).toBe(400);
    const bonus = await api().put(`/api/v1/hr/payroll/${run.id}/lines/${bimal.id}`).set(bearer(ctx.t)).send({ bonusPaise: 50000, otherDeductionPaise: 10000, advanceDeductionPaise: 0, note: 'Festival' });
    expect(bonus.body.data.lines.find((l) => l.name === 'Bimal Das').netPaise).toBe(1540000);

    const fin = await api().post(`/api/v1/hr/payroll/${run.id}/finalise`).set(bearer(ctx.t));
    expect(fin.status).toBe(200);
    expect(fin.body.data.status).toBe('finalised');
    const [booked] = await journals(ctx, 'payroll');
    const debit = booked.lines.reduce((s, l) => s + l[1], 0);
    expect(debit).toBe(booked.lines.reduce((s, l) => s + l[2], 0));
    expect(booked.lines).toContainEqual(['salaries', earned + 1540000, 0]);
    expect(booked.lines).toContainEqual(['staff_advances', 0, 400000]);
    expect(booked.lines).toContainEqual(['salary_payable', 0, earned - 400000]);

    const emp = (await api().get(`/api/v1/hr/employees/${asha.id}`).set(bearer(ctx.t))).body.data;
    expect(emp.advanceBalancePaise).toBe(600000);
    expect(emp.advances[0].recoveries[0]).toMatchObject({ month, amountPaise: 400000 });
    expect(emp.payslips[0]).toMatchObject({ month, netPaise: earned - 400000, paid: false });

    // Finalised month: attendance locked, draft-only actions refused.
    const locked = await api().put('/api/v1/hr/attendance').set(bearer(ctx.t)).send({ branchId: ctx.ho, date: `${month}-10`, entries: [{ employeeId: asha.id, status: 'absent' }] });
    expect(locked.body.error.code).toBe('PAYROLL_LOCKED');
    expect((await api().post(`/api/v1/hr/payroll/${run.id}/recalculate`).set(bearer(ctx.t))).status).toBe(409);

    const payOne = await api().post(`/api/v1/hr/payroll/${run.id}/pay`).set(bearer(ctx.t)).send({ employeeIds: [asha.id], mode: 'cash' });
    expect(payOne.body.data).toMatchObject({ status: 'finalised', totals: { unpaidCount: 1, paidPaise: earned - 400000 } });
    const payRest = await api().post(`/api/v1/hr/payroll/${run.id}/pay`).set(bearer(ctx.t)).send({ mode: 'bank', reference: 'NEFT 991' });
    expect(payRest.body.data.status).toBe('paid');
    expect((await api().post(`/api/v1/hr/payroll/${run.id}/pay`).set(bearer(ctx.t)).send({ mode: 'cash' })).status).toBe(409);

    const monthly = (await api().get(`/api/v1/reports/salary-payments?from=${month}-01`).set(bearer(ctx.t))).body.data;
    expect(monthly.rows).toHaveLength(1);
    expect(monthly.rows[0]).toMatchObject({ employees: 2, cashPaise: earned - 400000, bankPaise: 1540000, paidPaise: earned - 400000 + 1540000, unpaidPaise: 0, status: 'Paid' });

    const payments = (await journals(ctx, 'payroll')).filter((j) => j.type === 'salary_payment');
    expect(payments.map((p) => p.lines.at(-1))).toEqual([
      ['cash', 0, earned - 400000],
      ['bank', 0, 1540000],
    ]);
    const [advanceJv] = await journals(ctx, 'salary_advance');
    expect(advanceJv.lines).toEqual([
      ['staff_advances', 1000000, 0],
      ['cash', 0, 1000000],
    ]);
  });

  it('monthly register: marks, clears, respects joining date and payroll lock', async () => {
    const ctx = await setup();
    const month = prevMonth();
    const a = await ctx.hire({ name: 'Dipa' });
    const late = await ctx.hire({ name: 'Late Joiner', joiningDate: `${month}-15` });
    const save = (entries) => api().put('/api/v1/hr/attendance/register').set(bearer(ctx.t)).send({ branchId: ctx.ho, month, entries });

    const res = await save([
      { employeeId: a.id, date: `${month}-02`, status: 'absent' },
      { employeeId: a.id, date: `${month}-03`, status: 'half_day' },
      { employeeId: late.id, date: `${month}-20`, status: 'holiday' },
    ]);
    expect(res.status).toBe(200);
    const reg = res.body.data;
    expect(reg.days).toBe(daysIn(month));
    expect(reg.employees.find((e) => e.id === a.id).marks).toEqual({ [`${month}-02`]: 'absent', [`${month}-03`]: 'half_day' });
    expect(reg.employees.find((e) => e.id === late.id)).toMatchObject({ from: `${month}-15`, eligibleDays: daysIn(month) - 14 });

    // Clearing a mark deletes it; a day before joining is refused.
    const cleared = (await save([{ employeeId: a.id, date: `${month}-03`, status: null }])).body.data;
    expect(cleared.employees.find((e) => e.id === a.id).marks).toEqual({ [`${month}-02`]: 'absent' });
    expect((await save([{ employeeId: late.id, date: `${month}-05`, status: 'absent' }])).status).toBe(400);
    expect((await api().get(`/api/v1/hr/attendance/register?branchId=${ctx.ho}&month=${month}`).set(bearer(ctx.t))).body.data.employees).toHaveLength(2);

    const run = (await api().post('/api/v1/hr/payroll').set(bearer(ctx.t)).send({ branchId: ctx.ho, month })).body.data;
    expect(run.lines.find((l) => l.name === 'Dipa').payableDays).toBe(daysIn(month) - 1);
    await api().post(`/api/v1/hr/payroll/${run.id}/finalise`).set(bearer(ctx.t));
    expect((await save([{ employeeId: a.id, date: `${month}-04`, status: 'absent' }])).body.error.code).toBe('PAYROLL_LOCKED');
  });

  it('weekly off and holidays: unmarked days count as holiday, a mark wins, pay unchanged', async () => {
    const ctx = await setup();
    const month = prevMonth();
    const days = daysIn(month);
    const emp = await ctx.hire({ name: 'Esha' });
    const cal = (body) => api().put('/api/v1/hr/attendance/calendar').set(bearer(ctx.t)).send({ branchId: ctx.ho, ...body });

    // Default before anything is saved: Sunday off.
    expect((await api().get(`/api/v1/hr/attendance/calendar?branchId=${ctx.ho}`).set(bearer(ctx.t))).body.data).toMatchObject({ weeklyOff: [0], holidays: [], saved: false });
    expect((await cal({ weeklyOff: [0, 1, 2, 3, 4, 5, 6] })).status).toBe(400);
    expect((await cal({ weeklyOff: [], holidays: [{ date: `${month}-10`, name: 'A' }, { date: `${month}-10`, name: 'B' }] })).status).toBe(400);

    // No weekly off, two holidays; Esha is marked absent on one of them.
    const saved = await cal({ weeklyOff: [], holidays: [{ date: `${month}-12`, name: 'Puja' }, { date: `${month}-10`, name: 'Festival' }] });
    expect(saved.body.data.holidays.map((h) => h.date)).toEqual([`${month}-10`, `${month}-12`]);
    await api().put('/api/v1/hr/attendance/register').set(bearer(ctx.t)).send({ branchId: ctx.ho, month, entries: [{ employeeId: emp.id, date: `${month}-12`, status: 'absent' }] });

    const reg = (await api().get(`/api/v1/hr/attendance/register?branchId=${ctx.ho}&month=${month}`).set(bearer(ctx.t))).body.data;
    expect(reg.offDays).toEqual({ [`${month}-10`]: 'Festival', [`${month}-12`]: 'Puja' });
    const day = (await api().get(`/api/v1/hr/attendance?branchId=${ctx.ho}&date=${month}-10`).set(bearer(ctx.t))).body.data;
    expect(day.dayOff).toBe('Festival');

    const line = (await api().post('/api/v1/hr/payroll').set(bearer(ctx.t)).send({ branchId: ctx.ho, month })).body.data.lines[0];
    expect(line.days).toMatchObject({ holiday: 1, absent: 1, unmarked: days - 2 });
    expect(line.payableDays).toBe(days - 1);
  });

  it('validates dates, months and duplicates', async () => {
    const ctx = await setup();
    const emp = await ctx.hire({ name: 'Chandan' });
    const dup = await api().post('/api/v1/hr/employees').set(bearer(ctx.t)).send({ name: 'Other', mobile: emp.mobile, designation: 'Polisher', branchId: ctx.ho, joiningDate: '2025-01-01', basicPaise: 100000 });
    expect(dup.status).toBe(409);
    const future = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    expect((await api().put('/api/v1/hr/attendance').set(bearer(ctx.t)).send({ branchId: ctx.ho, date: future, entries: [{ employeeId: emp.id, status: 'present' }] })).status).toBe(400);
    expect((await api().post('/api/v1/hr/payroll').set(bearer(ctx.t)).send({ branchId: ctx.ho, month: '2099-01' })).status).toBe(400);
    const draft = (await api().post('/api/v1/hr/payroll').set(bearer(ctx.t)).send({ branchId: ctx.ho, month: prevMonth() })).body.data;
    expect((await api().delete(`/api/v1/hr/payroll/${draft.id}`).set(bearer(ctx.t))).status).toBe(200);
    const left = await api().patch(`/api/v1/hr/employees/${emp.id}/status`).set(bearer(ctx.t)).send({ status: 'left', exitDate: '2025-06-30' });
    expect(left.body.data).toMatchObject({ status: 'left', exitDate: '2025-06-30' });
    expect((await api().post('/api/v1/hr/payroll').set(bearer(ctx.t)).send({ branchId: ctx.ho, month: prevMonth() })).status).toBe(400);
  });
});

describe('employee photo', () => {
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

  it('uploads, serves, replaces and removes a photo', async () => {
    const ctx = await setup();
    const emp = await ctx.hire({ name: 'Photo Staff' });
    expect(emp.photoFileId).toBeNull();

    const up = await api().put(`/api/v1/hr/employees/${emp.id}/photo`).set(bearer(ctx.t)).attach('photo', PNG, 'face.png');
    expect(up.status).toBe(200);
    const first = up.body.data.photoFileId;
    expect(first).toBeTruthy();
    const file = await api().get(`/api/v1/files/${first}`).set(bearer(ctx.t));
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('image/png');
    expect((await api().get('/api/v1/hr/employees').set(bearer(ctx.t))).body.data.find((e) => e.id === emp.id).photoFileId).toBe(first);

    const second = (await api().put(`/api/v1/hr/employees/${emp.id}/photo`).set(bearer(ctx.t)).attach('photo', PNG, 'new.png')).body.data.photoFileId;
    expect(second).not.toBe(first);
    expect((await api().get(`/api/v1/files/${first}`).set(bearer(ctx.t))).status).toBe(404);

    const bad = await api().put(`/api/v1/hr/employees/${emp.id}/photo`).set(bearer(ctx.t)).attach('photo', Buffer.from('not an image'), 'x.png');
    expect(bad.body.error.code).toBe('UNSUPPORTED_FILE');

    const removed = await api().delete(`/api/v1/hr/employees/${emp.id}/photo`).set(bearer(ctx.t));
    expect(removed.body.data.photoFileId).toBeNull();
    expect((await api().get(`/api/v1/files/${second}`).set(bearer(ctx.t))).status).toBe(404);
  });
});

describe('salary advance for a month', () => {
  it('records the date and month, deducts only advances due that month, and lists them on the payroll line', async () => {
    const ctx = await setup();
    const month = prevMonth();
    const emp = await ctx.hire({ name: 'Advance Staff', basicPaise: 2000000, allowancePaise: 0 });
    const give = (body) => api().post('/api/v1/hr/advances').set(bearer(ctx.t)).send({ employeeId: emp.id, mode: 'cash', ...body });

    const due = await give({ amountPaise: 500000, installmentPaise: 500000, givenOn: `${month}-10`, recoverFrom: month });
    expect(due.status).toBe(201);
    expect(due.body.data).toMatchObject({ businessDate: `${month}-10`, recoverFrom: month, instalments: 1 });
    const later = await give({ amountPaise: 300000, installmentPaise: 100000, recoverFrom: '2099-01' });
    expect(later.body.data.instalments).toBe(3);

    const future = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
    expect((await give({ amountPaise: 1000, installmentPaise: 1000, givenOn: future })).body.error.details[0].path).toBe('givenOn');

    const run = (await api().post('/api/v1/hr/payroll').set(bearer(ctx.t)).send({ branchId: ctx.ho, month })).body.data;
    const line = run.lines.find((l) => l.employeeId === emp.id);
    expect(line).toMatchObject({ advanceDeductionPaise: 500000, advanceBalancePaise: 500000, advanceUpcomingPaise: 300000, netPaise: line.earnedPaise - 500000 });
    expect(line.advances).toEqual([expect.objectContaining({ advanceNo: due.body.data.advanceNo, givenOn: `${month}-10`, amountPaise: 500000, duePaise: 500000 })]);

    await api().post(`/api/v1/hr/payroll/${run.id}/finalise`).set(bearer(ctx.t));
    const advances = (await api().get(`/api/v1/hr/advances?employeeId=${emp.id}&limit=10`).set(bearer(ctx.t))).body.data;
    expect(advances.find((a) => a.id === due.body.data.id)).toMatchObject({ status: 'closed', balancePaise: 0 });
    expect(advances.find((a) => a.id === later.body.data.id)).toMatchObject({ status: 'open', balancePaise: 300000 });

    expect((await give({ amountPaise: 1000, installmentPaise: 1000, recoverFrom: month })).body.error.details[0].path).toBe('recoverFrom');
  });
});

describe('leave and rejoin', () => {
  it('keeps a joined / left / rejoined history and does not pay the days away', async () => {
    const ctx = await setup();
    const month = prevMonth();
    const emp = await ctx.hire({ name: 'Rejoin Staff', joiningDate: '2025-01-01' });
    const status = (body) => api().patch(`/api/v1/hr/employees/${emp.id}/status`).set(bearer(ctx.t)).send(body);

    const left = await status({ status: 'left', exitDate: `${month}-05`, note: 'Family reasons' });
    expect(left.body.data.history.map((h) => [h.event, h.date, h.note])).toEqual([
      ['joined', '2025-01-01', null],
      ['left', `${month}-05`, 'Family reasons'],
    ]);
    expect((await status({ status: 'active', rejoinDate: `${month}-05` })).body.error.details[0].path).toBe('rejoinDate');

    const back = (await status({ status: 'active', rejoinDate: `${month}-20` })).body.data;
    expect(back).toMatchObject({ status: 'active', exitDate: null, breaks: [{ from: `${month}-06`, to: `${month}-19` }] });
    expect(back.history.map((h) => h.event)).toEqual(['joined', 'left', 'rejoined']);
    expect(back.history[2].by?.name).toBeTruthy();

    // A day in the break cannot be marked; payroll pays only the days on the rolls.
    expect((await api().put('/api/v1/hr/attendance').set(bearer(ctx.t)).send({ branchId: ctx.ho, date: `${month}-10`, entries: [{ employeeId: emp.id, status: 'present' }] })).status).toBe(400);
    const run = (await api().post('/api/v1/hr/payroll').set(bearer(ctx.t)).send({ branchId: ctx.ho, month })).body.data;
    expect(run.lines.find((l) => l.employeeId === emp.id).payableDays).toBe(daysIn(month) - 14);
  });
});

describe('editing an advance', () => {
  it('allows edits on the day it was entered, keeps a history, corrects the books, then locks', async () => {
    const ctx = await setup();
    const emp = await ctx.hire({ name: 'Edit Staff' });
    const adv = (await api().post('/api/v1/hr/advances').set(bearer(ctx.t)).send({ employeeId: emp.id, amountPaise: 500000, installmentPaise: 500000, mode: 'cash' })).body.data;
    expect(adv).toMatchObject({ editable: true, edits: [] });
    const edit = (body) => api().put(`/api/v1/hr/advances/${adv.id}`).set(bearer(ctx.t)).send({ amountPaise: 500000, installmentPaise: 500000, givenOn: adv.businessDate, mode: 'cash', ...body });

    expect((await edit({ amountPaise: 700000, installmentPaise: 700000 })).status).toBe(400); // reason required
    expect((await edit({ reason: 'No change' })).body.error.code).toBe('NO_CHANGES');

    const res = await edit({ amountPaise: 700000, installmentPaise: 350000, mode: 'upi', reason: 'Typed the wrong amount' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ amountPaise: 700000, installmentPaise: 350000, mode: 'upi', instalments: 2 });
    expect(res.body.data.edits).toHaveLength(1);
    expect(res.body.data.edits[0]).toMatchObject({ reason: 'Typed the wrong amount', changes: expect.arrayContaining([{ field: 'Amount', from: 500000, to: 700000 }, { field: 'Paid by', from: 'cash', to: 'upi' }]) });

    // Old entry, its reversal, and the corrected one.
    expect((await journals(ctx, 'salary_advance')).map((j) => j.lines)).toEqual([
      [['staff_advances', 500000, 0], ['cash', 0, 500000]],
      [['staff_advances', 0, 500000], ['cash', 500000, 0]],
      [['staff_advances', 700000, 0], ['bank', 0, 700000]],
    ]);

    // Entered on an earlier day: locked.
    await runWithContext({ organisationId: ctx.orgId }, async () => {
      await SalaryAdvance.updateOne({ _id: adv.id }, { recordedOn: '2020-01-01' });
    });
    const locked = await edit({ amountPaise: 100000, installmentPaise: 100000, reason: 'Too late' });
    expect(locked.body.error.code).toBe('EDIT_LOCKED');
    const list = (await api().get(`/api/v1/hr/advances?employeeId=${emp.id}`).set(bearer(ctx.t))).body.data;
    expect(list[0]).toMatchObject({ editable: false, lockedReason: expect.stringContaining('2020-01-01') });
  });
});
