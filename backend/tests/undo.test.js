import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { branchTop, dismiss, orgTop, stacks, undo, undoSetup } from './undoHelpers.js';
import { runWithContext } from '../src/core/context/requestContext.js';
import { Customer } from '../src/modules/customers/customer.model.js';
import { Role } from '../src/modules/roles/role.model.js';
import { User } from '../src/modules/users/user.model.js';
import { api, bearer } from './helpers.js';

const customer = (ctx, body) => api().post('/api/v1/customers').set(bearer(ctx.t)).send({ address: { stateCode: '19' }, ...body });

describe('undo: the stack', () => {
  it('undoes only the latest action, asks for a reason, never twice, and keeps the full history', async () => {
    const ctx = await undoSetup();
    const a = (await customer(ctx, { name: 'Asha Roy', mobile: '9876500101' })).body.data;
    const b = (await customer(ctx, { name: 'Bimal Pal', mobile: '9876500102' })).body.data;
    const edit = await api().put(`/api/v1/customers/${b.id}`).set(bearer(ctx.t)).send({ ...b, name: 'Bimal Paul', notes: 'VIP' });
    expect(edit.status).toBe(200);

    let top = await orgTop(ctx.t);
    expect(top).toMatchObject({ type: 'customer.update', title: 'Customer edited', label: 'Bimal Paul', canUndo: true, mode: 'undo', createdBy: { name: 'Test Owner' } });
    expect(top.effect).toMatch(/name/);

    // Only the newest action of a stack; a reason is required.
    const older = (await api().get('/api/v1/undo/history?status=active').set(bearer(ctx.t))).body.data.find((e) => e.type === 'customer.create' && e.label === 'Asha Roy');
    expect((await undo(ctx.t, older.id)).body.error.code).toBe('UNDO_NOT_LATEST');
    expect((await undo(ctx.t, top.id, 'no')).status).toBe(400);

    const done = await undo(ctx.t, top.id, 'Wrong name typed');
    expect(done.status).toBe(200);
    expect(done.body.data).toMatchObject({ status: 'undone', resolution: { reason: 'Wrong name typed', mode: 'undo', by: { name: 'Test Owner' } } });
    expect((await api().get(`/api/v1/customers/${b.id}`).set(bearer(ctx.t))).body.data).toMatchObject({ name: 'Bimal Pal', notes: null });
    // Twice: refused.
    expect((await undo(ctx.t, top.id)).body.error.code).toBe('UNDO_ALREADY_DONE');

    // The action before it comes up next: adding Bimal — undone by deleting him (nothing uses him yet).
    top = await orgTop(ctx.t);
    expect(top).toMatchObject({ type: 'customer.create', label: 'Bimal Pal', canUndo: true });
    expect((await undo(ctx.t, top.id)).status).toBe(200);
    expect((await api().get(`/api/v1/customers/${b.id}`).set(bearer(ctx.t))).status).toBe(404);
    expect((await orgTop(ctx.t)).label).toBe('Asha Roy');
    expect((await api().get(`/api/v1/customers/${a.id}`).set(bearer(ctx.t))).status).toBe(200);

    // Nothing is lost: the actions stay, with who undid them, when and why; the audit log has the undo too.
    const history = (await api().get('/api/v1/undo/history').set(bearer(ctx.t))).body.data;
    expect(history.map((h) => [h.type, h.status])).toEqual([
      ['customer.update', 'undone'],
      ['customer.create', 'undone'],
      ['customer.create', 'active'],
      ['branch.create', 'active'], // the setup's second branch
    ]);
    const audit = (await api().get('/api/v1/audit-logs').set(bearer(ctx.t))).body.data;
    expect(audit.filter((l) => l.action === 'undo').map((l) => l.meta.reason)).toEqual(expect.arrayContaining(['Wrong name typed', 'Entered by mistake']));
  });

  it('undoes status changes and deletes; a delete it cannot bring back safely is refused', async () => {
    const ctx = await undoSetup();
    const c = (await customer(ctx, { name: 'Chitra Sen', mobile: '9876500111' })).body.data;
    await api().patch(`/api/v1/customers/${c.id}/status`).set(bearer(ctx.t)).send({ status: 'inactive' });
    let top = await orgTop(ctx.t);
    expect(top.type).toBe('customer.status');
    expect((await undo(ctx.t, top.id)).status).toBe(200);
    expect((await api().get(`/api/v1/customers/${c.id}`).set(bearer(ctx.t))).body.data.status).toBe('active');

    expect((await api().delete(`/api/v1/customers/${c.id}`).set(bearer(ctx.t))).status).toBe(200);
    // Someone else now has her mobile: bringing her back would make two.
    const other = (await customer(ctx, { name: 'Other', mobile: '9876500111' })).body.data;
    // The newest is adding "Other"; take that back first — then the delete is undone and she is back.
    top = await orgTop(ctx.t);
    expect(top.label).toBe('Other');
    expect((await undo(ctx.t, top.id)).status).toBe(200);
    expect((await api().get(`/api/v1/customers/${other.id}`).set(bearer(ctx.t))).status).toBe(404);
    top = await orgTop(ctx.t);
    expect(top).toMatchObject({ type: 'customer.delete', canUndo: true });
    expect((await undo(ctx.t, top.id)).status).toBe(200);
    expect((await api().get(`/api/v1/customers/${c.id}`).set(bearer(ctx.t))).body.data.name).toBe('Chitra Sen');
  });

  it('an edit that moved money is not undone automatically; it can be kept (with a reason) to reach older actions', async () => {
    const ctx = await undoSetup();
    const c = (await customer(ctx, { name: 'Dipa Ghosh', mobile: '9876500121' })).body.data;
    await api().put(`/api/v1/customers/${c.id}`).set(bearer(ctx.t)).send({ ...c, openingBalancePaise: 500000 });
    const top = await orgTop(ctx.t);
    expect(top).toMatchObject({ type: 'customer.update', canUndo: false });
    expect(top.blockedBy).toMatch(/opening balance/);
    expect((await undo(ctx.t, top.id)).body.error.code).toBe('UNDO_BLOCKED');
    // Keeping it needs a reason too, and only works for an action that cannot be undone.
    expect((await dismiss(ctx.t, top.id, 'x')).status).toBe(400);
    const kept = await dismiss(ctx.t, top.id, 'Old due is right');
    expect(kept.body.data).toMatchObject({ status: 'dismissed', resolution: { reason: 'Old due is right' } });
    // Next: adding her. Her old due is in the ledger now, so she cannot simply be removed either.
    const next = await orgTop(ctx.t);
    expect(next).toMatchObject({ type: 'customer.create', canUndo: false });
    expect(next.blockedBy).toMatch(/ledger/);
  });

  it('an action already reversed by hand is skipped', async () => {
    const ctx = await undoSetup();
    await customer(ctx, { name: 'Esha Paul', mobile: '9876500131' });
    const firoz = (await customer(ctx, { name: 'Firoz Ali', mobile: '9876500132' })).body.data;
    // Firoz is removed some way that leaves no Undo record (as a cancelled invoice does for its sale).
    await runWithContext({ organisationId: ctx.me.organisation.id }, async () => {
      await Customer.updateOne({ _id: firoz.id }, { $set: { isDeleted: true } });
    });
    // His add is already reversed: skipped (marked superseded), and Esha's add is the latest.
    const top = await orgTop(ctx.t);
    expect(top).toMatchObject({ type: 'customer.create', label: 'Esha Paul' });
    // Something that can be undone is undone, not kept.
    expect((await dismiss(ctx.t, top.id)).body.error.code).toBe('UNDO_POSSIBLE');
    const history = (await api().get('/api/v1/undo/history').set(bearer(ctx.t))).body.data;
    expect(history.find((h) => h.label === 'Firoz Ali')).toMatchObject({ status: 'superseded', resolution: { reason: 'Already deleted' } });
  });
});

describe('undo: who can undo what', () => {
  it('keeps organisations apart and keeps branch users out of the organisation’s stack', async () => {
    const ctx = await undoSetup();
    const other = await undoSetup();
    await customer(ctx, { name: 'Gita Roy', mobile: '9876500141' });
    const top = await orgTop(ctx.t);
    // Another organisation cannot see it or undo it.
    expect((await api().get(`/api/v1/undo/${top.id}`).set(bearer(other.t))).status).toBe(404);
    expect((await undo(other.t, top.id)).status).toBe(404);
    expect((await api().get('/api/v1/undo/history').set(bearer(other.t))).body.data.find((h) => h.id === top.id)).toBeUndefined();
    // A branch user has no organisation stack, and cannot undo on it.
    const theirs = await stacks(ctx.bt);
    expect(theirs.map((s) => s.scope)).toEqual(['branch']);
    expect((await undo(ctx.bt, top.id)).status).toBe(403);
    expect((await api().get('/api/v1/undo/history').set(bearer(ctx.bt))).body.data).toEqual([]);
  });

  it('puts what a branch user adds on their branch’s stack, which the owner can also undo', async () => {
    const ctx = await undoSetup();
    const c = (await api().post('/api/v1/customers').set(bearer(ctx.bt)).send({ name: 'Hari Das', mobile: '9876500151', address: { stateCode: '19' } })).body.data;
    // Not on the organisation's stack (that holds only the setup's branch).
    expect((await orgTop(ctx.t)).type).toBe('branch.create');
    const top = await branchTop(ctx.bt, ctx.branchId);
    expect(top).toMatchObject({ type: 'customer.create', scope: 'branch', branch: { name: 'Salt Lake' } });
    expect((await branchTop(ctx.t, ctx.branchId)).id).toBe(top.id);
    expect((await undo(ctx.t, top.id)).status).toBe(200);
    expect((await api().get(`/api/v1/customers/${c.id}`).set(bearer(ctx.t))).status).toBe(404);
  });

  it('needs the Undo permission and the permission the action itself needs', async () => {
    const ctx = await undoSetup();
    await customer(ctx, { name: 'Indu Sen', mobile: '9876500161' });
    const top = await orgTop(ctx.t);
    const email = `nu${Date.now()}@abc.local`;
    await runWithContext({ organisationId: ctx.me.organisation.id }, async () => {
      const role = await Role.create({ key: `undo_${Date.now()}`, name: 'Undo only', permissions: ['undo.view', 'undo.undo', 'customer.view'] });
      const plain = await Role.create({ key: `plain_${Date.now()}`, name: 'No undo', permissions: ['customer.view', 'customer.delete'] });
      await User.create({ name: 'Undo Only', email, passwordHash: await bcrypt.hash('Secret123', 4), roleIds: [role._id], branchAccess: { all: true, branchIds: [] } });
      await User.create({ name: 'No Undo', email: `x${email}`, passwordHash: await bcrypt.hash('Secret123', 4), roleIds: [plain._id], branchAccess: { all: true, branchIds: [] } });
    });
    const ut = (await api().post('/api/v1/auth/login').send({ email, password: 'Secret123' })).body.data.accessToken;
    const nt = (await api().post('/api/v1/auth/login').send({ email: `x${email}`, password: 'Secret123' })).body.data.accessToken;
    expect((await api().get('/api/v1/undo/stacks').set(bearer(nt))).status).toBe(403);
    expect((await undo(nt, top.id)).status).toBe(403);
    // Has Undo, but not customer.delete (which taking back an add needs).
    expect((await orgTop(ut)).canUndo).toBe(false);
    expect((await undo(ut, top.id)).body.error.code).toBe('UNDO_FORBIDDEN');
  });
});
