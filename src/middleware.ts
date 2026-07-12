import { NextResponse, type NextRequest } from 'next/server';

const ACCESS_COOKIE = 'bp_at';

/**
 * Coarse auth gate (edge). Only checks for the presence of the access cookie — it does
 * NOT verify the JWT (jsonwebtoken isn't edge-safe). Fine-grained RBAC lives in the
 * route handlers / server components via requirePermission(). This just bounces clearly
 * unauthenticated traffic early.
 */
export function middleware(req: NextRequest) {
  const hasToken = Boolean(req.cookies.get(ACCESS_COOKIE)?.value);
  if (hasToken) return NextResponse.next();

  const { pathname } = req.nextUrl;

  // Unauthenticated API calls → 401 JSON.
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Unauthenticated page loads → redirect to login.
  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

// Protect the dashboard shell and the invoices API. Auth routes/pages stay public.
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/invoices/:path*',
    '/users/:path*',
    '/api/invoices/:path*',
    '/api/auth/users/:path*',
  ],
};
