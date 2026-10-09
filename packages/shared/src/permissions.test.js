import { describe, expect, it } from 'vitest';
import { ALL_PERMISSIONS, expandPermissions, hasPermission, isValidPermission } from './permissions.js';
import { SYSTEM_ROLE_TEMPLATES } from './roles.js';
import { roleSchema } from './schemas/role.js';

describe('permissions', () => {
  it('uses module.action keys without duplicates', () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
    for (const p of ALL_PERMISSIONS) expect(p).toMatch(/^[a-z]+\.[a-zA-Z]+$/);
  });

  it('honours wildcard', () => {
    expect(hasPermission(['*'], 'sales.create')).toBe(true);
    expect(hasPermission(['sales.view'], 'sales.create')).toBe(false);
    expect(expandPermissions(['*'])).toHaveLength(ALL_PERMISSIONS.length);
  });

  it('system role templates only reference known permissions', () => {
    for (const role of SYSTEM_ROLE_TEMPLATES) {
      expect(role.permissions.length).toBeGreaterThan(0);
      for (const p of role.permissions) expect(isValidPermission(p)).toBe(true);
    }
  });

  it('role schema rejects unknown and wildcard permissions', () => {
    expect(roleSchema.safeParse({ name: 'X1', permissions: ['*'] }).success).toBe(false);
    expect(roleSchema.safeParse({ name: 'X1', permissions: ['sales.fly'] }).success).toBe(false);
    expect(roleSchema.parse({ name: 'X1', permissions: ['sales.view', 'sales.view'] }).permissions).toEqual(['sales.view']);
  });
});
