import 'server-only';
import { UAParser } from 'ua-parser-js';
import { connectDb } from '@/lib/db/connection';
import { normalizeIp, isLocalIp, resolveOrigin, type Origin } from '@/lib/geo/ipLocation';
import { RefreshToken } from '../models/refresh-token.model';
import { verifyRefreshToken } from '../jwt';
import { readRefreshToken, clearAuthCookies } from '../cookies';
import type { SessionUser } from '../session';

export interface ActiveSession {
  id: string; // the token's jti
  current: boolean;
  status: 'active' | 'revoked';
  device: string; // humanized user-agent
  ip: string | null; // display-friendly (loopback/private shown as "Localhost")
  location: string | null; // "City, Region, Country" or null
  createdAt: string; // ISO
  expiresAt: string; // ISO
  revokedAt: string | null; // ISO, set once signed out
}

/** How many recently revoked sessions to keep visible in the audit list. */
const REVOKED_HISTORY_LIMIT = 5;

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

/**
 * Human-readable device label from a user-agent, via the ua-parser-js library (not
 * hand-rolled regex). Prefers a real device model when the UA exposes one
 * (e.g. "Apple iPhone", "Samsung SM-G991B"), and falls back to "Chrome on macOS".
 */
function describeDevice(ua?: string | null): string {
  if (!ua) return 'Unknown device';
  const { browser, os, device } = new UAParser(ua).getResult();

  if (device.model) {
    const vendor =
      device.vendor && !device.model.startsWith(device.vendor) ? `${device.vendor} ` : '';
    return `${vendor}${device.model}`.trim();
  }

  const browserName = browser.name ?? 'Browser';
  return `${browserName} on ${os.name ?? 'unknown OS'}`;
}

/** Show a real IP, or "Localhost" for loopback/private addresses (never the raw "::1"). */
function displayIp(ip?: string | null): string | null {
  const norm = normalizeIp(ip);
  if (!norm) return null;
  return isLocalIp(norm) ? 'Localhost' : norm;
}

type SessionLean = {
  jti: string;
  userAgent?: string;
  ip?: string;
  location?: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt?: Date | null;
};

/**
 * Backfill IP + location for sessions saved before geolocation existed, or that stored a
 * loopback address (upgraded to the machine's public IP). Best-effort, deduped, persisted
 * so it only runs once per session.
 */
async function backfillLocations(docs: SessionLean[]): Promise<void> {
  const cache = new Map<string, Origin>();
  for (const d of docs) {
    const norm = normalizeIp(d.ip);
    const local = !norm || isLocalIp(norm);
    // Already has a public IP and a location — nothing to do.
    if (d.location && norm && !local) continue;

    const key = local ? '__self' : norm;
    let origin = cache.get(key);
    if (!origin) {
      origin = await resolveOrigin(d.ip);
      cache.set(key, origin);
    }
    if (!origin.ip) continue;

    const update: { ip?: string; location?: string } = {};
    if (local) update.ip = origin.ip; // replace "::1" with the real public IP
    if (origin.location && !d.location) update.location = origin.location;
    if (Object.keys(update).length === 0) continue;

    Object.assign(d, update);
    await RefreshToken.updateOne({ jti: d.jti }, { $set: update });
  }
}

/**
 * Active sessions (newest first) plus the last few that were signed out, so the user has
 * an audit trail. Revoked rows are kept in the database (never deleted) until the TTL
 * index purges them once they expire.
 */
export async function listSessions(actor: SessionUser): Promise<ActiveSession[]> {
  await connectDb();
  const jti = await currentJti();

  const [active, revoked] = await Promise.all([
    RefreshToken.find({ userId: actor.userId, revokedAt: null, expiresAt: { $gt: new Date() } })
      .sort({ createdAt: -1 })
      .lean<SessionLean[]>(),
    // Intentionally-revoked sessions (per-device revoke, "sign out others", password
    // reset, admin disable). A normal logout is tagged 'logout' and excluded; legacy
    // revokes with no reason still surface so the audit list isn't empty.
    RefreshToken.find({
      userId: actor.userId,
      revokedAt: { $ne: null },
      revokedReason: { $nin: ['logout', 'rotate'] },
    })
      .sort({ revokedAt: -1 })
      .limit(REVOKED_HISTORY_LIMIT)
      .lean<SessionLean[]>(),
  ]);

  await backfillLocations([...active, ...revoked]);

  const toDto = (d: SessionLean, status: 'active' | 'revoked'): ActiveSession => ({
    id: d.jti,
    current: status === 'active' && d.jti === jti,
    status,
    device: describeDevice(d.userAgent),
    ip: displayIp(d.ip),
    location: d.location ?? null,
    createdAt: d.createdAt.toISOString(),
    expiresAt: d.expiresAt.toISOString(),
    revokedAt: d.revokedAt ? d.revokedAt.toISOString() : null,
  });

  return [...active.map((d) => toDto(d, 'active')), ...revoked.map((d) => toDto(d, 'revoked'))];
}

/** Revoke one specific session by jti (must belong to the actor). */
export async function revokeSession(actor: SessionUser, jti: string): Promise<void> {
  await connectDb();
  await RefreshToken.updateOne(
    { userId: actor.userId, jti, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: 'revoked' } },
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
    { $set: { revokedAt: new Date(), revokedReason: 'revoked' } },
  );
  return res.modifiedCount ?? 0;
}

/** Revoke ALL sessions (including this device) and clear cookies → forces re-login. */
export async function revokeAllSessions(actor: SessionUser): Promise<void> {
  await connectDb();
  await RefreshToken.updateMany(
    { userId: actor.userId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: 'revoked' } },
  );
  await clearAuthCookies();
}
