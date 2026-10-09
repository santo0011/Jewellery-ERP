import { SYSTEM_ROLE_TEMPLATES } from '@jerp/shared';
import { logger } from '../../config/logger.js';
import { Role } from './role.model.js';

/**
 * System roles cannot be edited by users, so they always match the shipped templates. Run at start-up so
 * organisations created earlier pick up permissions added in later releases (e.g. payroll for Branch Manager).
 */
export async function syncSystemRoles() {
  let changed = 0;
  for (const t of SYSTEM_ROLE_TEMPLATES) {
    const res = await Role.updateMany({ isSystem: true, key: t.key }, { $set: { name: t.name, description: t.description, permissions: t.permissions } }).setOptions({ skipTenant: true });
    changed += res.modifiedCount ?? 0;
  }
  if (changed) logger.info({ changed }, 'System roles updated to the latest templates');
}
