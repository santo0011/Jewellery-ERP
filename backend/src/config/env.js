import { z } from 'zod';

const bool = z.enum(['true', 'false']).transform((v) => v === 'true');

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(5000),
    MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
    ACCESS_TOKEN_TTL: z.string().default('15m'),
    REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().default(7),
    REFRESH_TOKEN_REMEMBER_DAYS: z.coerce.number().int().positive().default(30),
    PASSWORD_RESET_MINUTES: z.coerce.number().int().positive().default(30),
    BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(15).default(12),
    MAX_FAILED_LOGINS: z.coerce.number().int().positive().default(5),
    LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),
    CORS_ORIGINS: z.string().default('http://localhost:5173'),
    APP_URL: z.url().default('http://localhost:5173'),
    COOKIE_SECURE: bool.default(false),
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    ALLOW_PUBLIC_SIGNUP: bool.default(false),
    TRIAL_DAYS: z.coerce.number().int().positive().default(14),
    EMAIL_PROVIDER: z.enum(['console']).default('console'),
    STORAGE_DRIVER: z.enum(['local']).default('local'),
    STORAGE_DIR: z.string().default('storage'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    SUPER_ADMIN_EMAIL: z.preprocess((v) => (v === '' ? undefined : v), z.email().optional()),
    SUPER_ADMIN_PASSWORD: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(6, 'SUPER_ADMIN_PASSWORD must be at least 6 characters').optional()),
    SUPER_ADMIN_NAME: z.string().default('Super Admin'),
    SUPER_ADMIN_RESET_PASSWORD: bool.default(false),
    // Cashfree payment gateway (subscriptions). Leave blank to turn online payment off.
    CASHFREE_APP_ID: z.string().trim().default(''),
    CASHFREE_SECRET_KEY: z.string().trim().default(''),
    CASHFREE_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  })
  .superRefine((cfg, ctx) => {
    if (cfg.NODE_ENV === 'production' && !cfg.COOKIE_SECURE) {
      ctx.addIssue({ code: 'custom', path: ['COOKIE_SECURE'], message: 'COOKIE_SECURE must be true in production' });
    }
  });

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(`Invalid environment configuration:\n${lines}\nCopy backend/.env.example to backend/.env and fill it in.`);
  process.exit(1);
}

export const env = Object.freeze({
  ...parsed.data,
  corsOrigins: parsed.data.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean),
  isProduction: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
});
