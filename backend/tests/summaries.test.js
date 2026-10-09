import { describe, expect, it } from 'vitest';
import { api, bearer, registerOrg } from './helpers.js';

describe('list summary cards', () => {
  it('every main list returns its header figures', async () => {
    const { token: t } = await registerOrg();
    const me = (await api().get('/api/v1/auth/me').set(bearer(t))).body.data;
    const ho = me.branches[0].id;
    const ring = (await api().get('/api/v1/categories').set(bearer(t))).body.data.find((c) => c.name === 'Ring');
    await api().post('/api/v1/customers').set(bearer(t)).send({ name: 'Old Due', mobile: '9830012121', address: {}, openingBalancePaise: 50000 });
    await api().post('/api/v1/suppliers').set(bearer(t)).send({ companyName: 'Kolkata Bullion', mobile: '9830011111', address: {}, supplies: ['gold'] });
    const p = (await api().post('/api/v1/products').set(bearer(t)).send({ name: 'Ring', categoryId: ring.id, jewelleryType: 'plain_gold', metal: 'gold', purity: 916, grossWeightMg: 5000, wastage: { mode: 'none', value: 0 }, making: { type: 'fixed', value: 1 }, costPricePaise: 4000000, branchId: ho })).body.data;
    await api().post('/api/v1/products').set(bearer(t)).send({ name: 'Draft', categoryId: ring.id, jewelleryType: 'plain_gold', metal: 'gold', purity: 916, grossWeightMg: 1000, wastage: { mode: 'none', value: 0 }, making: { type: 'fixed', value: 1 }, branchId: ho });
    await api().post('/api/v1/inventory/opening').set(bearer(t)).send({ branchId: ho, productIds: [p.id] });
    await api().post('/api/v1/hr/employees').set(bearer(t)).send({ name: 'Staff', mobile: '9712345678', designation: 'Sales', branchId: ho, joiningDate: '2025-01-01', basicPaise: 2000000, allowancePaise: 500000 });

    const summary = async (url) => (await api().get(url).set(bearer(t))).body.meta.summary;
    expect(await summary('/api/v1/products')).toMatchObject({ inStock: { pieces: 1, grossMg: 5000, costPaise: 4000000 }, drafts: 1 });
    expect(await summary('/api/v1/customers')).toMatchObject({ total: 1, newThisMonth: 1, duePaise: 50000, owing: 1 });
    expect(await summary('/api/v1/suppliers')).toMatchObject({ active: 1, duePaise: 0 });
    expect(await summary('/api/v1/orders')).toMatchObject({ open: 0, overdue: 0 });
    expect(await summary('/api/v1/hr/employees')).toMatchObject({ working: 1, left: 0, salaryPaise: 2500000, advancePaise: 0 });
  });
});
