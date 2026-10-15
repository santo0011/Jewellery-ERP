import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { PlatformAdmin } from '../src/modules/platform/platformAdmin.model.js';
import { api, bearer, registerOrg } from './helpers.js';

async function superAdmin() {
  const email = `sa${Date.now()}${Math.random().toString(36).slice(2, 6)}@platform.local`;
  await PlatformAdmin.create({ name: 'Platform Owner', email, passwordHash: await bcrypt.hash('Admin1234', 4) });
  const login = (await api().post('/api/v1/auth/login').send({ email, password: 'Admin1234' })).body.data.accessToken;
  return { email, token: login };
}

describe('Super Admin profile', () => {
  it('changes name and email (current password needed for email) and refuses an email already in use', async () => {
    const sa = await superAdmin();
    const profile = (body) => api().patch('/api/v1/platform/profile').set(bearer(sa.token)).send(body);
    expect((await api().get('/api/v1/platform/profile').set(bearer(sa.token))).body.data).toMatchObject({ name: 'Platform Owner', email: sa.email, signedInWithCode: false });

    expect((await profile({ name: 'Santo Admin', email: sa.email })).body.data.name).toBe('Santo Admin');
    const fresh = `new${Date.now()}@platform.local`;
    expect((await profile({ name: 'Santo Admin', email: fresh })).body.error.details[0].path).toBe('currentPassword');
    expect((await profile({ name: 'Santo Admin', email: fresh, currentPassword: 'nope' })).body.error.code).toBe('WRONG_PASSWORD');
    const org = await registerOrg();
    expect((await profile({ name: 'Santo Admin', email: org.input.email, currentPassword: 'Admin1234' })).status).toBe(409);
    expect((await profile({ name: 'Santo Admin', email: fresh, currentPassword: 'Admin1234' })).body.data.email).toBe(fresh);
    // Signs in with the new email.
    expect((await api().post('/api/v1/auth/login').send({ email: fresh, password: 'Admin1234' })).status).toBe(200);
  });

  it('changes the password: this device stays signed in, every other device is signed out', async () => {
    const sa = await superAdmin();
    const other = (await api().post('/api/v1/auth/login').send({ email: sa.email, password: 'Admin1234' })).body.data.accessToken;
    const change = (body) => api().post('/api/v1/platform/profile/password').set(bearer(sa.token)).send(body);

    expect((await change({ currentPassword: 'wrong', newPassword: 'Better123' })).body.error.code).toBe('WRONG_PASSWORD');
    expect((await change({ currentPassword: 'Admin1234', newPassword: 'Admin1234' })).status).toBe(400);
    expect((await change({ currentPassword: 'Admin1234', newPassword: '123' })).status).toBe(400);

    const done = await change({ currentPassword: 'Admin1234', newPassword: 'Better123' });
    expect(done.status).toBe(200);
    expect(done.body.data.profile.passwordChangedAt).toBeTruthy();
    expect((await api().get('/api/v1/platform/profile').set(bearer(done.body.data.accessToken))).status).toBe(200);
    expect((await api().get('/api/v1/platform/profile').set(bearer(sa.token))).status).toBe(401); // old token of this device
    expect((await api().get('/api/v1/platform/profile').set(bearer(other))).status).toBe(401); // other device
    expect((await api().post('/api/v1/auth/login').send({ email: sa.email, password: 'Admin1234' })).status).toBe(401);
    expect((await api().post('/api/v1/auth/login').send({ email: sa.email, password: 'Better123' })).status).toBe(200);
  });
});
