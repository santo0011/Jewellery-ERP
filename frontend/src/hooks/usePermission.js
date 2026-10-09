import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useMeQuery } from '../features/auth/authApi.js';

export function useSession() {
  const authenticated = useSelector((s) => s.auth.status === 'authenticated');
  return useMeQuery(undefined, { skip: !authenticated });
}

export function usePermissions() {
  const { data } = useSession();
  return useMemo(() => new Set(data?.permissions ?? []), [data?.permissions]);
}

/** `permission` may be a list: any one of them is enough. */
export function usePermission(permission) {
  const permissions = usePermissions();
  if (!permission) return true;
  return Array.isArray(permission) ? permission.some((p) => permissions.has(p)) : permissions.has(permission);
}
