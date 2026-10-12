import { SYSTEM_ROLE_TEMPLATES } from '@jerp/shared';
import { logger } from '../../config/logger.js';
import { Role } from './role.model.js';

/**
 * Run at start-up. Default roles an organisation has not edited follow the shipped templates, so they pick up
 * permissions added in later releases; edited ones are left as the organisation set them. Roles that used to be
 * defaults (organisations created before the default set was trimmed) become ordinary roles: kept with their
 * users, and now editable and deletable like any other.
 */
export async function syncSystemRoles() {
  let changed = 0;
  for (const t of SYSTEM_ROLE_TEMPLATES) {
    const res = await Role.updateMany({ isSystem: true, key: t.key, customised: { $ne: true } }, { $set: { name: t.name, description: t.description, permissions: t.permissions } }).setOptions({ skipTenant: true });
    changed += res.modifiedCount ?? 0;
  }
  const retired = await Role.updateMany({ isSystem: true, key: { $nin: SYSTEM_ROLE_TEMPLATES.map((t) => t.key) } }, { $set: { isSystem: false } }).setOptions({ skipTenant: true });
  if (changed) logger.info({ changed }, 'Default roles updated to the latest templates');
  if (retired.modifiedCount) logger.info({ retired: retired.modifiedCount }, 'Former default roles turned into ordinary roles');
}
