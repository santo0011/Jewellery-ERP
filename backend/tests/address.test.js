import bcrypt from 'bcryptjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Branch } from '../src/modules/branches/branch.model.js';
import { PlatformAdmin } from '../src/modules/platform/platformAdmin.model.js';
import { api, bearer, registerOrg } from './helpers.js';

async function superAdmin() {
  const email = `sa${Date.now()}${Math.random().toString(36).slice(2, 6)}@platform.local`;
  await PlatformAdmin.create({ name: 'Platform Owner', email, passwordHash: await bcrypt.hash('Admin1234', 4) });
  return (await api().post('/api/v1/auth/login').send({ email, password: 'Admin1234' })).body.data.accessToken;
}

// India Post's answer for a PIN, as its API returns it.
const indiaPost = (offices) => [{ Status: offices.length ? 'Success' : 'Error', PostOffice: offices.length ? offices : null }];
const office = (Name, extra = {}) => ({ Name, BranchType: 'Sub Post Office', DeliveryStatus: 'Delivery', Block: 'Kolkata', District: 'Kolkata', State: 'West Bengal', Country: 'India', Pincode: '700012', ...extra });

const realFetch = globalThis.fetch;
const stubIndiaPost = (impl) => {
  globalThis.fetch = vi.fn(async (url, opts) => (String(url).startsWith('https://api.postalpincode.in/') ? impl(url) : realFetch(url, opts)));
};
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('PIN code look-up', () => {
  it('returns post offices, city, district and the GST state code', async () => {
    const token = await superAdmin();
    stubIndiaPost(async () => ({ ok: true, json: async () => indiaPost([office('Bowbazar'), office('Lalbazar', { DeliveryStatus: 'Non-Delivery' })]) }));
    const res = await api().get('/api/v1/platform/pincode/700012').set(bearer(token));
    expect(res.body.data).toMatchObject({ pincode: '700012', city: 'Kolkata', district: 'Kolkata', state: 'West Bengal', stateCode: '19' });
    expect(res.body.data.postOffices.map((o) => o.name)).toEqual(['Bowbazar', 'Lalbazar']);
  });

  it('says when a PIN is unknown or the service cannot be reached', async () => {
    const token = await superAdmin();
    stubIndiaPost(async () => ({ ok: true, json: async () => indiaPost([]) }));
    expect((await api().get('/api/v1/platform/pincode/799999').set(bearer(token))).body.error.code).toBe('PIN_NOT_FOUND');
    stubIndiaPost(async () => {
      throw new Error('network down');
    });
    const down = await api().get('/api/v1/platform/pincode/799998').set(bearer(token));
    expect(down.status).toBe(503);
    expect(down.body.error.code).toBe('PIN_LOOKUP_UNAVAILABLE');
    expect((await api().get('/api/v1/platform/pincode/012345').set(bearer(token))).status).toBe(400);
  });
});

describe('organisation address', () => {
  it('saves the full address on the organisation and its head office', async () => {
    const token = await superAdmin();
    const address = { line1: 'Shop 12, Gold Plaza', line2: 'Bowbazar Street', landmark: 'Opposite City Mall', postOffice: 'Bowbazar', city: 'Kolkata', district: 'Kolkata', pincode: '700012' };
    const body = { organisationName: `Address Jewellers ${Date.now()}`, ownerName: 'Rina Paul', email: `addr${Date.now()}@abc.local`, mobile: '9830012345', stateCode: '19', address };
    const created = await api().post('/api/v1/platform/organisations').set(bearer(token)).send(body);
    expect(created.status).toBe(201);
    expect(created.body.data.address).toMatchObject({ ...address, stateCode: '19' });
    const ho = await Branch.findOne({ organisationId: created.body.data.id, isHeadOffice: true }).setOptions({ skipTenant: true }).lean();
    expect(ho.address).toMatchObject({ ...address, stateCode: '19' });

    const bad = await api().post('/api/v1/platform/organisations').set(bearer(token)).send({ ...body, email: `x${Date.now()}@abc.local`, address: { ...address, pincode: '12' } });
    expect(bad.body.error.details.map((d) => d.path)).toContain('address.pincode');
  });
});

describe('editing the organisation address', () => {
  it('lets the Super Admin edit every address field, records each change, and keeps it when not sent', async () => {
    const token = await superAdmin();
    const body = { organisationName: `Edit Address ${Date.now()}`, ownerName: 'Rina Paul', email: `edit${Date.now()}@abc.local`, mobile: '9830012345', stateCode: '19', address: { line1: 'Shop 1', pincode: '700012', city: 'Kolkata' } };
    const org = (await api().post('/api/v1/platform/organisations').set(bearer(token)).send(body)).body.data;

    const address = { line1: 'Shop 7, Ratan Market', line2: 'MG Road', landmark: 'Near Metro Gate 2', postOffice: 'Andheri East', city: 'Mumbai', district: 'Mumbai Suburban', pincode: '400069' };
    const edit = { organisationName: body.organisationName, email: body.email, mobile: body.mobile, stateCode: '27', address };
    const res = await api().patch(`/api/v1/platform/organisations/${org.id}`).set(bearer(token)).send(edit);
    expect(res.status).toBe(200);
    expect(res.body.data.address).toMatchObject({ ...address, stateCode: '27' });
    expect(res.body.data.stateCode).toBe('27');

    const history = (await api().get(`/api/v1/platform/organisations/${org.id}/history`).set(bearer(token))).body.data;
    const labels = history[0].changes.map((c) => c.label);
    expect(labels).toEqual(expect.arrayContaining(['House / shop', 'Area / street', 'Landmark', 'Post office', 'City', 'District', 'PIN code', 'State']));

    // An edit without an address leaves it as it is.
    const { address: _ignored, ...withoutAddress } = edit;
    const kept = (await api().patch(`/api/v1/platform/organisations/${org.id}`).set(bearer(token)).send({ ...withoutAddress, mobile: '9830099999' })).body.data;
    expect(kept.address).toMatchObject(address);
  });

  it('lets the organisation edit its own address with the same fields and look up PIN codes', async () => {
    const { token } = await registerOrg();
    const address = { line1: 'Shop 3', line2: 'Bowbazar Street', landmark: 'Near Lalbazar', postOffice: 'Bowbazar', city: 'Kolkata', district: 'Kolkata', stateCode: '19', pincode: '700012' };
    const res = await api().patch('/api/v1/organisation').set(bearer(token)).send({ name: 'Own Address Jewellers', timezone: 'Asia/Kolkata', address });
    expect(res.status).toBe(200);
    expect((await api().get('/api/v1/organisation').set(bearer(token))).body.data.address).toMatchObject(address);

    stubIndiaPost(async () => ({ ok: true, json: async () => indiaPost([office('Bowbazar')]) }));
    expect((await api().get('/api/v1/organisation/pincode/700012').set(bearer(token))).body.data).toMatchObject({ stateCode: '19', district: 'Kolkata' });
  });
});

describe('organisation page details', () => {
  it('returns everything stored about the organisation', async () => {
    const token = await superAdmin();
    const body = { organisationName: `Detail Jewellers ${Date.now()}`, ownerName: 'Rina Paul', email: `detail${Date.now()}@abc.local`, mobile: '9830012345', stateCode: '19' };
    const created = (await api().post('/api/v1/platform/organisations').set(bearer(token)).send(body)).body.data;
    const org = (await api().get(`/api/v1/platform/organisations/${created.id}`).set(bearer(token))).body.data;
    expect(org.details).toMatchObject({ legalName: null, pan: null, currency: 'INR', timezone: 'Asia/Kolkata', fyStartMonth: 4, hasLogo: false, createdBy: { kind: 'admin', name: 'Platform Owner' } });
    expect(org).toMatchObject({ slug: expect.any(String), email: body.email, phone: body.mobile, owner: { name: 'Rina Paul', email: body.email } });
  });
});

describe('organisation and head office share one address', () => {
  const addr = (o = {}) => ({ line1: 'Shop 9', line2: 'College Street', landmark: 'Near Coffee House', postOffice: 'College Street', city: 'Kolkata', district: 'Kolkata', pincode: '700073', ...o });

  it('keeps them in step whichever place saves it', async () => {
    const token = await superAdmin();
    const body = { organisationName: `Sync Jewellers ${Date.now()}`, ownerName: 'Rina Paul', email: `sync${Date.now()}@abc.local`, mobile: '9830012345', stateCode: '19', address: addr() };
    const org = (await api().post('/api/v1/platform/organisations').set(bearer(token)).send(body)).body.data;
    const owner = (await api().post('/api/v1/auth/login').send({ email: body.email, password: org.loginEmail.otp })).body.data.accessToken;
    await api().post('/api/v1/auth/change-password').set(bearer(owner)).send({ currentPassword: org.loginEmail.otp, newPassword: 'Owner1234' });
    const t = (await api().post('/api/v1/auth/login').send({ email: body.email, password: 'Owner1234' })).body.data.accessToken;
    const headOffice = async () => (await api().get('/api/v1/branches').set(bearer(t))).body.data.find((b) => b.isHeadOffice);
    const orgAddress = async () => (await api().get('/api/v1/organisation').set(bearer(t))).body.data.address;

    // 1. Super Admin edits → head office follows.
    const edit = { organisationName: body.organisationName, email: body.email, mobile: body.mobile, stateCode: '19', address: addr({ line1: 'Shop 10' }) };
    await api().patch(`/api/v1/platform/organisations/${org.id}`).set(bearer(token)).send(edit);
    expect((await headOffice()).address).toMatchObject({ line1: 'Shop 10', landmark: 'Near Coffee House', stateCode: '19' });

    // 2. The organisation edits its own address → head office follows.
    await api().patch('/api/v1/organisation').set(bearer(t)).send({ name: body.organisationName, timezone: 'Asia/Kolkata', address: { ...addr({ line1: 'Shop 11' }), stateCode: '19' } });
    expect((await headOffice()).address).toMatchObject({ line1: 'Shop 11' });

    // 3. The head office branch is edited → the organisation (and the Super Admin's view) follows, with history.
    const ho = await headOffice();
    const upd = await api().put(`/api/v1/branches/${ho._id ?? ho.id}`).set(bearer(t)).send({ code: ho.code, name: ho.name, address: { ...addr({ line1: 'Shop 12', landmark: 'Opposite Presidency' }), stateCode: '19' } });
    expect(upd.status).toBe(200);
    expect(await orgAddress()).toMatchObject({ line1: 'Shop 12', landmark: 'Opposite Presidency' });
    const adminView = (await api().get(`/api/v1/platform/organisations/${org.id}`).set(bearer(token))).body.data;
    expect(adminView.address).toMatchObject({ line1: 'Shop 12' });
    const history = (await api().get('/api/v1/organisation/history').set(bearer(t))).body.data;
    expect(history[0].changes).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'address.line1', to: 'Shop 12' })]));

    // Another branch's address never touches the organisation.
    const b2 = (await api().post('/api/v1/branches').set(bearer(t)).send({ code: 'B2', name: 'Salt Lake', address: { line1: 'Elsewhere' } })).body.data;
    await api().put(`/api/v1/branches/${b2._id ?? b2.id}`).set(bearer(t)).send({ code: 'B2', name: 'Salt Lake', address: { line1: 'Still elsewhere' } });
    expect((await orgAddress()).line1).toBe('Shop 12');
  });

  it('fills in a missing head office address at start-up', async () => {
    const token = await superAdmin();
    const body = { organisationName: `Repair Jewellers ${Date.now()}`, ownerName: 'Rina Paul', email: `repair${Date.now()}@abc.local`, mobile: '9830012345', stateCode: '19', address: addr() };
    const org = (await api().post('/api/v1/platform/organisations').set(bearer(token)).send(body)).body.data;
    await Branch.updateOne({ organisationId: org.id, isHeadOffice: true }, { $set: { address: { stateCode: '19' } } }).setOptions({ skipTenant: true });
    const { syncHeadOfficeAddresses } = await import('../src/modules/organisations/headOfficeAddress.js');
    await syncHeadOfficeAddresses();
    const ho = await Branch.findOne({ organisationId: org.id, isHeadOffice: true }).setOptions({ skipTenant: true }).lean();
    expect(ho.address).toMatchObject({ line1: 'Shop 9', pincode: '700073' });
  });
});
