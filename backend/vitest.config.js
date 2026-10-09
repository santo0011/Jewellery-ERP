import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./tests/globalSetup.js'],
    setupFiles: ['./tests/setup.js'],
    testTimeout: 30000,
    hookTimeout: 120000,
    env: {
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://placeholder',
      JWT_ACCESS_SECRET: 'test-secret-test-secret-test-secret-123456',
      BCRYPT_ROUNDS: '4',
      MAX_FAILED_LOGINS: '3',
      ALLOW_PUBLIC_SIGNUP: 'true',
      STORAGE_DIR: join(tmpdir(), 'jerp-test-storage'),
    },
  },
});
