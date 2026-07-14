import { cookies } from 'next/headers';
import { env } from '@/lib/config/env';

export const ACCESS_COOKIE = 'bp_at';
export const REFRESH_COOKIE = 'bp_rt';

/** Parse a JWT-style duration ("15m", "1h", "24h", "7d", "30s") into seconds. */
function durationToSeconds(ttl: string, fallback: number): number {
  const m = /^(\d+)\s*(s|m|h|d)$/.exec(ttl.trim());
  if (!m) return fallback;
  const n = Number(m[1]);
  const unit = { s: 1, m: 60, h: 3600, d: 86400 }[m[2] as 's' | 'm' | 'h' | 'd'];
  return n * unit;
}

// Cookie lifetimes are derived from the same env TTLs used to sign the tokens, so they
// never drift. JWT_ACCESS_TTL / JWT_REFRESH_TTL are the single source of truth.
const ACCESS_MAX_AGE = durationToSeconds(env.accessTokenTtl, 60 * 60);
const REFRESH_MAX_AGE = durationToSeconds(env.refreshTokenTtl, 60 * 60 * 24 * 7);

const baseOptions = {
  httpOnly: true,
  secure: env.isProd,
  sameSite: 'lax' as const,
  path: '/',
};

export async function setAuthCookies(accessToken: string, refreshToken: string): Promise<void> {
  const store = await cookies();
  store.set(ACCESS_COOKIE, accessToken, { ...baseOptions, maxAge: ACCESS_MAX_AGE });
  store.set(REFRESH_COOKIE, refreshToken, { ...baseOptions, maxAge: REFRESH_MAX_AGE });
}

export async function clearAuthCookies(): Promise<void> {
  const store = await cookies();
  store.delete(ACCESS_COOKIE);
  store.delete(REFRESH_COOKIE);
}

export async function readAccessToken(): Promise<string | undefined> {
  return (await cookies()).get(ACCESS_COOKIE)?.value;
}

export async function readRefreshToken(): Promise<string | undefined> {
  return (await cookies()).get(REFRESH_COOKIE)?.value;
}
