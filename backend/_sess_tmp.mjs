import fs from 'node:fs';
import mongoose from 'mongoose';
import { createRefreshSecret, encodeRefreshToken } from './src/modules/auth/token.service.js';
await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
await db.collection('sessions').deleteMany({ userAgent: 'ui-check' });
const out = [];
for (const user of await db.collection('users').find({ status: 'active' }).toArray()) {
  const cookies = {};
  for (const vp of ['desktop', 'phone']) {
    const { secret, hash } = createRefreshSecret();
    const { insertedId } = await db.collection('sessions').insertOne({ userId: user._id, organisationId: user.organisationId, realm: 'tenant', tokenHash: hash, rememberMe: false, signedInWith: 'password', userAgent: 'ui-check', ip: null, revokedAt: null, expiresAt: new Date(Date.now() + 6 * 3600000), createdAt: new Date(), updatedAt: new Date() });
    cookies[vp] = encodeRefreshToken(insertedId, secret);
  }
  out.push({ email: user.email, cookies });
}
fs.writeFileSync(process.argv[2], JSON.stringify(out));
console.log('sessions', out.length * 2);
await mongoose.disconnect();
