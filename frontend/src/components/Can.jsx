import { usePermission } from '../hooks/usePermission.js';

export default function Can({ perm, children, fallback = null }) {
  return usePermission(perm) ? children : fallback;
}
