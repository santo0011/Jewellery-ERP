import { describe, expect, it } from 'vitest';
import { api, bearer, registerOrg } from './helpers.js';

const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082',
  'hex',
);

describe('business settings', () => {
  it('returns defaults and saves a section with audit trail', async () => {
    const { token } = await registerOrg();
    const res = await api().get('/api/v1/settings').set(bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.data.tax).toMatchObject({ gstEnabled: true, jewelleryGstBps: 300, hsnJewellery: '7113' });
    expect(res.body.data.jewellery.cashLimitPaise).toBe(19999900);

    const invoice = { ...res.body.data.invoice, invoicePrefix: 'kol', copies: 2, terms: '' };
    const saved = await api().put('/api/v1/settings/invoice').set(bearer(token)).send(invoice);
    expect(saved.status).toBe(200);
    expect(saved.body.data.invoice).toMatchObject({ invoicePrefix: 'KOL', copies: 2, terms: null });

    const audit = await api().get('/api/v1/audit-logs?module=settings').set(bearer(token));
    expect(audit.body.data[0].changes.map((c) => c.field)).toEqual(expect.arrayContaining(['invoicePrefix', 'copies', 'terms']));
  });

  it('validates sections and rejects unknown ones', async () => {
    const { token } = await registerOrg();
    const { jewellery, tax } = (await api().get('/api/v1/settings').set(bearer(token))).body.data;

    const badPurity = await api().put('/api/v1/settings/jewellery').set(bearer(token)).send({ ...jewellery, enabledPurities: { ...jewellery.enabledPurities, gold: [917] } });
    expect(badPurity.status).toBe(400);

    const noGold = await api().put('/api/v1/settings/jewellery').set(bearer(token)).send({ ...jewellery, enabledPurities: { ...jewellery.enabledPurities, gold: [] } });
    expect(noGold.body.error.details[0].path).toBe('enabledPurities.gold');

    const badRate = await api().put('/api/v1/settings/tax').set(bearer(token)).send({ ...tax, jewelleryGstBps: 99999 });
    expect(badRate.status).toBe(400);

    expect((await api().put('/api/v1/settings/secrets').set(bearer(token)).send({})).status).toBe(400);
  });
});

describe('organisation logo', () => {
  it('uploads, serves and removes a logo; rejects non-images', async () => {
    const { token } = await registerOrg();

    const fake = await api().put('/api/v1/organisation/logo').set(bearer(token)).attach('logo', Buffer.from('<svg onload=alert(1)>'), 'logo.png');
    expect(fake.status).toBe(400);
    expect(fake.body.error.code).toBe('UNSUPPORTED_FILE');

    const upload = await api().put('/api/v1/organisation/logo').set(bearer(token)).attach('logo', PNG, 'logo.png');
    expect(upload.status).toBe(200);

    const me = await api().get('/api/v1/auth/me').set(bearer(token));
    expect(me.body.data.organisation.hasLogo).toBe(true);

    const logo = await api().get('/api/v1/organisation/logo').set(bearer(token));
    expect(logo.status).toBe(200);
    expect(logo.headers['content-type']).toBe('image/png');

    expect((await api().delete('/api/v1/organisation/logo').set(bearer(token))).status).toBe(200);
    expect((await api().get('/api/v1/organisation/logo').set(bearer(token))).status).toBe(404);
  });
});

describe('audit log', () => {
  it('lists entries with user names and filters, scoped to the organisation', async () => {
    const a = await registerOrg();
    const b = await registerOrg();
    await api().post('/api/v1/branches').set(bearer(a.token)).send({ code: 'AUD', name: 'Audit Branch', address: {} });

    const list = await api().get('/api/v1/audit-logs?module=branch').set(bearer(a.token));
    expect(list.status).toBe(200);
    expect(list.body.data[0]).toMatchObject({ action: 'create', module: 'branch', user: { name: 'Test Owner' } });

    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()); // the org's business date, not UTC
    const ranged = await api().get(`/api/v1/audit-logs?from=${today}&to=${today}`).set(bearer(a.token));
    expect(ranged.body.meta.total).toBeGreaterThan(0);

    const otherOrg = await api().get('/api/v1/audit-logs?module=branch').set(bearer(b.token));
    expect(otherOrg.body.meta.total).toBe(0);

    const badRange = await api().get('/api/v1/audit-logs?from=2026-02-01&to=2026-01-01').set(bearer(a.token));
    expect(badRange.status).toBe(400);
  });
});
