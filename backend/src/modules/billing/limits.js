import { PLAN_LIMITS, SUBSCRIPTION_STATUS, TRIAL_BRANCH_LIMIT } from '@jerp/shared';

const DAY = 86400000;

/** The plan's own limits on a subscription: its snapshot, or the built-in table for older records. null = unlimited. */
export function planLimitsOf(sub) {
  const snap = sub?.limits;
  if (snap && ['users', 'branches', 'products'].some((k) => snap[k] !== undefined)) {
    return { users: snap.users ?? null, branches: snap.branches ?? null, products: snap.products ?? null };
  }
  return PLAN_LIMITS[sub?.plan] ?? { users: null, branches: null, products: null };
}

/**
 * What the organisation may use now: its plan's limits, except that a free trial allows TRIAL_BRANCH_LIMIT branches
 * (head office included). Once it pays, branches follow the plan it bought. null = unlimited.
 */
export function limitsOf(sub) {
  const limits = planLimitsOf(sub);
  return sub?.status === SUBSCRIPTION_STATUS.TRIAL ? { ...limits, branches: TRIAL_BRANCH_LIMIT } : limits;
}

/**
 * Where a subscription really stands now. The stored status is updated only by payments and the Super Admin,
 * so a trial or period that has run out is reported as expired here (no scheduled job needed).
 */
export function effectiveSubscription(sub, now = new Date()) {
  if (!sub) return { status: SUBSCRIPTION_STATUS.EXPIRED, endsAt: null, daysLeft: 0, expired: true };
  const endsAt = sub.status === SUBSCRIPTION_STATUS.TRIAL ? sub.trialEndsAt : sub.currentPeriodEnd;
  const blocked = [SUBSCRIPTION_STATUS.SUSPENDED, SUBSCRIPTION_STATUS.CANCELLED, SUBSCRIPTION_STATUS.EXPIRED].includes(sub.status);
  const lapsed = endsAt ? new Date(endsAt).getTime() < now.getTime() : false;
  const expired = blocked || lapsed;
  const daysLeft = endsAt && !expired ? Math.max(0, Math.ceil((new Date(endsAt).getTime() - now.getTime()) / DAY)) : 0;
  return { status: expired && !blocked ? SUBSCRIPTION_STATUS.EXPIRED : sub.status, endsAt: endsAt ?? null, daysLeft, expired };
}
