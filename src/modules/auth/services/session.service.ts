import 'server-only';
import { connectDb } from '@/lib/db/connection';
import { RefreshToken } from '../models/refresh-token.model';
import { verifyRefreshToken } from '../jwt';
import { readRefreshToken, clearAuthCookies } from '../cookies';
import type { SessionUser } from '../session';

export interface ActiveSession {
  id: string; // the token's jti
  current: boolean;
  device: string; // humanized user-agent
  ip: string | null;
  createdAt: string; // ISO
  expiresAt: string; // ISO
}

/** The jti of the refresh token on THIS request, or null if none/invalid. */
export async function currentJti(): Promise<string | null> {
  const token = await readRefreshToken();
  if (!token) return null;
  try {
    return (await verifyRefreshToken(token)).jti;
  } catch {
    return null;
  }
}

/** Turn a raw user-agent string into something readable, e.g. "Chrome on macOS". */
function describeDevice(ua?: string | null): string {
  if (!ua) return 'Unknown device';
  const browser =
    /Edg\//.test(ua) ? 'Edge'
    : /OPR\/|Opera/.test(ua) ? 'Opera'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari'
    : 'Browser';
  const os =
    /Windows/.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad|iOS/.test(ua) ? 'iOS'
    : /Linux/.test(ua) ? 'Linux'
    : 'Unknown OS';
  return `${browser} on ${os}`;
}

/** Active (non-revoked, unexpired) sessions for the current user, newest first. */
export async function listSessions(actor: SessionUser): Promise<ActiveSession[]> {
  await connectDb();
  const jti = await currentJti();
  const docs = await RefreshToken.find({
    userId: actor.userId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .lean<
      { jti: string; userAgent?: string; ip?: string; createdAt: Date; expiresAt: Date }[]
    >();

  return docs.map((d) => ({
    id: d.jti,
    current: d.jti === jti,
    device: describeDevice(d.userAgent),
    ip: d.ip ?? null,
    createdAt: d.createdAt.toISOString(),
    expiresAt: d.expiresAt.toISOString(),
  }));
}

/** Revoke one specific session by jti (must belong to the actor). */
export async function revokeSession(actor: SessionUser, jti: string): Promise<void> {
  await connectDb();
  await RefreshToken.updateOne(
    { userId: actor.userId, jti, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  // If the user just revoked their own current session, drop the cookies too.
  if (jti === (await currentJti())) await clearAuthCookies();
}

/** Revoke every session EXCEPT the current one. Keeps this device signed in. */
export async function revokeOtherSessions(actor: SessionUser): Promise<number> {
  await connectDb();
  const jti = await currentJti();
  const res = await RefreshToken.updateMany(
    { userId: actor.userId, revokedAt: null, ...(jti ? { jti: { $ne: jti } } : {}) },
    { $set: { revokedAt: new Date() } },
  );
  return res.modifiedCount ?? 0;
}

/** Revoke ALL sessions (including this device) and clear cookies → forces re-login. */
export async function revokeAllSessions(actor: SessionUser): Promise<void> {
  await connectDb();
  await RefreshToken.updateMany(
    { userId: actor.userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  await clearAuthCookies();
}
