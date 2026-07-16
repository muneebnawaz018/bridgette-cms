import { NextResponse } from 'next/server';
import { connectDb } from '@/lib/db/connection';
import { verifyRefreshToken } from '@/modules/auth/jwt';
import { readRefreshToken } from '@/modules/auth/cookies';
import { RefreshToken } from '@/modules/auth/models/refresh-token.model';
import { User } from '@/modules/auth/models/user.model';
import { UserStatus } from '@/modules/auth/enums';

/**
 * Lightweight session-validity probe used by the edge middleware before it mints a fresh
 * access token from a refresh token. The middleware runs on the edge and cannot reach
 * MongoDB, so it delegates the revocation check here (Node): is this refresh token still
 * active (not revoked) and is the user still enabled? No rotation, no cookie changes.
 *
 * This is what actually enforces "sign out other devices" / "sign out everywhere"
 * server-side: once a revoked device's access token expires, the middleware asks here and
 * gets a 401, so it stops issuing new access tokens for that device.
 */
export async function GET() {
  const token = await readRefreshToken();
  if (!token) return NextResponse.json({ valid: false }, { status: 401 });

  try {
    const payload = await verifyRefreshToken(token);
    await connectDb();

    const stored = await RefreshToken.findOne({ jti: payload.jti, revokedAt: null }).select('_id').lean();
    if (!stored) return NextResponse.json({ valid: false }, { status: 401 });

    const user = await User.findById(payload.sub).select('status').lean<{ status?: string }>();
    if (!user || user.status !== UserStatus.Active) {
      return NextResponse.json({ valid: false }, { status: 401 });
    }
    return NextResponse.json({ valid: true });
  } catch {
    return NextResponse.json({ valid: false }, { status: 401 });
  }
}
