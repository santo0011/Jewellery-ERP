import mongoose from 'mongoose';
import { describe, expect, it } from 'vitest';
import { runWithContext } from '../src/core/context/requestContext.js';
import { TenantScopeError } from '../src/core/tenancy/tenantPlugin.js';
import { Branch } from '../src/modules/branches/branch.model.js';
import { api, bearer, registerOrg } from './helpers.js';

const branchBody = (code) => ({ code, name: `Branch ${code}`, address: { city: 'Kolkata', stateCode: '19' } });

describe('tenant isolation (API)', () => {
  it('an organisation cannot read, edit or deactivate another organisation’s records', async () => {
    const a = await registerOrg();
    const b = await registerOrg();

    const created = await api().post('/api/v1/branches').set(bearer(a.token)).send(branchBody('KOL1'));
    expect(created.status).toBe(201);
    const branchId = created.body.data._id;

    expect((await api().get(`/api/v1/branches/${branchId}`).set(bearer(b.token))).status).toBe(404);
    expect((await api().put(`/api/v1/branches/${branchId}`).set(bearer(b.token)).send(branchBody('HACK'))).status).toBe(404);
    expect((await api().patch(`/api/v1/branches/${branchId}/status`).set(bearer(b.token)).send({ status: 'inactive' })).status).toBe(404);

    const listB = await api().get('/api/v1/branches').set(bearer(b.token));
    expect(listB.body.data.map((x) => x._id)).not.toContain(branchId);
    expect(listB.body.meta.total).toBe(1);

    const rolesA = await api().get('/api/v1/roles').set(bearer(a.token));
    const roleA = rolesA.body.data[0].id;
    expect((await api().get(`/api/v1/roles/${roleA}`).set(bearer(b.token))).status).toBe(404);
  });

  it('branch codes are unique per organisation, not globally', async () => {
    const a = await registerOrg();
    const b = await registerOrg();
    expect((await api().post('/api/v1/branches').set(bearer(a.token)).send(branchBody('SAME'))).status).toBe(201);
    expect((await api().post('/api/v1/branches').set(bearer(b.token)).send(branchBody('HO'))).status).toBe(409);
    expect((await api().post('/api/v1/branches').set(bearer(b.token)).send(branchBody('SAME'))).status).toBe(201);
  });

  it('ignores organisationId supplied by the client', async () => {
    const a = await registerOrg();
    const b = await registerOrg();
    const meB = await api().get('/api/v1/auth/me').set(bearer(b.token));
    const res = await api()
      .post('/api/v1/branches')
      .set(bearer(a.token))
      .send({ ...branchBody('INJ'), organisationId: meB.body.data.organisation.id });
    expect(res.status).toBe(201);
    const listB = await api().get('/api/v1/branches').set(bearer(b.token));
    expect(listB.body.data.map((x) => x.code)).not.toContain('INJ');
  });

  it('rejects a branch header the user has no access to', async () => {
    const a = await registerOrg();
    const b = await registerOrg();
    const meB = await api().get('/api/v1/auth/me').set(bearer(b.token));
    const res = await api().get('/api/v1/auth/me').set(bearer(a.token)).set('X-Branch-Id', meB.body.data.branches[0].id);
    expect(res.status).toBe(403);
  });
});

describe('tenant plugin', () => {
  it('throws when querying tenant data without a context', async () => {
    await expect(Branch.find({})).rejects.toBeInstanceOf(TenantScopeError);
    await expect(Branch.create({ code: 'X1', name: 'No tenant' })).rejects.toBeInstanceOf(TenantScopeError);
  });

  it('blocks explicit cross-tenant filters and writes', async () => {
    const orgA = new mongoose.Types.ObjectId();
    const orgB = new mongoose.Types.ObjectId();
    await runWithContext({ organisationId: String(orgA) }, async () => {
      await expect(Branch.find({ organisationId: orgB })).rejects.toBeInstanceOf(TenantScopeError);
      await expect(Branch.create({ organisationId: orgB, code: 'X2', name: 'Cross' })).rejects.toBeInstanceOf(TenantScopeError);
    });
  });

  it('scopes aggregates to the current tenant', async () => {
    const orgA = new mongoose.Types.ObjectId();
    const orgB = new mongoose.Types.ObjectId();
    await runWithContext({ organisationId: String(orgA) }, () => Branch.create({ code: 'AG1', name: 'A' }));
    await runWithContext({ organisationId: String(orgB) }, () => Branch.create({ code: 'AG1', name: 'B' }));
    const rows = await runWithContext({ organisationId: String(orgA) }, async () => await Branch.aggregate([{ $match: { code: 'AG1' } }]));
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('A');
  });
});
