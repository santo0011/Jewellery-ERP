import { effectivePermissions, WILDCARD_PERMISSION, withinBranchAccess } from '@jerp/shared';
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
  const { branchId } = await resolveActiveBranch(principal, req.get('x-branch-id'));
  const rolePermissions = principal.permissions;
  // What a user may do comes from their role alone (no per-branch module limits). Branch-limited users never hold
  // organisation-level permissions, whatever their role says (see isOrganisationLevel).
  const permissions = new Set(withinBranchAccess(effectivePermissions(rolePermissions, null), principal.branchAccess.all));
  const fullAccess = rolePermissions.has(WILDCARD_PERMISSION) && principal.branchAccess.all;

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
      // Navbar filter set to 'All branches': list pages show every branch the user can see.
      branchView: req.get('x-branch-view') === 'all' ? 'all' : null,
      ip: req.ip,
      userAgent: req.get('user-agent') ?? null,
      requestId: req.id,
    },
    next,
  );
}
