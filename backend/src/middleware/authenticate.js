import { effectivePermissions, WILDCARD_PERMISSION } from '@jerp/shared';
import { runWithContext } from '../core/context/requestContext.js';
import { loadPrincipal, resolveActiveBranch } from '../modules/auth/principal.service.js';
import { verifyAccessToken } from '../modules/auth/token.service.js';
import { ApiError } from '../utils/ApiError.js';

function readBearer(req) {
  const header = req.get('authorization');
  if (!header?.startsWith('Bearer ')) throw ApiError.unauthorized();
  try {
    return verifyAccessToken(header.slice(7));
  } catch (err) {
    if (err.name === 'TokenExpiredError') throw ApiError.unauthorized('Session expired', 'TOKEN_EXPIRED');
    throw ApiError.unauthorized('Invalid token', 'INVALID_TOKEN');
  }
}

export async function authenticate(req, res, next) {
  const payload = readBearer(req);
  const principal = await loadPrincipal(payload);
  if (principal.mustChangePassword && req.baseUrl !== '/api/v1/auth') {
    throw ApiError.forbidden('Please change your password to continue', 'PASSWORD_CHANGE_REQUIRED');
  }
  const { branchId, allowedPermissions } = await resolveActiveBranch(principal, req.get('x-branch-id'));
  const rolePermissions = principal.permissions;
  const permissions = new Set(effectivePermissions(rolePermissions, allowedPermissions));
  const fullAccess = rolePermissions.has(WILDCARD_PERMISSION);

  req.auth = { ...principal, permissions, rolePermissions, fullAccess, branchId };

  runWithContext(
    {
      organisationId: String(principal.organisationId),
      userId: String(principal.userId),
      sessionId: String(principal.sessionId),
      permissions,
      rolePermissions,
      fullAccess,
      branchAccess: principal.branchAccess,
      branchId,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
      requestId: req.id,
    },
    next,
  );
}
