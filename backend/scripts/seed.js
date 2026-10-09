import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { env } from '../src/config/env.js';
import { connectDb, disconnectDb } from '../src/config/db.js';
import '../src/app.js'; // registers every model, so collections and indexes below cover the whole schema
import { ensureDefaultSuperAdmin } from '../src/modules/platform/bootstrapSuperAdmin.js';

// Usage: npm run seed            create missing collections/indexes and the default Super Admin
//        npm run seed -- --fresh drop the whole database first (development only)
const fresh = process.argv.includes('--fresh');

if (fresh && env.isProduction) {
  console.error('Refusing to drop the database in production.');
  process.exit(1);
}

await connectDb();

if (fresh) {
  const { name } = mongoose.connection;
  await mongoose.connection.dropDatabase();
  console.log(`Dropped database "${name}".`);
  if (env.STORAGE_DRIVER === 'local') {
    // Uploaded logos and images belong to the records just dropped.
    const dir = resolve(fileURLToPath(new URL('..', import.meta.url)), env.STORAGE_DIR);
    await rm(dir, { recursive: true, force: true });
    console.log(`Cleared uploaded files in ${dir}.`);
  }
}

await mongoose.connection.syncIndexes();
console.log(`Collections ready: ${Object.keys(mongoose.connection.models).length} models synced.`);

await ensureDefaultSuperAdmin();
console.log(env.SUPER_ADMIN_EMAIL ? `Super Admin: ${env.SUPER_ADMIN_EMAIL}` : 'SUPER_ADMIN_EMAIL is not set; no default Super Admin created.');

await disconnectDb();
