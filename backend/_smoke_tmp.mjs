// Temporary: calls every page's data endpoints as each organisation's owner and branch users, on the real dev data.
process.env.NODE_ENV = 'test';
const { default: request } = await import('supertest');
const { default: mongoose } = await import('mongoose');
const { connectDb, disconnectDb } = await import('./src/config/db.js');
const { createApp } = await import('./src/app.js');
const { signAccessToken, createRefreshSecret } = await import('./src/modules/auth/token.service.js');

const LISTS = [
  '/auth/me', '/dashboard', '/rates/current', '/rates/history', '/approvals', '/approvals/pending-count', '/reports',
  '/sales', '/orders', '/orders?status=open', '/old-gold', '/customers', '/products', '/products?status=draft', '/inventory/summary',
  '/inventory/movements', '/inventory/movements?stock=raw', '/inventory/opening', '/inventory/adjustments', '/inventory/transfers',
  '/inventory/production', '/purchases', '/purchases/orders', '/items', '/suppliers', '/expenses', '/expenses/categories',
  '/finance/summary', '/hr/employees', '/hr/attendance', '/hr/attendance/register', '/hr/advances', '/hr/payroll',
  '/organisation', '/organisation/subscription', '/branches', '/branches/directory', '/branches/usage', '/settings', '/categories',
  '/roles', '/users', '/audit-logs', '/billing', '/profile', '/auth/sessions',
];
const DETAIL = [
  ['/sales', (x) => `/sales/${x.id}`],
  ['/orders', (x) => `/orders/${x.id}`],
  ['/customers', (x) => [`/customers/${x.id}`, `/customers/${x.id}/dues`, `/customers/${x.id}/history`]],
  ['/suppliers', (x) => [`/suppliers/${x.id}`, `/suppliers/${x.id}/payments`]],
  ['/products', (x) => `/products/${x.id}`],
  ['/purchases', (x) => `/purchases/${x.id}`],
  ['/purchases/orders', (x) => `/purchases/orders/${x.id}`],
  ['/old-gold', (x) => `/old-gold/${x.id}`],
  ['/inventory/opening', (x) => `/inventory/entries/${x.id}`],
  ['/inventory/production', (x) => `/inventory/production/${x.id}`],
  ['/hr/employees', (x) => `/hr/employees/${x.id}`],
  ['/hr/payroll', (x) => `/hr/payroll/${x.id}`],
  ['/expenses', (x) => `/expenses/${x.id}`],
  ['/roles', (x) => `/roles/${x.id}`],
];

await connectDb();
const app = createApp();
const db = mongoose.connection.db;
const problems = [];
for (const user of await db.collection('users').find({ status: 'active' }).toArray()) {
  const { insertedId } = await db.collection('sessions').insertOne({ userId: user._id, organisationId: user.organisationId, realm: 'tenant', tokenHash: createRefreshSecret().hash, rememberMe: false, signedInWith: 'password', userAgent: 'smoke', revokedAt: null, expiresAt: new Date(Date.now() + 3600000), createdAt: new Date(), updatedAt: new Date() });
  const token = signAccessToken({ userId: user._id, organisationId: user.organisationId, sessionId: insertedId, tokenVersion: user.tokenVersion });
  const get = (url) => request(app).get(`/api/v1${url}`).set({ Authorization: `Bearer ${token}` });
  let ok = 0;
  const check = async (url) => {
    const res = await get(url);
    if (res.status >= 500 || (res.status >= 400 && res.status !== 403)) problems.push(`${user.email} GET ${url} -> ${res.status} ${JSON.stringify(res.body.error ?? res.body).slice(0, 200)}`);
    else ok += 1;
    return res;
  };
  for (const url of LISTS) await check(url);
  for (const [list, make] of DETAIL) {
    const res = await get(`${list}${list.includes('?') ? '&' : '?'}limit=3`);
    for (const row of [].concat(res.body?.data ?? []).slice(0, 3)) for (const url of [].concat(make(row))) await check(url);
  }
  const reports = (await get('/reports')).body?.data ?? [];
  for (const r of [].concat(reports).flatMap((g) => g.reports ?? [g])) if (r.key) await check(`/reports/${r.key}`);
  console.log(`${user.email}: ${ok} ok`);
  await db.collection('sessions').deleteOne({ _id: insertedId });
}
console.log(problems.length ? `\nPROBLEMS (${problems.length}):\n${problems.join('\n')}` : '\nNo problems');
await disconnectDb();
