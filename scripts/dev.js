// One-command development runner: MongoDB -> API -> web, started in order,
// with short status lines instead of raw process output.
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { MongoClient } from 'mongodb';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backendDir = resolve(root, 'backend');
const frontendDir = resolve(root, 'frontend');
const envFile = resolve(backendDir, '.env');
const WEB_PORT = 5173;

const c = (code) => (s) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s);
const gray = c(90), green = c(32), red = c(31), yellow = c(33), cyan = c(36), bold = c(1);
const tags = { dev: gray('[dev]'), db: gray('[db] '), api: yellow('[api]'), web: cyan('[web]') };
const say = (msg) => console.log(`${tags.dev} ${msg}`);
const ok = (msg) => say(`${green('✔')} ${msg}`);
const fail = (msg) => say(`${red('✖')} ${msg}`);

const children = [];
let shuttingDown = false;
let startedDb = null;

// ---------------------------------------------------------------- helpers

function ensureEnvFile() {
  if (!existsSync(envFile)) {
    copyFileSync(resolve(backendDir, '.env.example'), envFile);
    ok('Created backend/.env from .env.example');
  }
  let text = readFileSync(envFile, 'utf8');
  if (!/^JWT_ACCESS_SECRET=.{32,}$/m.test(text)) {
    const secret = randomBytes(48).toString('base64url');
    text = /^JWT_ACCESS_SECRET=.*$/m.test(text)
      ? text.replace(/^JWT_ACCESS_SECRET=.*$/m, `JWT_ACCESS_SECRET=${secret}`)
      : `${text.trimEnd()}\nJWT_ACCESS_SECRET=${secret}\n`;
    writeFileSync(envFile, text);
    ok('Generated JWT_ACCESS_SECRET in backend/.env');
  }
  return parseEnv(text);
}

const portInUse = (port) =>
  new Promise((done) => {
    const socket = createConnection({ port, host: '127.0.0.1' })
      .once('connect', () => { socket.destroy(); done(true); })
      .once('error', () => done(false));
  });

async function mongoReady(port) {
  const client = new MongoClient(`mongodb://127.0.0.1:${port}/?directConnection=true`, { serverSelectionTimeoutMS: 1000 });
  try {
    await client.connect();
    const hello = await client.db('admin').command({ hello: 1 });
    return Boolean(hello.setName && hello.isWritablePrimary);
  } catch {
    return false;
  } finally {
    await client.close().catch(() => {});
  }
}

async function waitFor(check, timeoutMs, child) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null) return false;
    if (await check()) return true;
    await sleep(500);
  }
  return false;
}

const httpOk = (url) => () => fetch(url).then((r) => r.ok, () => false);

// Pipes a child's output through line by line, prefixed with its tag and
// with blank / filtered lines dropped.
function pipe(stream, tag, skip) {
  createInterface({ input: stream }).on('line', (line) => {
    if (!line.trim() || skip?.(line)) return;
    console.log(`${tag} ${line}`);
  });
}

function run(name, args, cwd, { skip, env } = {}) {
  const child = spawn(process.execPath, args, { cwd, env: { ...process.env, ...env, FORCE_COLOR: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  pipe(child.stdout, tags[name], skip);
  pipe(child.stderr, tags[name], skip);
  child.on('exit', (code) => {
    if (shuttingDown) return;
    fail(`${name} stopped unexpectedly (exit code ${code}). Shutting down.`);
    shutdown(1);
  });
  children.push(child);
  return child;
}

function killTree(child) {
  if (child.exitCode !== null) return;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  else child.kill('SIGINT');
}

async function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  say('Stopping...');
  for (const child of [...children].reverse()) {
    if (child === startedDb?.child) continue;
    killTree(child);
  }
  if (startedDb) {
    // Ask mongod to shut down cleanly before killing its launcher.
    const client = new MongoClient(`mongodb://127.0.0.1:${startedDb.port}/?directConnection=true`, { serverSelectionTimeoutMS: 2000 });
    await client.connect().then(() => client.db('admin').command({ shutdown: 1, force: true })).catch(() => {});
    await client.close().catch(() => {});
    await sleep(500);
    killTree(startedDb.child);
  }
  ok('Stopped');
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

// ---------------------------------------------------------------- start

console.log(`\n${bold('Jewellery ERP')} ${gray('— development')}\n`);

const env = ensureEnvFile();
const apiPort = Number(env.PORT || 5000);

for (const [port, what] of [[apiPort, 'API'], [WEB_PORT, 'web']]) {
  if (await portInUse(port)) {
    fail(`Port ${port} (${what}) is already in use. Is another \`npm run dev\` still running? Stop it and try again.`);
    process.exit(1);
  }
}

// 1. Database
const mongoUrl = new URL((env.MONGODB_URI || '').replace(/^mongodb(\+srv)?:/, 'http:'));
const localDb = ['127.0.0.1', 'localhost'].includes(mongoUrl.hostname);
if (!localDb) {
  ok(`Database: using external MongoDB (${mongoUrl.hostname})`);
} else {
  const dbPort = Number(mongoUrl.port || 27017);
  if (await mongoReady(dbPort)) {
    ok(`Database: already running on port ${dbPort}, reusing it`);
  } else if (await portInUse(dbPort)) {
    fail(`Port ${dbPort} is in use but is not a ready MongoDB replica set. Stop that process and try again.`);
    process.exit(1);
  } else {
    say('Starting database... (the first run downloads MongoDB and can take a few minutes)');
    const child = run('db', ['scripts/dev-db.js'], backendDir, {
      env: { DEV_DB_PORT: String(dbPort) },
      skip: (line) => /^(MongoDB replica set ready|Data directory|mongod exited)/.test(line),
    });
    startedDb = { child, port: dbPort };
    if (!(await waitFor(() => mongoReady(dbPort), 5 * 60_000, child))) {
      fail('Database did not start.');
      await shutdown(1);
    }
    ok(`Database: running on port ${dbPort}`);
  }
}

// 2. API (node --watch restarts it when backend files change)
say('Starting API...');
const api = run('api', ['--watch', '--env-file-if-exists=.env', 'src/server.js'], backendDir, {
  skip: (line) => /Completed running|API listening/.test(line),
});
if (await waitFor(httpOk(`http://127.0.0.1:${apiPort}/api/v1/health`), 60_000, api)) {
  ok(`API: http://localhost:${apiPort}/api/v1`);
} else {
  fail('API did not become ready — see the [api] messages above. It will restart automatically when you save a fix.');
}

// 3. Web
say('Starting web...');
const web = run('web', [resolve(root, 'node_modules/vite/bin/vite.js'), '--port', String(WEB_PORT), '--strictPort', '--logLevel', 'warn', '--clearScreen', 'false'], frontendDir);
if (await waitFor(httpOk(`http://localhost:${WEB_PORT}/`), 60_000, web)) {
  ok(`Web: http://localhost:${WEB_PORT}`);
} else {
  fail('Web did not become ready — see the [web] messages above.');
}

console.log(`\n${tags.dev} ${bold(green('Ready.'))} Open ${bold(`http://localhost:${WEB_PORT}`)}  ${gray('(Ctrl+C to stop)')}\n`);
