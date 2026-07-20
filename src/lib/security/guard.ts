import 'server-only';
import { requirePermission, requireSession, type Permission, type SessionUser } from '@/modules/auth';
import { enforce, LIMITS, type RateLimitRule } from '@/lib/security/rateLimit';

/**
 * Authorisation plus a per-user ceiling, for anything that writes.
 *
 * Permissions answer "may this person do this at all", which says nothing about how fast.
 * A signed-in account, or a stolen session, can still hammer a write endpoint hard enough to
 * hurt. The limit is deliberately generous: it is a backstop against automation, not
 * something a person clicking around will ever notice.
 */
export async function requireWrite(permission: Permission): Promise<SessionUser> {
  const actor = await requirePermission(permission);
  await enforce(`write:user:${actor.userId}`, LIMITS.writePerUser);
  return actor;
}

/** Same, for writes that only need a session rather than a named permission. */
export async function requireSessionWrite(): Promise<SessionUser> {
  const actor = await requireSession();
  await enforce(`write:user:${actor.userId}`, LIMITS.writePerUser);
  return actor;
}

/**
 * Authorisation plus a custom limit, for reads heavy enough to need their own budget.
 * Used by the invoice export, which scans and serialises up to 5000 documents per call.
 */
export async function requireLimited(
  permission: Permission,
  key: string,
  rule: RateLimitRule,
): Promise<SessionUser> {
  const actor = await requirePermission(permission);
  await enforce(`${key}:${actor.userId}`, rule);
  return actor;
}
