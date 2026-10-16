import { describe, expect, it } from 'vitest';
import { api, bearer, registerOrg } from './helpers.js';

async function setup() {
  const { token: t } = await registerOrg();
  const me = (await api().get('/api/v1/auth/me').set(bearer(t))).body.data;
  const ho = me.branches[0].id;
  const b2 = (await api().post('/api/v1/branches').set(bearer(t)).send({ code: 'B2', name: 'Salt Lake', address: {} })).body.data;
  const b2id = String(b2.id ?? b2._id);
  const hire = (name, branchId) =>
    api().post('/api/v1/hr/employees').set(bearer(t)).send({ name, mobile: `97${Math.floor(10000000 + Math.random() * 89999999)}`, designation: 'Salesman', branchId, joiningDate: '2025-01-01', basicPaise: 1000000, allowancePaise: 0 });
  await hire('Head Office Staff', ho);
  await hire('Salt Lake Staff', b2id);
  const names = async (headers = {}) => (await api().get('/api/v1/hr/employees').set({ ...bearer(t), ...headers })).body.data.map((e) => e.name).sort();
  return { t, ho, b2id, names };
}

describe('navbar branch filter on list pages', () => {
  it('shows the head office by default, one branch when chosen, or all branches', async () => {
    const ctx = await setup();
    expect(await ctx.names({ 'X-Branch-Id': ctx.ho })).toEqual(['Head Office Staff']);
    expect(await ctx.names({ 'X-Branch-Id': ctx.b2id })).toEqual(['Salt Lake Staff']);
    expect(await ctx.names({ 'X-Branch-Id': ctx.ho, 'X-Branch-View': 'all' })).toEqual(['Head Office Staff', 'Salt Lake Staff']);
    // No header: the working branch is the head office.
    expect(await ctx.names()).toEqual(['Head Office Staff']);
    // A page's own branch choice still wins.
    const own = (await api().get(`/api/v1/hr/employees?branchId=${ctx.b2id}`).set({ ...bearer(ctx.t), 'X-Branch-View': 'all' })).body.data.map((e) => e.name);
    expect(own).toEqual(['Salt Lake Staff']);
  });
});
