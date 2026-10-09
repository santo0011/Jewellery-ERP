import bcrypt from 'bcryptjs';
import { PLATFORM_ROLES } from '@jerp/shared';
import { passwordSchema } from '@jerp/shared/schemas';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { PlatformAdmin } from './platformAdmin.model.js';
import { createPlatformAdmin } from './platformAuth.service.js';

/**
 * Runs on every start: creates the default Super Admin from SUPER_ADMIN_* settings if that email has no account yet.
 * An existing account is never duplicated and its password is never overwritten.
 */
export async function ensureDefaultSuperAdmin() {
  // Accounts created before roles existed have no role field; they are all Super Admins.
  await PlatformAdmin.updateMany({ role: { $exists: false } }, { $set: { role: PLATFORM_ROLES.SUPER_ADMIN } });

  const { SUPER_ADMIN_PASSWORD: password, SUPER_ADMIN_NAME: name } = env;
  const email = env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  if (!email || !password) return;
  const existing = await PlatformAdmin.exists({ email });
  if (existing && !env.SUPER_ADMIN_RESET_PASSWORD) return;

  const strong = passwordSchema.safeParse(password).success;
  if (!strong && env.isProduction) {
    logger.error('Default Super Admin not created or reset: SUPER_ADMIN_PASSWORD is too weak for production (at least 6 characters).');
    return;
  }

  if (existing) {
    // Recovery switch: re-hash SUPER_ADMIN_PASSWORD, unlock the account and sign out its old sessions.
    await PlatformAdmin.updateOne(
      { _id: existing._id },
      { $set: { passwordHash: await bcrypt.hash(password, env.BCRYPT_ROUNDS), status: 'active', failedLoginCount: 0, lockedUntil: null }, $inc: { tokenVersion: 1 } },
    );
    logger.warn(`Default Super Admin password reset from SUPER_ADMIN_PASSWORD: ${email}. Remove SUPER_ADMIN_RESET_PASSWORD from .env now.`);
    return;
  }

  await createPlatformAdmin({ name, email, password });
  logger.info(`Default Super Admin created: ${email}`);
  if (!strong) logger.warn('Default Super Admin uses a weak password. Change it before going live.');
}
