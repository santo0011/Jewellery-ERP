import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { EmailSettings } from '../src/core/notifications/emailSettings.model.js';
import { templates } from '../src/core/notifications/emailTemplates.js';
import { PlatformAdmin } from '../src/modules/platform/platformAdmin.model.js';
import { sha256 } from '../src/utils/crypto.js';
import { open } from '../src/utils/secretBox.js';
import { api, bearer } from './helpers.js';

async function superAdmin() {
  const email = `sa${Date.now()}${Math.random().toString(36).slice(2, 6)}@platform.local`;
  await PlatformAdmin.create({ name: 'Platform Owner', email, passwordHash: await bcrypt.hash('Admin1234', 4) });
  const res = await api().post('/api/v1/auth/login').send({ email, password: 'Admin1234' });
  return { email, token: res.body.data.accessToken };
}

const orgBody = (o = {}) => ({
  organisationName: `OTP Jewellers ${Date.now()}`,
  ownerName: 'Rina Paul',
  email: `owner${Date.now()}${Math.random().toString(36).slice(2, 6)}@abc.local`,
  mobile: '9830012345',
  stateCode: '19',
  ...o,
});

const login = (email, password) => api().post('/api/v1/auth/login').send({ email, password });

describe('new organisations sign in with an emailed 6-digit code', () => {
  it('makes a numeric code the first password, and can issue a new one', async () => {
    await EmailSettings.deleteMany({});
    const sa = await superAdmin();
    const body = orgBody();
    const created = await api().post('/api/v1/platform/organisations').set(bearer(sa.token)).send(body);
    expect(created.status).toBe(201);
    // No SMTP set up: the email goes to the log, so the Super Admin is shown the code instead.
    const { loginEmail } = created.body.data;
    expect(loginEmail).toMatchObject({ status: 'logged', sentTo: body.email, otp: expect.stringMatching(/^[0-9]{6}$/) });

    const first = await login(body.email, loginEmail.otp);
    expect(first.status).toBe(200);
    const me = (await api().get('/api/v1/auth/me').set(bearer(first.body.data.accessToken))).body.data;
    expect(me.user.mustChangePassword).toBe(true);

    const resent = (await api().post(`/api/v1/platform/organisations/${created.body.data.id}/send-login`).set(bearer(sa.token))).body.data;
    expect(resent.otp).toMatch(/^[0-9]{6}$/);
    expect((await login(body.email, loginEmail.otp)).status).toBe(resent.otp === loginEmail.otp ? 200 : 401);
    expect((await login(body.email, resent.otp)).status).toBe(200);
    // The old session was signed out.
    expect((await api().get('/api/v1/auth/me').set(bearer(first.body.data.accessToken))).status).toBe(401);
  });

  it('sets the first own password without asking for the emailed one again', async () => {
    await EmailSettings.deleteMany({});
    const sa = await superAdmin();
    const body = orgBody();
    const { loginEmail } = (await api().post('/api/v1/platform/organisations').set(bearer(sa.token)).send(body)).body.data;
    const token = (await login(body.email, loginEmail.otp)).body.data.accessToken;
    const change = (newPassword) => api().post('/api/v1/auth/change-password').set(bearer(token)).send({ newPassword });

    // Not the temporary password again.
    expect((await change(loginEmail.otp)).body.error.details[0].path).toBe('newPassword');
    const changed = await change('Owner1234');
    expect(changed.status).toBe(200);
    const me = (await api().get('/api/v1/auth/me').set(bearer(changed.body.data.accessToken))).body.data;
    expect(me.user.mustChangePassword).toBe(false);
    expect((await login(body.email, 'Owner1234')).status).toBe(200);
    // From now on, changing it again needs the current password.
    expect((await api().post('/api/v1/auth/change-password').set(bearer(changed.body.data.accessToken)).send({ newPassword: 'Other1234' })).status).toBe(400);
  });

  it('still creates the organisation when the mail server is down, and says so', async () => {
    const sa = await superAdmin();
    await EmailSettings.findOneAndUpdate({ key: 'smtp' }, { $set: { enabled: true, host: '127.0.0.1', port: 1, security: 'none', fromEmail: 'noreply@test.local' } }, { upsert: true });
    try {
      const created = await api().post('/api/v1/platform/organisations').set(bearer(sa.token)).send(orgBody());
      expect(created.status).toBe(201);
      expect(created.body.data.loginEmail).toMatchObject({ status: 'failed', otp: expect.stringMatching(/^[0-9]{6}$/), error: expect.any(String) });
    } finally {
      await EmailSettings.deleteMany({});
    }
  });
});

describe('SMTP settings', () => {
  it('saves settings with the password encrypted and never returned, and reports a failed test', async () => {
    await EmailSettings.deleteMany({});
    const sa = await superAdmin();
    const initial = (await api().get('/api/v1/platform/email-settings').set(bearer(sa.token))).body.data;
    expect(initial).toMatchObject({ enabled: false, delivery: 'log', hasPassword: false });

    const missing = await api().put('/api/v1/platform/email-settings').set(bearer(sa.token)).send({ enabled: true, port: 587, security: 'starttls' });
    expect(missing.body.error.details.map((d) => d.path).sort()).toEqual(['fromEmail', 'host']);

    const settings = { enabled: true, host: 'smtp.example.com', port: 587, security: 'starttls', username: 'mailer', password: 'S3cret!pass', fromName: 'Jewellery ERP', fromEmail: 'noreply@example.com', replyTo: '' };
    const saved = (await api().put('/api/v1/platform/email-settings').set(bearer(sa.token)).send(settings)).body.data;
    expect(saved).toMatchObject({ enabled: true, host: 'smtp.example.com', hasPassword: true, delivery: 'smtp' });
    expect(JSON.stringify(saved)).not.toContain('S3cret!pass');
    const stored = await EmailSettings.findOne({ key: 'smtp' }).lean();
    expect(stored.passwordSealed).not.toContain('S3cret');
    expect(open(stored.passwordSealed)).toBe('S3cret!pass');

    // Saving again without a password keeps the stored one.
    await api().put('/api/v1/platform/email-settings').set(bearer(sa.token)).send({ ...settings, password: '', fromName: 'Renamed' });
    expect(open((await EmailSettings.findOne({ key: 'smtp' }).lean()).passwordSealed)).toBe('S3cret!pass');

    const test = await api().post('/api/v1/platform/email-settings/test').set(bearer(sa.token)).send({ ...settings, host: '127.0.0.1', port: 1, security: 'none', to: 'me@example.com' });
    expect(test.status).toBe(400);
    expect(test.body.error.code).toBe('SMTP_FAILED');
    expect((await api().get('/api/v1/platform/email-settings').set(bearer(sa.token))).body.data.lastTest).toMatchObject({ ok: false, to: 'me@example.com' });
    await EmailSettings.deleteMany({});
  });
});

describe('forgot password', () => {
  it('lets a Super Admin reset their password with an emailed code', async () => {
    const sa = await superAdmin();
    expect((await api().post('/api/v1/auth/forgot-password').send({ email: sa.email })).status).toBe(200);
    const admin = await PlatformAdmin.findOne({ email: sa.email }).lean();
    expect(admin.passwordReset.tokenHash).toMatch(/^[0-9a-f]{64}$/);

    // The code is only in the email; plant a known one the way the server stores it.
    await PlatformAdmin.updateOne({ _id: admin._id }, { $set: { 'passwordReset.tokenHash': sha256(`password-reset:${admin._id}:731004`) } });
    expect((await api().post('/api/v1/auth/reset-password').send({ email: sa.email, otp: '731004', password: 'NewAdmin99' })).status).toBe(200);
    expect((await login(sa.email, 'Admin1234')).status).toBe(401);
    expect((await login(sa.email, 'NewAdmin99')).body.data.realm).toBe('platform');
    expect((await api().post('/api/v1/auth/reset-password').send({ email: sa.email, otp: '731004', password: 'Again1234' })).body.error.code).toBe('RESET_EXPIRED');
  });
});

describe('email templates', () => {
  it('render branded HTML and plain text, with values escaped', () => {
    const welcome = templates.organisationWelcome({ name: 'Rina <b>Paul</b>', organisationName: 'Sonar & Co', email: 'rina@x.in', otp: '042917', loginUrl: 'https://app.example.com/login' });
    expect(welcome.subject).toContain('Sonar & Co');
    expect(welcome.html).toContain('Rina &lt;b&gt;Paul&lt;/b&gt;');
    expect(welcome.html).toContain('Sonar &amp; Co');
    for (const d of '042917') expect(welcome.html).toContain(`>${d}</td>`);
    expect(welcome.text).toContain('Password: 042917');
    const reset = templates.passwordReset({ name: 'A', otp: '519306', minutes: 10 });
    expect(reset.subject).toContain('519306');
    for (const d of '519306') expect(reset.html).toContain(`>${d}</td>`);
    expect(reset.text).toContain('10 minutes');
  });
});
