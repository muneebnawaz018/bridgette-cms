import 'server-only';
import { cache } from 'react';
import { readAccessToken, readRefreshToken } from './cookies';
import { verifyAccessToken, verifyRefreshToken } from './jwt';
import { connectDb } from '@/lib/db/connection';
import { User } from './models/user.model';
import { RefreshToken } from './models/refresh-token.model';
import { UserStatus } from './enums';
import { Role, Permission, assertCan } from './rbac';

export interface SessionUser {
  userId: string;
  role: Role;
  email: string;
}

// Guards against stale/legacy tokens whose `role` claim predates the current enum (which
// would make ROLE_PERMISSIONS[role] undefined and crash downstream consumers).
const VALID_ROLES = new Set<string>(Object.values(Role));
function isValidRole(role: unknown): role is Role {
  return typeof role === 'string' && VALID_ROLES.has(role);
}

/**
 * The account as it stands right now, read from the database.
 *
 * A JWT is a photograph, not a live feed: every claim inside it froze at the moment it was
 * signed. Authorising off the token's `role` claim meant a demotion changed nothing until
 * that token expired, and a disabled account kept working for exactly as long. So the token
 * is only ever asked to prove identity, which its signature does, and every authorisation
 * answer is read from here instead.
 *
 * Returns null when the account is gone, disabled, or carries a role the enum no longer
 * knows — all three end the session on the very next request.
 */
async function liveAccount(userId: string): Promise<SessionUser | null> {
  const user = await User.findById(userId).select('role status email').lean<{
    _id: unknown;
    role?: string;
    status?: string;
    email?: string;
  }>();
  if (!user || user.status !== UserStatus.Active) return null;
  if (!isValidRole(user.role)) return null;
  return { userId: String(user._id), role: user.role, email: user.email ?? '' };
}

/**
 * Is this device's session still active? Signing out one device, all others, or everywhere
 * revokes the refresh token row, and an admin disabling someone does the same. The JWT stays
 * cryptographically valid through all of that, so the row is the only thing that knows.
 *
 * The row is matched on BOTH jti and userId. Access tokens are only checked for jti existence
 * (they carry no stored hash to compare against), so without the userId bind, anyone able to
 * mint a signed token — e.g. if the signing secret leaked — could set `sub` to a victim and
 * reuse any live jti to impersonate them. Requiring the jti's row to belong to `sub` closes
 * that: a legitimate token's jti was issued for its own user, so this never rejects real ones.
 */
async function deviceSessionIsLive(jti: string, userId: string): Promise<boolean> {
  const stored = await RefreshToken.findOne({ jti, userId, revokedAt: null }).select('_id').lean();
  return Boolean(stored);
}

/**
 * Current session: identity from the signed cookie, role and status from the database.
 *
 * Prefers the access token; if it's missing or expired, falls back to the refresh token so a
 * valid 7-day session isn't dropped just because the access token aged out. Either way both
 * database checks run, so a role change, a disable, and a remote sign-out all take effect on
 * the next request rather than whenever a token happens to expire.
 *
 * Wrapped in react's cache(), so the two lookups happen once per request no matter how many
 * layouts, pages and route handlers ask for the session. They're independent, so they run
 * concurrently and cost one round trip, not two.
 */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const access = await readAccessToken();
  if (access) {
    try {
      const payload = await verifyAccessToken(access);
      // Access tokens minted before they carried a jti can't be matched to a device session,
      // so they fall through to the refresh path below, which can do that check. Existing
      // sessions heal themselves the next time a token is issued.
      if (payload.jti) {
        await connectDb();
        const [account, deviceLive] = await Promise.all([
          liveAccount(payload.sub),
          deviceSessionIsLive(payload.jti, payload.sub),
        ]);
        return deviceLive ? account : null;
      }
    } catch {
      /* expired/invalid signature, or the database is unreachable — try refresh below */
    }
  }

  const refresh = await readRefreshToken();
  if (refresh) {
    try {
      const payload = await verifyRefreshToken(refresh);
      await connectDb();
      const [account, deviceLive] = await Promise.all([
        liveAccount(payload.sub),
        deviceSessionIsLive(payload.jti, payload.sub),
      ]);
      return deviceLive ? account : null;
    } catch {
      /* invalid/expired refresh */
    }
  }

  return null;
});

/** Session or throw — for server actions / route handlers that require auth. */
export async function requireSession(): Promise<SessionUser> {
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');
  return session;
}

/** Require auth + a specific permission. Throws on failure. */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const session = await requireSession();
  assertCan(session.role, permission);
  return session;
}
