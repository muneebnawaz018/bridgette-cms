import { NextResponse, type NextRequest } from 'next/server';
import { verifyAccessToken, verifyRefreshToken, signAccessToken } from '@/modules/auth/jwt';

const ACCESS_COOKIE = 'bp_at';
const REFRESH_COOKIE = 'bp_rt';
const isProd = process.env.NODE_ENV === 'production';

/** Access-cookie lifetime in seconds, derived from JWT_ACCESS_TTL (e.g. "24h"). */
function accessMaxAge(): number {
  const t = process.env.JWT_ACCESS_TTL ?? '1h';
  const m = /^(\d+)\s*(s|m|h|d)$/.exec(t.trim());
  if (!m) return 3600;
  return Number(m[1]) * { s: 1, m: 60, h: 3600, d: 86400 }[m[2] as 's' | 'm' | 'h' | 'd'];
}

/**
 * Auth gate + transparent refresh (edge, via jose).
 *
 * - Valid access token → continue.
 * - Access missing/expired but refresh valid → mint a fresh access token and set the
 *   httpOnly cookie on THIS response. No separate /api/auth/refresh round-trip, no client
 *   polling. The refresh token carries role+email so no DB lookup is needed here.
 * - Neither valid → 401 (API) or redirect to /login (pages).
 */
export async function middleware(req: NextRequest) {
  const access = req.cookies.get(ACCESS_COOKIE)?.value;
  if (access) {
    try {
      await verifyAccessToken(access);
      return NextResponse.next();
    } catch {
      /* expired/invalid — try refresh */
    }
  }

  const refresh = req.cookies.get(REFRESH_COOKIE)?.value;
  if (refresh) {
    try {
      const p = await verifyRefreshToken(refresh);
      // Edge can't reach Mongo, so confirm the refresh token hasn't been revoked (sign out
      // other devices / everywhere / admin disable) via a Node probe before minting.
      const check = await fetch(new URL('/api/auth/session-check', req.url), {
        headers: { cookie: req.headers.get('cookie') ?? '' },
      });
      if (!check.ok) throw new Error('Session revoked');

      // Mint with the role the probe just read from the database, NOT the one baked into the
      // refresh token at sign-in. Those differ the moment someone is demoted, and minting
      // from the token kept handing back the old role every hour until the refresh expired,
      // so a demotion took up to seven days to bite. The token's own role claim is now only
      // a fallback for the case where the probe somehow answers without one.
      const { role: liveRole } = (await check.json().catch(() => ({}))) as { role?: string };
      const role = (liveRole as typeof p.role) ?? p.role;

      // Carry the device-session id across, so the replacement access token stays revocable.
      const newAccess = await signAccessToken({ sub: p.sub, role, email: p.email, jti: p.jti });
      const res = NextResponse.next();
      res.cookies.set(ACCESS_COOKIE, newAccess, {
        httpOnly: true,
        secure: isProd,
        sameSite: 'lax',
        path: '/',
        maxAge: accessMaxAge(),
      });
      return res;
    } catch {
      /* invalid/expired/revoked refresh — fall through */
    }
  }

  if (req.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('next', req.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/invoices/:path*',
    '/terms/:path*',
    '/terms',
    '/users/:path*',
    '/settings/:path*',
    '/profile/:path*',
    '/api/invoices/:path*',
    '/api/auth/users/:path*',
    '/api/dashboard/:path*',
  ],
};
