import bcrypt from 'bcryptjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../src/config/env.js';
import { ensureDefaultSuperAdmin } from '../src/modules/platform/bootstrapSuperAdmin.js';
import { PlatformAdmin } from '../src/modules/platform/platformAdmin.model.js';
import { api, bearer } from './helpers.js';

// env is frozen in the app; give these tests a writable copy so each case can set SUPER_ADMIN_*.
vi.mock('../src/config/env.js', async (importOriginal) => {
  const { env: original } = await importOriginal();
  return { env: { ...original } };
});

const EMAIL = 'biswassanto0011@gmail.com';
const login = (email, password) => api().post('/api/v1/auth/login').send({ email, password });

describe('default Super Admin bootstrap', () => {
  beforeEach(async () => {
    await PlatformAdmin.deleteMany({});
    Object.assign(env, { SUPER_ADMIN_EMAIL: '  BiswasSanto0011@Gmail.com ', SUPER_ADMIN_PASSWORD: '123456', SUPER_ADMIN_NAME: 'Santo Biswas', SUPER_ADMIN_RESET_PASSWORD: false });
  });

  it('creates one hashed SUPER_ADMIN account, survives restarts without duplicates, and signs in to the platform', async () => {
    await ensureDefaultSuperAdmin();
    await ensureDefaultSuperAdmin(); // a second server start

    const admins = await PlatformAdmin.find({}).select('+passwordHash').lean();
    expect(admins).toHaveLength(1);
    expect(admins[0]).toMatchObject({ email: EMAIL, role: 'SUPER_ADMIN', status: 'active' });
    expect(admins[0].passwordHash).not.toBe('123456');
    expect(await bcrypt.compare('123456', admins[0].passwordHash)).toBe(true);

    const res = await login(' BISWASSANTO0011@gmail.com ', '123456');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ realm: 'platform', accessToken: expect.any(String) });
    expect([].concat(res.headers['set-cookie'] ?? []).some((c) => c.startsWith('jerp_prt='))).toBe(true);

    const me = await api().get('/api/v1/platform/auth/me').set(bearer(res.body.data.accessToken));
    expect(me.body.data).toMatchObject({ email: EMAIL, role: 'SUPER_ADMIN' });
    expect((await api().get('/api/v1/platform/dashboard').set(bearer(res.body.data.accessToken))).status).toBe(200);
  });

  it('keeps a changed password unless the reset switch is on, then re-hashes and unlocks', async () => {
    await ensureDefaultSuperAdmin();
    await PlatformAdmin.updateOne({ email: EMAIL }, { $set: { passwordHash: await bcrypt.hash('Changed123', 4), lockedUntil: new Date(Date.now() + 60000) } });

    await ensureDefaultSuperAdmin();
    expect((await login(EMAIL, '123456')).status).not.toBe(200);

    env.SUPER_ADMIN_RESET_PASSWORD = true;
    await ensureDefaultSuperAdmin();
    expect(await PlatformAdmin.countDocuments({})).toBe(1);
    expect((await login(EMAIL, '123456')).status).toBe(200);
  });

  it('gives older accounts without a role the SUPER_ADMIN role', async () => {
    await PlatformAdmin.collection.insertOne({ name: 'Legacy', email: 'legacy@platform.local', passwordHash: 'x', status: 'active', tokenVersion: 0 });
    await ensureDefaultSuperAdmin();
    expect((await PlatformAdmin.findOne({ email: 'legacy@platform.local' }).lean()).role).toBe('SUPER_ADMIN');
  });
});
