import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../../config/env.js';

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function createLocalDriver(rootDir) {
  const root = isAbsolute(rootDir) ? rootDir : resolve(backendRoot, rootDir);
  const pathFor = (key) => {
    const full = resolve(root, key);
    if (!full.startsWith(root + sep)) throw new Error('Invalid storage key');
    return full;
  };
  return {
    async put(key, buffer) {
      const full = pathFor(key);
      await mkdir(dirname(full), { recursive: true });
      await writeFile(full, buffer);
    },
    get: (key) => readFile(pathFor(key)),
    remove: (key) => rm(pathFor(key), { force: true }),
  };
}

const drivers = { local: () => createLocalDriver(env.STORAGE_DIR) };

export const storage = drivers[env.STORAGE_DRIVER]();

const SIGNATURES = [
  { mime: 'image/png', ext: 'png', test: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/jpeg', ext: 'jpg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/webp', ext: 'webp', test: (b) => b.length > 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
];

export const detectImageType = (buffer) => SIGNATURES.find((s) => s.test(buffer)) ?? null;
