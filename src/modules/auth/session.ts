import 'server-only';
import { cache } from 'react';
import { readAccessToken, readRefreshToken } from './cookies';
import { verifyAccessToken, verifyRefreshToken } from './jwt';
import { connectDb } from '@/lib/db/connection';
import { User } from './models/user.model';
import { UserStatus } from './enums';
import { Role, Permission, assertCan } from './rbac';

export interface SessionUser {
  userId: string;
  role: Role;
  email: string;
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
      return { userId: payload.sub, role: payload.role, email: payload.email };
    } catch {
      /* expired/invalid — try refresh below */
    }
  }

  const refresh = await readRefreshToken();
  if (refresh) {
    try {
      const payload = await verifyRefreshToken(refresh);
      await connectDb();
      const user = await User.findById(payload.sub).lean<{
        _id: unknown;
        role: Role;
        email: string;
        status: string;
      }>();
      if (user && user.status === UserStatus.Active) {
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
