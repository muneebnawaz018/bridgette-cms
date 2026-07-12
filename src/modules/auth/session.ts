import 'server-only';
import { readAccessToken } from './cookies';
import { verifyAccessToken } from './jwt';
import { Role, Permission, assertCan } from './rbac';

export interface SessionUser {
  userId: string;
  role: Role;
  email: string;
}

/** Current session from the access-token cookie, or null if unauthenticated. */
export async function getSession(): Promise<SessionUser | null> {
  const token = await readAccessToken();
  if (!token) return null;
  try {
    const payload = verifyAccessToken(token);
    return { userId: payload.sub, role: payload.role, email: payload.email };
  } catch {
    return null;
  }
}

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
