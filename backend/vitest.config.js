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
      // Fake gateway keys: tests stub fetch, nothing reaches Cashfree.
      CASHFREE_APP_ID: 'TEST_APP_ID',
      CASHFREE_SECRET_KEY: 'test-cashfree-secret',
    },
  },
});
