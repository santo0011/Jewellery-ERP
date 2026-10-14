import { describe, expect, it } from 'vitest';
import { AuditLog } from '../src/core/audit/auditLog.model.js';
import { User } from '../src/modules/users/user.model.js';
import { api, bearer, orgInput, refreshCookie, registerOrg } from './helpers.js';

const SKIP = { skipTenant: true };

describe('organisation registration', () => {
  it('creates organisation, head office, system roles, owner and a session', async () => {
    const { input, token, cookie } = await registerOrg();
    expect(token).toBeTruthy();
    expect(cookie).toMatch(/^jerp_rt=/);

    const me = await api().get('/api/v1/auth/me').set(bearer(token));
    expect(me.status).toBe(200);
    expect(me.body.data.user.email).toBe(input.email);
    expect(me.body.data.user.isOwner).toBe(true);
    expect(me.body.data.organisation.name).toBe(input.organisationName);
    expect(me.body.data.organisation.stateCode).toBe('19');
    expect(me.body.data.subscription).toMatchObject({ plan: 'trial', status: 'trial' });
    expect(me.body.data.branches).toHaveLength(1);
    expect(me.body.data.branches[0]).toMatchObject({ code: 'HO', isHeadOffice: true });
    expect(me.body.data.permissions).toContain('sales.create');
    expect(me.body.data.permissions).not.toContain('*');

    const roles = await api().get('/api/v1/roles').set(bearer(token));
    expect(roles.body.data.map((r) => r.key)).toContain('org_admin');
    expect(roles.body.data.find((r) => r.key === 'org_admin').userCount).toBe(1);
  });

  it('rejects duplicate email and invalid input', async () => {
    const { input } = await registerOrg();
    const dup = await api().post('/api/v1/auth/register').send(orgInput({ email: input.email }));
    expect(dup.status).toBe(409);
    expect(dup.body.error.details[0].path).toBe('email');

    const bad = await api().post('/api/v1/auth/register').send(orgInput({ mobile: '123', password: 'short' }));
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    expect(bad.body.error.details.map((d) => d.path)).toEqual(expect.arrayContaining(['mobile', 'password']));
  });
});

describe('login', () => {
  it('logs in with correct credentials and records an audit entry', async () => {
    const { input } = await registerOrg();
    const res = await api().post('/api/v1/auth/login').send({ email: input.email.toUpperCase(), password: input.password });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toBeTruthy();
    expect(refreshCookie(res)).toBeTruthy();
    expect(res.headers['set-cookie'].join(';')).toMatch(/HttpOnly/i);

    const user = await User.findOne({ email: input.email }).setOptions(SKIP).lean();
    expect(await AuditLog.countDocuments({ userId: user._id, action: 'login' })).toBe(1);
  });

  it('does not reveal whether an email exists', async () => {
    const res = await api().post('/api/v1/auth/login').send({ email: 'nobody@example.com', password: 'Secret123' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('locks the account after repeated failures', async () => {
    const { input } = await registerOrg();
    for (let i = 0; i < 3; i += 1) {
      const res = await api().post('/api/v1/auth/login').send({ email: input.email, password: 'Wrong1234' });
      expect(res.status).toBe(401);
    }
    const locked = await api().post('/api/v1/auth/login').send({ email: input.email, password: input.password });
    expect(locked.status).toBe(423);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
  });
});

describe('tokens and sessions', () => {
  it('rejects missing and tampered access tokens', async () => {
    expect((await api().get('/api/v1/auth/me')).status).toBe(401);
    const { token } = await registerOrg();
    const res = await api().get('/api/v1/auth/me').set(bearer(`${token}x`));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rotates refresh tokens and revokes the session when an old token is reused', async () => {
    const { cookie } = await registerOrg();

    const first = await api().post('/api/v1/auth/refresh').set('Cookie', cookie);
    expect(first.status).toBe(200);
    const rotated = refreshCookie(first);
    expect(rotated).not.toBe(cookie);

    const reuse = await api().post('/api/v1/auth/refresh').set('Cookie', cookie);
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('REFRESH_REUSED');

    const afterReuse = await api().post('/api/v1/auth/refresh').set('Cookie', rotated);
    expect(afterReuse.status).toBe(401);
    expect((await api().get('/api/v1/auth/me').set(bearer(first.body.data.accessToken))).status).toBe(401);
  });

  it('logout revokes the session', async () => {
    const { token, cookie } = await registerOrg();
    const res = await api().post('/api/v1/auth/logout').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect((await api().get('/api/v1/auth/me').set(bearer(token))).status).toBe(401);
    expect((await api().post('/api/v1/auth/refresh').set('Cookie', cookie)).status).toBe(401);
  });

  it('lists and revokes sessions', async () => {
    const { input, token } = await registerOrg();
    const second = await api().post('/api/v1/auth/login').send({ email: input.email, password: input.password });

    const list = await api().get('/api/v1/auth/sessions').set(bearer(token));
    expect(list.body.data).toHaveLength(2);
    const other = list.body.data.find((s) => !s.current);

    expect((await api().delete(`/api/v1/auth/sessions/${other.id}`).set(bearer(token))).status).toBe(200);
    expect((await api().get('/api/v1/auth/me').set(bearer(second.body.data.accessToken))).status).toBe(401);
    expect((await api().get('/api/v1/auth/me').set(bearer(token))).status).toBe(200);
  });

  it('logout-all invalidates every session', async () => {
    const { input, token } = await registerOrg();
    const second = await api().post('/api/v1/auth/login').send({ email: input.email, password: input.password });
    expect((await api().post('/api/v1/auth/logout-all').set(bearer(token))).status).toBe(200);
    expect((await api().get('/api/v1/auth/me').set(bearer(token))).status).toBe(401);
    expect((await api().get('/api/v1/auth/me').set(bearer(second.body.data.accessToken))).status).toBe(401);
  });
});

describe('passwords', () => {
  it('changes password, keeps current session and signs out others', async () => {
    const { input, token } = await registerOrg();
    const other = await api().post('/api/v1/auth/login').send({ email: input.email, password: input.password });

    const wrong = await api().post('/api/v1/auth/change-password').set(bearer(token)).send({ currentPassword: 'Nope1234', newPassword: 'NewSecret1' });
    expect(wrong.status).toBe(400);

    const res = await api().post('/api/v1/auth/change-password').set(bearer(token)).send({ currentPassword: input.password, newPassword: 'NewSecret1' });
    expect(res.status).toBe(200);
    const fresh = res.body.data.accessToken;

    expect((await api().get('/api/v1/auth/me').set(bearer(fresh))).status).toBe(200);
    expect((await api().get('/api/v1/auth/me').set(bearer(other.body.data.accessToken))).status).toBe(401);
    expect((await api().post('/api/v1/auth/login').send({ email: input.email, password: 'NewSecret1' })).status).toBe(200);
  });

  it('resets the password with the emailed 6-digit code, once, with limited tries', async () => {
    const { input, token } = await registerOrg();
    const forgot = await api().post('/api/v1/auth/forgot-password').send({ email: input.email });
    expect(forgot.status).toBe(200);
    const unknown = await api().post('/api/v1/auth/forgot-password').send({ email: 'missing@example.com' });
    expect(unknown.body.message).toBe(forgot.body.message);
    const stored = (await User.findOne({ email: input.email }).setOptions(SKIP).select('+passwordReset').lean()).passwordReset;
    expect(stored).toMatchObject({ tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/), attempts: 0 });

    // The code is only in the email; plant a known one the way the server stores it.
    const { sha256 } = await import('../src/utils/crypto.js');
    const user = await User.findOne({ email: input.email }).setOptions(SKIP).lean();
    await User.updateOne({ _id: user._id }, { $set: { 'passwordReset.tokenHash': sha256(`password-reset:${user._id}:482913`) } }).setOptions(SKIP);

    const verify = (otp) => api().post('/api/v1/auth/verify-reset-code').send({ email: input.email, otp });
    expect((await verify('12345')).status).toBe(400); // not 6 digits
    const wrong = await verify('000000');
    expect(wrong.body.error).toMatchObject({ code: 'RESET_INVALID', message: 'That code is not right. 4 tries left.' });
    expect((await verify('482913')).body.data).toEqual({ valid: true });

    const reset = await api().post('/api/v1/auth/reset-password').send({ email: input.email, otp: '482913', password: 'Reset1234' });
    expect(reset.status).toBe(200);
    expect((await api().get('/api/v1/auth/me').set(bearer(token))).status).toBe(401);
    expect((await api().post('/api/v1/auth/reset-password').send({ email: input.email, otp: '482913', password: 'Again1234' })).body.error.code).toBe('RESET_EXPIRED');
    expect((await api().post('/api/v1/auth/login').send({ email: input.email, password: 'Reset1234' })).status).toBe(200);
  });

  it('signs in with the emailed code (forgot password); the new password is set later without the old one', async () => {
    const { input } = await registerOrg();
    await api().post('/api/v1/auth/forgot-password').send({ email: input.email });
    const { sha256 } = await import('../src/utils/crypto.js');
    const user = await User.findOne({ email: input.email }).setOptions(SKIP).lean();
    await User.updateOne({ _id: user._id }, { $set: { 'passwordReset.tokenHash': sha256(`password-reset:${user._id}:271828`) } }).setOptions(SKIP);

    expect((await api().post('/api/v1/auth/code-login').send({ email: input.email, otp: '000000' })).body.error.code).toBe('RESET_INVALID');
    const res = await api().post('/api/v1/auth/code-login').send({ email: input.email, otp: '271828' });
    expect(res.status).toBe(200);
    expect(res.body.data.realm).toBe('tenant');
    expect(refreshCookie(res)).toBeTruthy();
    const t = res.body.data.accessToken;
    const me = (await api().get('/api/v1/auth/me').set(bearer(t))).body.data;
    expect(me.user.signedInWithCode).toBe(true);
    // The code is used up.
    expect((await api().post('/api/v1/auth/code-login').send({ email: input.email, otp: '271828' })).body.error.code).toBe('RESET_EXPIRED');
    // The old password still works until it is changed.
    expect((await api().post('/api/v1/auth/login').send({ email: input.email, password: input.password })).status).toBe(200);

    // From the profile: a new password without the current one.
    const changed = await api().post('/api/v1/auth/change-password').set(bearer(t)).send({ newPassword: 'Fresh1234' });
    expect(changed.status).toBe(200);
    expect((await api().post('/api/v1/auth/login').send({ email: input.email, password: 'Fresh1234' })).status).toBe(200);
    // After that the session is an ordinary one again: the current password is required.
    const t2 = changed.body.data.accessToken;
    expect((await api().get('/api/v1/auth/me').set(bearer(t2))).body.data.user.signedInWithCode).toBe(false);
    expect((await api().post('/api/v1/auth/change-password').set(bearer(t2)).send({ newPassword: 'Other1234' })).status).toBe(400);
  });

  it('still asks for the current password in a normal session', async () => {
    const { token } = await registerOrg();
    expect((await api().post('/api/v1/auth/change-password').set(bearer(token)).send({ newPassword: 'Other1234' })).body.error.code).toBe('VALIDATION_ERROR');
  });

  it('locks a reset code after 5 wrong tries', async () => {
    const { input } = await registerOrg();
    await api().post('/api/v1/auth/forgot-password').send({ email: input.email });
    const verify = () => api().post('/api/v1/auth/verify-reset-code').send({ email: input.email, otp: '999999' });
    for (let i = 0; i < 4; i += 1) expect((await verify()).body.error.code).toBe('RESET_INVALID');
    expect((await verify()).body.error.code).toBe('RESET_LOCKED');
    expect((await verify()).body.error.code).toBe('RESET_LOCKED');
  });
});
