import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { MongoClient } from 'mongodb';
import { MongoBinary } from 'mongodb-memory-server';

const port = Number(process.env.DEV_DB_PORT ?? 27018);
const replSet = 'rs0';
const dbPath = resolve(dirname(fileURLToPath(import.meta.url)), '../.data/db');
mkdirSync(dbPath, { recursive: true });

const portFree = await new Promise((done) => {
  const probe = createServer()
    .once('error', () => done(false))
    .once('listening', () => probe.close(() => done(true)))
    .listen(port, '127.0.0.1');
});
if (!portFree) {
  console.error(`Port ${port} is already in use (another MongoDB?). Stop it, or set DEV_DB_PORT and update MONGODB_URI in backend/.env.`);
  process.exit(1);
}

const binary = await MongoBinary.getPath();
const mongod = spawn(binary, ['--port', String(port), '--bind_ip', '127.0.0.1', '--dbpath', dbPath, '--replSet', replSet, '--quiet'], {
  stdio: ['ignore', 'ignore', 'inherit'],
});
mongod.on('exit', (code) => {
  console.log(`mongod exited with code ${code}`);
  process.exit(code ?? 0);
});

const client = new MongoClient(`mongodb://127.0.0.1:${port}/?directConnection=true`, { serverSelectionTimeoutMS: 2000 });
for (let attempt = 0; ; attempt += 1) {
  try {
    await client.connect();
    break;
  } catch (err) {
    if (attempt > 30) throw err;
    await sleep(500);
  }
}

const admin = client.db('admin');
try {
  await admin.command({ replSetGetStatus: 1 });
} catch (err) {
  if (err.codeName === 'NotYetInitialized') {
    await admin.command({ replSetInitiate: { _id: replSet, members: [{ _id: 0, host: `127.0.0.1:${port}` }] } });
  } else if (err.codeName === 'InvalidReplicaSetConfig') {
    // Data dir was initialised on a different port; point the member at the current one.
    const config = await client.db('local').collection('system.replset').findOne({ _id: replSet });
    config.members[0].host = `127.0.0.1:${port}`;
    config.version += 1;
    await admin.command({ replSetReconfig: config, force: true });
  } else {
    throw err;
  }
}
for (let attempt = 0; attempt < 60; attempt += 1) {
  const { isWritablePrimary } = await admin.command({ hello: 1 });
  if (isWritablePrimary) break;
  await sleep(500);
}
await client.close();

console.log(`MongoDB replica set ready: mongodb://127.0.0.1:${port}/jewellery_erp?replicaSet=${replSet}`);
console.log(`Data directory: ${dbPath}`);

const stop = () => mongod.kill('SIGINT');
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
