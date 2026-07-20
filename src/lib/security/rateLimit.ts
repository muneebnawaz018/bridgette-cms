import 'server-only';
import { connectDb } from '@/lib/db/connection';
import { logger } from '@/lib/logger/logger';
import { RateLimitCounter } from './rate-limit.model';

/**
 * Fixed-window rate limiting, backed by Mongo with an in-process cache in front.
 *
 * Two things it is and is not. It stops abuse: brute force, credential stuffing, and the
 * amplification where one unauthenticated request costs the server 300ms of bcrypt. It does
 * not stop a volumetric DDoS, because by the time traffic saturates the host this code never
 * runs. That job belongs upstream, at Cloudflare or the platform edge.
 *
 * The in-process cache matters under attack: once a key is known to be over its limit for
 * the current window, further requests are rejected without touching the database, so a
 * flood cannot turn into a write storm against Mongo.
 *
 * Windows are fixed rather than sliding. A caller can therefore get up to 2x the limit
 * across a window boundary. That is the standard trade for not storing a timestamp per
 * request, and at these limits it does not change the outcome.
 */

export interface RateLimitRule {
  /** Maximum requests allowed inside the window. */
  limit: number;
  /** Window length in seconds. */
  windowSec: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Seconds until the current window resets. */
  retryAfter: number;
}

/** Per-process view of the current window, so a flood short-circuits before the database. */
const local = new Map<string, { count: number; resetAt: number }>();

/** Keep the map from growing without bound if a lot of distinct keys go by. */
const MAX_LOCAL_KEYS = 10_000;

function sweepLocal(now: number): void {
  if (local.size < MAX_LOCAL_KEYS) return;
  for (const [k, v] of local) if (v.resetAt <= now) local.delete(k);
  // Still oversized (a genuine flood of unique keys): drop it and start fresh. Mongo stays
  // authoritative, so this costs accuracy for one window, never correctness.
  if (local.size >= MAX_LOCAL_KEYS) local.clear();
}

/**
 * Count one hit against `key` and say whether it is allowed.
 *
 * Fails open. If Mongo is unreachable the request is permitted, because a limiter that locks
 * everyone out during a database blip is a worse outage than the abuse it prevents, and on
 * this app every rate-limited route needs the database to do its job anyway.
 */
export async function consume(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = rule.windowSec * 1000;
  // Fixed window: everyone in the same slice shares a counter, so the key is self-expiring.
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const resetAt = windowStart + windowMs;
  const retryAfter = Math.max(1, Math.ceil((resetAt - now) / 1000));
  const bucketKey = `${key}:${windowStart}`;

  sweepLocal(now);

  const cached = local.get(bucketKey);
  if (cached && cached.resetAt > now && cached.count >= rule.limit) {
    // Already known to be over. Reject without a database round trip.
    return { allowed: false, remaining: 0, retryAfter };
  }

  try {
    await connectDb();
    const doc = await RateLimitCounter.findOneAndUpdate(
      { key: bucketKey },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(resetAt) } },
      { upsert: true, new: true, projection: { count: 1 } },
    ).lean<{ count: number }>();

    const count = doc?.count ?? 1;
    local.set(bucketKey, { count, resetAt });

    return {
      allowed: count <= rule.limit,
      remaining: Math.max(0, rule.limit - count),
      retryAfter,
    };
  } catch (err) {
    logger.warn('rate limit check failed; allowing the request', {
      key,
      error: err instanceof Error ? err.message : String(err),
    });
    return { allowed: true, remaining: rule.limit, retryAfter };
  }
}

/** Thrown when a caller is over its limit. `handle()` maps this to 429. */
export class RateLimitedError extends Error {
  readonly retryAfter: number;
  constructor(retryAfter: number, message?: string) {
    super(message ?? `Too many requests. Try again in ${retryAfter} seconds.`);
    this.name = 'RateLimitedError';
    this.retryAfter = retryAfter;
  }
}

/** Count a hit and throw `RateLimitedError` if the caller is over. */
export async function enforce(key: string, rule: RateLimitRule, message?: string): Promise<void> {
  const result = await consume(key, rule);
  if (!result.allowed) throw new RateLimitedError(result.retryAfter, message);
}

/**
 * Best-effort client IP.
 *
 * Only trustworthy behind a proxy that overwrites these headers. `cf-connecting-ip` comes
 * first because Cloudflare sets it itself and a client cannot forge it through the proxy.
 * `x-forwarded-for` is a client-supplied list, so its leftmost entry is only meaningful when
 * something upstream rewrites it. Deployed bare, an attacker can rotate this header to dodge
 * per-IP limits, which is one more reason the edge belongs in front of the app.
 */
export function clientIp(req: Request): string {
  const cf = req.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();

  const real = req.headers.get('x-real-ip');
  if (real) return real.trim();

  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();

  return 'unknown';
}

/**
 * The limits, in one place so they can be read as a policy rather than hunted through routes.
 * Keys are what the route passes to `enforce`.
 */
export const LIMITS = {
  /** Sign-in: per IP, and per account so a distributed attempt still trips. */
  loginPerIp: { limit: 10, windowSec: 60 },
  loginPerEmail: { limit: 20, windowSec: 3600 },

  /** Password reset sends real email, so this one also protects domain reputation. */
  forgotPerEmail: { limit: 6, windowSec: 3600 },
  forgotPerIp: { limit: 20, windowSec: 3600 },

  /** OTP consumption. The token itself already caps at 5 wrong codes. */
  otpPerIp: { limit: 20, windowSec: 3600 },

  /** Called by the middleware on every request with an expired access token. */
  sessionCheckPerIp: { limit: 120, windowSec: 60 },

  /** Any authenticated mutation. Generous: it is a backstop, not a UX constraint. */
  writePerUser: { limit: 120, windowSec: 60 },

  /** The heaviest authenticated call: scans and serialises up to 5000 invoices. */
  exportPerUser: { limit: 20, windowSec: 3600 },
} as const satisfies Record<string, RateLimitRule>;
