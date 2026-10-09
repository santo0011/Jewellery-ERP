import { effectivePermissions, WILDCARD_PERMISSION } from '@jerp/shared';
import { runWithContext } from '../core/context/requestContext.js';
import { loadPrincipal, resolveActiveBranch } from '../modules/auth/principal.service.js';
import { verifyAccessToken } from '../modules/auth/token.service.js';
import { ApiError } from '../utils/ApiError.js';
import { Subscription } from '../modules/organisations/subscription.model.js';
import { effectiveSubscription } from '../modules/billing/limits.js';

// While the subscription has run out, only signing in/out and the billing page work — so they can renew.
const OPEN_WHEN_EXPIRED = ['/api/v1/auth', '/api/v1/billing'];

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
  if (!OPEN_WHEN_EXPIRED.includes(req.baseUrl)) {
    const sub = await Subscription.findOne({ organisationId: principal.organisationId }).setOptions({ skipTenant: true }).select('status trialEndsAt currentPeriodEnd').lean();
    if (effectiveSubscription(sub).expired) {
      throw new ApiError(402, 'SUBSCRIPTION_EXPIRED', 'Your subscription has ended. Renew it under Settings → Subscription to continue.');
    }
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
