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
 * Current session. Prefers the short-lived access token; if it's missing/expired, falls
 * back to the refresh token (verify + load the user) so a valid 7-day session isn't
 * dropped just because the access token expired. Cookies get rotated separately by the
 * client SessionRefresher / the /api/auth/refresh route.
 */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const access = await readAccessToken();
  if (access) {
    try {
      const payload = await verifyAccessToken(access);
      // Only trust the token's role if it's a known role; otherwise fall through to the
      // refresh path, which reloads the authoritative role from the database.
      if (isValidRole(payload.role)) {
        return { userId: payload.sub, role: payload.role, email: payload.email };
      }
    } catch {
      /* expired/invalid — try refresh below */
    }
  }

  const refresh = await readRefreshToken();
  if (refresh) {
    try {
      const payload = await verifyRefreshToken(refresh);
      await connectDb();
      // Enforce revocation: a revoked refresh token (sign out others/everywhere/admin) is
      // no longer a valid session, even though its JWT is still cryptographically valid.
      const stored = await RefreshToken.findOne({ jti: payload.jti, revokedAt: null }).select('_id').lean();
      if (!stored) return null;

      const user = await User.findById(payload.sub).lean<{
        _id: unknown;
        role: Role;
        email: string;
        status: string;
      }>();
      if (user && user.status === UserStatus.Active && isValidRole(user.role)) {
        return { userId: String(user._id), role: user.role, email: user.email };
      }
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
