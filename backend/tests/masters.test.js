import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { runWithContext } from '../src/core/context/requestContext.js';
import { Product } from '../src/modules/products/product.model.js';
import { Role } from '../src/modules/roles/role.model.js';
import { User } from '../src/modules/users/user.model.js';
import { api, bearer, registerOrg } from './helpers.js';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');

async function staffWith(ownerToken, permissions, branchAccess = { all: true, branchIds: [] }) {
  const me = (await api().get('/api/v1/auth/me').set(bearer(ownerToken))).body.data;
  const email = `s${Date.now()}${Math.random().toString(36).slice(2, 6)}@example.com`;
  await runWithContext({ organisationId: me.organisation.id }, async () => {
    const role = await Role.create({ key: `k${Date.now()}${Math.random()}`, name: `R ${email}`, permissions });
    await User.create({ name: 'Staff', email, passwordHash: await bcrypt.hash('Secret123', 4), roleIds: [role._id], branchAccess });
  });
  return (await api().post('/api/v1/auth/login').send({ email, password: 'Secret123' })).body.data.accessToken;
}

const customer = (o = {}) => ({ name: 'Meera Banerjee', mobile: '9830098300', address: { city: 'Kolkata', stateCode: '19' }, ...o });

describe('customers', () => {
  it('creates with sequential codes and blocks duplicate mobiles', async () => {
    const { token } = await registerOrg();
    const a = await api().post('/api/v1/customers').set(bearer(token)).send(customer({ pan: 'abcde1234f', dob: '1990-05-14', kyc: { type: 'aadhaar', number: '1234 5678 9012', verified: true } }));
    expect(a.status).toBe(201);
    expect(a.body.data).toMatchObject({ code: 'C00001', pan: 'ABCDE1234F', dob: '1990-05-14', kyc: { verified: true } });

    const b = await api().post('/api/v1/customers').set(bearer(token)).send(customer({ name: 'Other', mobile: '9830098301' }));
    expect(b.body.data.code).toBe('C00002');

    const dup = await api().post('/api/v1/customers').set(bearer(token)).send(customer({ name: 'Dup' }));
    expect(dup.status).toBe(409);
    expect(dup.body.error.details[0].message).toContain('Meera Banerjee');

    const future = await api().post('/api/v1/customers').set(bearer(token)).send(customer({ mobile: '9830098302', dob: '2999-01-01' }));
    expect(future.status).toBe(400);
  });

  it('masks KYC for users without customer.viewKyc and keeps it intact on their edits', async () => {
    const owner = await registerOrg();
    const created = await api().post('/api/v1/customers').set(bearer(owner.token)).send(customer({ pan: 'ABCDE1234F', kyc: { type: 'pan', number: 'ABCDE1234F' } }));
    const id = created.body.data.id;
    const staff = await staffWith(owner.token, ['customer.view', 'customer.edit']);

    const seen = await api().get(`/api/v1/customers/${id}`).set(bearer(staff));
    expect(seen.body.data.pan).toBe('••••••234F');
    expect(seen.body.data.kycVisible).toBe(false);

    const edited = await api().put(`/api/v1/customers/${id}`).set(bearer(staff)).send(customer({ name: 'Meera B.' }));
    expect(edited.status).toBe(200);
    const full = await api().get(`/api/v1/customers/${id}`).set(bearer(owner.token));
    expect(full.body.data).toMatchObject({ name: 'Meera B.', pan: 'ABCDE1234F', kyc: { number: 'ABCDE1234F' } });

    expect((await api().delete(`/api/v1/customers/${id}`).set(bearer(staff))).status).toBe(403);
  });

  it('searches, filters, soft-deletes and frees the mobile number', async () => {
    const { token } = await registerOrg();
    const c = await api().post('/api/v1/customers').set(bearer(token)).send(customer({ segment: 'vip' }));
    expect((await api().get('/api/v1/customers?q=98300').set(bearer(token))).body.meta.total).toBe(1);
    expect((await api().get('/api/v1/customers?segment=regular').set(bearer(token))).body.meta.total).toBe(0);
    expect((await api().delete(`/api/v1/customers/${c.body.data.id}`).set(bearer(token))).status).toBe(200);
    expect((await api().get('/api/v1/customers').set(bearer(token))).body.meta.total).toBe(0);
    expect((await api().post('/api/v1/customers').set(bearer(token)).send(customer())).status).toBe(201);
  });
});

describe('suppliers', () => {
  it('validates bank details and prevents duplicate GSTIN', async () => {
    const { token } = await registerOrg();
    const body = { companyName: 'Kolkata Bullion Co', mobile: '9830011111', gstin: '19AABCU9603R1ZM', address: {}, supplies: ['gold'], bankDetails: { ifsc: 'sbin0001234', accountNumber: '12345678901' } };
    const s = await api().post('/api/v1/suppliers').set(bearer(token)).send(body);
    expect(s.status).toBe(201);
    expect(s.body.data).toMatchObject({ code: 'S0001', bankDetails: { ifsc: 'SBIN0001234' } });

    expect((await api().post('/api/v1/suppliers').set(bearer(token)).send({ ...body, companyName: 'Clone' })).status).toBe(409);
    const badIfsc = await api().post('/api/v1/suppliers').set(bearer(token)).send({ ...body, gstin: '', bankDetails: { ifsc: 'BAD' } });
    expect(badIfsc.body.error.details[0].path).toBe('bankDetails.ifsc');
  });
});

describe('categories', () => {
  it('seeds standard categories, supports one level of subcategories and blocks deleting used ones', async () => {
    const { token } = await registerOrg();
    const list = (await api().get('/api/v1/categories').set(bearer(token))).body.data;
    expect(list.map((c) => c.name)).toEqual(expect.arrayContaining(['Ring', 'Necklace', 'Mangalsutra', 'Silver Jewellery']));
    const ring = list.find((c) => c.name === 'Ring');

    const sub = await api().post('/api/v1/categories').set(bearer(token)).send({ name: 'Couple Rings', parentId: ring.id });
    expect(sub.status).toBe(201);
    const deep = await api().post('/api/v1/categories').set(bearer(token)).send({ name: 'Too Deep', parentId: sub.body.data.id });
    expect(deep.status).toBe(400);
    expect((await api().post('/api/v1/categories').set(bearer(token)).send({ name: 'ring' })).status).toBe(409);
    expect((await api().delete(`/api/v1/categories/${ring.id}`).set(bearer(token))).status).toBe(409);

    const again = await api().post('/api/v1/categories/defaults').set(bearer(token));
    expect(again.body.data.added).toBe(0);
  });
});

describe('products', () => {
  async function setup() {
    const owner = await registerOrg();
    const me = (await api().get('/api/v1/auth/me').set(bearer(owner.token))).body.data;
    const categories = (await api().get('/api/v1/categories').set(bearer(owner.token))).body.data;
    return { owner, branchId: me.branches[0].id, ring: categories.find((c) => c.name === 'Ring'), chain: categories.find((c) => c.name === 'Chain') };
  }

  const product = (ctx, o = {}) => ({
    name: '22K Diamond Ring',
    categoryId: ctx.ring.id,
    jewelleryType: 'studded_gold',
    metal: 'gold',
    purity: 916,
    grossWeightMg: 6250,
    stones: [{ type: 'diamond', count: 12, weight: 250, weightUnit: 'ct', ratePaise: 6500000 }],
    wastage: { mode: 'percent', value: 800 },
    making: { type: 'per_gram', value: 60000 },
    costPricePaise: 4200000,
    branchId: ctx.branchId,
    ...o,
  });

  it('creates a draft with SKU, derived weights and default HSN', async () => {
    const ctx = await setup();
    const res = await api().post('/api/v1/products').set(bearer(ctx.owner.token)).send(product(ctx, { huid: 'ab12cd' }));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      sku: 'JW000001',
      barcode: 'JW000001',
      status: 'draft',
      stoneWeightMg: 50,
      netWeightMg: 6200,
      fineWeightMg: 5679,
      hsnCode: '7113',
      huid: 'AB12CD',
      category: { name: 'Ring' },
      costPricePaise: 4200000,
    });
    const dupHuid = await api().post('/api/v1/products').set(bearer(ctx.owner.token)).send(product(ctx, { huid: 'AB12CD' }));
    expect(dupHuid.status).toBe(409);
  });

  it('rejects purities disabled in settings and foreign references', async () => {
    const ctx = await setup();
    const disabled = await api().post('/api/v1/products').set(bearer(ctx.owner.token)).send(product(ctx, { purity: 999 }));
    expect(disabled.status).toBe(400);
    expect(disabled.body.error.details[0].path).toBe('purity');

    const other = await setup();
    const foreign = await api().post('/api/v1/products').set(bearer(ctx.owner.token)).send(product(ctx, { categoryId: other.ring.id }));
    expect(foreign.body.error.details[0].path).toBe('categoryId');

    const wrongSub = await api().post('/api/v1/categories').set(bearer(ctx.owner.token)).send({ name: 'Rope', parentId: ctx.chain.id });
    const mismatch = await api().post('/api/v1/products').set(bearer(ctx.owner.token)).send(product(ctx, { subcategoryId: wrongSub.body.data.id }));
    expect(mismatch.body.error.details[0].path).toBe('subcategoryId');
  });

  it('hides cost price from users without product.viewCost and preserves it on their edits', async () => {
    const ctx = await setup();
    const id = (await api().post('/api/v1/products').set(bearer(ctx.owner.token)).send(product(ctx))).body.data.id;
    const staff = await staffWith(ctx.owner.token, ['product.view', 'product.edit']);
    const seen = await api().get(`/api/v1/products/${id}`).set(bearer(staff));
    expect(seen.body.data.costPricePaise).toBeUndefined();
    await api().put(`/api/v1/products/${id}`).set(bearer(staff)).send(product(ctx, { name: 'Renamed', costPricePaise: 1 }));
    const owner = await api().get(`/api/v1/products/${id}`).set(bearer(ctx.owner.token));
    expect(owner.body.data).toMatchObject({ name: 'Renamed', costPricePaise: 4200000 });
  });

  it('locks weights once stocked and only deletes drafts', async () => {
    const ctx = await setup();
    const created = (await api().post('/api/v1/products').set(bearer(ctx.owner.token)).send(product(ctx))).body.data;
    await Product.updateOne({ _id: created.id }, { $set: { status: 'in_stock' } }).setOptions({ skipTenant: true });

    const heavier = await api().put(`/api/v1/products/${created.id}`).set(bearer(ctx.owner.token)).send(product(ctx, { grossWeightMg: 7000 }));
    expect(heavier.status).toBe(409);
    expect(heavier.body.error.code).toBe('PRODUCT_LOCKED');
    const renamed = await api().put(`/api/v1/products/${created.id}`).set(bearer(ctx.owner.token)).send(product(ctx, { name: 'Price tweak', making: { type: 'per_gram', value: 70000 } }));
    expect(renamed.status).toBe(200);
    expect((await api().delete(`/api/v1/products/${created.id}`).set(bearer(ctx.owner.token))).status).toBe(409);
  });

  it('scopes products to branches the user can access', async () => {
    const ctx = await setup();
    const second = (await api().post('/api/v1/branches').set(bearer(ctx.owner.token)).send({ code: 'B2', name: 'Second', address: {} })).body.data;
    await api().post('/api/v1/products').set(bearer(ctx.owner.token)).send(product(ctx));
    const atSecond = (await api().post('/api/v1/products').set(bearer(ctx.owner.token)).send(product(ctx, { name: 'Second branch ring', branchId: second._id }))).body.data;

    const staff = await staffWith(ctx.owner.token, ['product.view', 'product.create'], { all: false, branchIds: [second._id] });
    const list = await api().get('/api/v1/products').set(bearer(staff));
    expect(list.body.data.map((p) => p.id)).toEqual([atSecond.id]);
    const create = await api().post('/api/v1/products').set(bearer(staff)).send(product(ctx));
    expect(create.body.error.details[0].path).toBe('branchId');
  });

  it('manages product images and serves them with permission checks', async () => {
    const ctx = await setup();
    const id = (await api().post('/api/v1/products').set(bearer(ctx.owner.token)).send(product(ctx))).body.data.id;
    const one = await api().post(`/api/v1/products/${id}/images`).set(bearer(ctx.owner.token)).attach('image', PNG, 'a.png');
    const two = await api().post(`/api/v1/products/${id}/images`).set(bearer(ctx.owner.token)).attach('image', PNG, 'b.png');
    expect(two.body.data.images).toHaveLength(2);
    const second = two.body.data.images[1];

    const primary = await api().patch(`/api/v1/products/${id}/images/${second}/primary`).set(bearer(ctx.owner.token));
    expect(primary.body.data.images[0]).toBe(second);

    const file = await api().get(`/api/v1/files/${second}`).set(bearer(ctx.owner.token));
    expect(file.headers['content-type']).toBe('image/png');
    const other = await registerOrg();
    expect((await api().get(`/api/v1/files/${second}`).set(bearer(other.token))).status).toBe(404);
    const noProducts = await staffWith(ctx.owner.token, ['customer.view']);
    expect((await api().get(`/api/v1/files/${second}`).set(bearer(noProducts))).status).toBe(403);

    const removed = await api().delete(`/api/v1/products/${id}/images/${one.body.data.images[0]}`).set(bearer(ctx.owner.token));
    expect(removed.body.data.images).toEqual([second]);
  });
});
