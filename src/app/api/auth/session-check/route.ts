import { NextResponse } from 'next/server';
import { connectDb } from '@/lib/db/connection';
import { verifyRefreshToken } from '@/modules/auth/jwt';
import { readRefreshToken } from '@/modules/auth/cookies';
import { RefreshToken } from '@/modules/auth/models/refresh-token.model';
import { User } from '@/modules/auth/models/user.model';
import { UserStatus } from '@/modules/auth/enums';
import { Role } from '@/modules/auth/rbac';
import { consume, clientIp, LIMITS } from '@/lib/security/rateLimit';

const VALID_ROLES = new Set<string>(Object.values(Role));

/**
 * Lightweight session-validity probe used by the edge middleware before it mints a fresh
 * access token from a refresh token. The middleware runs on the edge and cannot reach
 * MongoDB, so it delegates the revocation check here (Node): is this refresh token still
 * active (not revoked) and is the user still enabled? No rotation, no cookie changes.
 *
 * This is what actually enforces "sign out other devices" / "sign out everywhere"
 * server-side: once a revoked device's access token expires, the middleware asks here and
 * gets a 401, so it stops issuing new access tokens for that device.
 *
 * It also returns the account's CURRENT role, which is the only authoritative copy. The
 * refresh token carries whatever role was true when the user signed in, so minting from it
 * meant a demotion did not take effect until that token expired, up to seven days later.
 * The middleware mints from the role returned here instead.
 */
export async function GET(req: Request) {
  // The middleware calls this on every request whose access token has expired, so it is a
  // reachable, database-touching endpoint. Limit it, generously, so it cannot be used as a
  // free way to make the app query Mongo in a loop.
  const gate = await consume(`sessioncheck:ip:${clientIp(req)}`, LIMITS.sessionCheckPerIp);
  if (!gate.allowed) {
    return NextResponse.json(
      { valid: false },
      { status: 429, headers: { 'Retry-After': String(gate.retryAfter) } },
    );
  }

  const token = await readRefreshToken();
  if (!token) return NextResponse.json({ valid: false }, { status: 401 });

  try {
    const payload = await verifyRefreshToken(token);
    await connectDb();

    const stored = await RefreshToken.findOne({ jti: payload.jti, revokedAt: null })
      .select('_id')
      .lean();
    if (!stored) return NextResponse.json({ valid: false }, { status: 401 });

    const user = await User.findById(payload.sub)
      .select('status role')
      .lean<{ status?: string; role?: string }>();
    if (!user || user.status !== UserStatus.Active) {
      return NextResponse.json({ valid: false }, { status: 401 });
    }

    // Guard against a role that is no longer in the enum (a renamed or removed role would
    // otherwise be handed straight back to the token signer).
    const role = VALID_ROLES.has(user.role ?? '') ? user.role : undefined;
    if (!role) return NextResponse.json({ valid: false }, { status: 401 });

    return NextResponse.json({ valid: true, role });
  } catch {
    return NextResponse.json({ valid: false }, { status: 401 });
  }
}
