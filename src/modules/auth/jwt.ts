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
  /**
   * Informational only — NEVER authorise off this. It froze when the token was minted, so it
   * is wrong for the rest of the token's life the moment someone is demoted. getSession()
   * reads the account's real role from the database on every request; that is the authority.
   */
  role: Role;
  email: string;
  /**
   * The jti of the refresh token this access token was issued alongside, i.e. the id of the
   * device session. It lets getSession() tell that this device was signed out without having
   * to read the refresh cookie. Optional: access tokens minted before this claim existed
   * still verify, and simply fall back to the refresh path.
   */
  jti?: string;
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
  const jwt = new SignJWT({ role: p.role, email: p.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(p.sub)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TTL);
  if (p.jti) jwt.setJti(p.jti);
  return jwt.sign(accessKey());
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
  return {
    sub: String(payload.sub),
    role: payload.role as Role,
    email: String(payload.email),
    jti: payload.jti ? String(payload.jti) : undefined,
  };
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
