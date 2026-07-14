import { SignJWT, jwtVerify } from 'jose';
import { Role } from './rbac';

/**
 * JWT helpers backed by `jose` — works in both the Node.js and Edge (middleware)
 * runtimes, unlike `jsonwebtoken`. Secrets are read from process.env directly so this
 * module stays edge-safe (no server-only imports).
 */

const ACCESS_TTL = process.env.JWT_ACCESS_TTL ?? '1h';
const REFRESH_TTL = process.env.JWT_REFRESH_TTL ?? '7d';

function accessKey(): Uint8Array {
  const s = process.env.JWT_ACCESS_SECRET;
  if (!s) throw new Error('JWT_ACCESS_SECRET is not set');
  return new TextEncoder().encode(s);
}
function refreshKey(): Uint8Array {
  const s = process.env.JWT_REFRESH_SECRET;
  if (!s) throw new Error('JWT_REFRESH_SECRET is not set');
  return new TextEncoder().encode(s);
}

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  email: string;
}

// Refresh carries role+email too, so the middleware can mint a new access token from it
// without a database lookup.
export interface RefreshTokenPayload {
  sub: string;
  jti: string;
  role: Role;
  email: string;
}

export async function signAccessToken(p: AccessTokenPayload): Promise<string> {
  return new SignJWT({ role: p.role, email: p.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(p.sub)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TTL)
    .sign(accessKey());
}

export async function signRefreshToken(p: RefreshTokenPayload): Promise<string> {
  return new SignJWT({ jti: p.jti, role: p.role, email: p.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(p.sub)
    .setIssuedAt()
    .setExpirationTime(REFRESH_TTL)
    .sign(refreshKey());
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  const { payload } = await jwtVerify(token, accessKey());
  return { sub: String(payload.sub), role: payload.role as Role, email: String(payload.email) };
}

export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
  const { payload } = await jwtVerify(token, refreshKey());
  return {
    sub: String(payload.sub),
    jti: String(payload.jti),
    role: payload.role as Role,
    email: String(payload.email),
  };
}
