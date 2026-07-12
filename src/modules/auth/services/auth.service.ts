import 'server-only';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { connectDb } from '@/lib/db/connection';
import { env } from '@/lib/config/env';
import { sendMail } from '@/lib/email/mailer';
import { otpEmail, resetPasswordEmail } from '@/lib/email/templates';
import { User } from '../models/user.model';
import { RefreshToken } from '../models/refresh-token.model';
import { UserStatus, OtpPurpose } from '../enums';
import { Role, Permission, assertCan } from '../rbac';
import { hashPassword, verifyPassword } from '../password';
import { issueOtp, verifyOtp, generateUrlToken } from '../otp';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type AccessTokenPayload,
} from '../jwt';
import { setAuthCookies, clearAuthCookies, readRefreshToken } from '../cookies';
import type { SessionUser } from '../session';

const OTP_TTL_MIN = 15;
const RESET_TTL_MIN = 30;
const ADMIN_ROLES: Role[] = [Role.Admin, Role.SuperAdmin];

interface RequestContext {
  userAgent?: string;
  ip?: string;
}

/** Admin/Super Admin creates a user → emails an OTP for verify + set-password. */
export async function createUser(
  actor: SessionUser,
  input: { name: string; email: string; role: Role; phone?: string },
): Promise<{ userId: string }> {
  await connectDb();
  // Creating an Admin/Super Admin requires the elevated permission.
  assertCan(
    actor.role,
    ADMIN_ROLES.includes(input.role) ? Permission.UserCreateAdmin : Permission.UserCreate,
  );

  const email = input.email.toLowerCase().trim();
  const existing = await User.findOne({ email });
  if (existing) throw new Error('A user with this email already exists');

  const user = await User.create({
    name: input.name,
    email,
    phone: input.phone,
    role: input.role,
    status: UserStatus.Invited,
    mustSetPassword: true,
    emailVerified: false,
    createdBy: actor.userId,
  });

  const code = await issueOtp(String(user._id), OtpPurpose.VerifyEmail, OTP_TTL_MIN);
  const mail = otpEmail(user.name, code);
  await sendMail({ to: email, ...mail });
  return { userId: String(user._id) };
}

/** Verify email OTP and set the initial password → account becomes active. */
export async function verifyAndSetPassword(input: {
  email: string;
  code: string;
  password: string;
}): Promise<void> {
  await connectDb();
  const user = await User.findOne({ email: input.email.toLowerCase().trim() });
  if (!user) throw new Error('Invalid verification request');

  const ok = await verifyOtp(String(user._id), OtpPurpose.VerifyEmail, input.code);
  if (!ok) throw new Error('Invalid or expired code');

  user.passwordHash = await hashPassword(input.password);
  user.status = UserStatus.Active;
  user.emailVerified = true;
  user.mustSetPassword = false;
  await user.save();
}

/** Email + password login → issues tokens and sets httpOnly cookies. */
export async function login(
  input: { email: string; password: string },
  ctx: RequestContext = {},
): Promise<SessionUser> {
  await connectDb();
  const user = await User.findOne({ email: input.email.toLowerCase().trim() });
  if (!user || !user.passwordHash || user.status !== UserStatus.Active) {
    throw new Error('Invalid credentials');
  }
  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) throw new Error('Invalid credentials');

  const session: SessionUser = {
    userId: String(user._id),
    role: user.role as Role,
    email: user.email,
  };
  await issueTokens(session, ctx);

  user.lastLoginAt = new Date();
  await user.save();
  return session;
}

/** Sign tokens, persist the refresh token (hashed), set cookies. */
async function issueTokens(session: SessionUser, ctx: RequestContext): Promise<void> {
  const payload: AccessTokenPayload = {
    sub: session.userId,
    role: session.role,
    email: session.email,
  };
  const accessToken = signAccessToken(payload);

  const jti = randomUUID();
  const refreshToken = signRefreshToken({ sub: session.userId, jti });
  await RefreshToken.create({
    userId: session.userId,
    jti,
    tokenHash: await bcrypt.hash(refreshToken, 10),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    userAgent: ctx.userAgent,
    ip: ctx.ip,
  });
  await setAuthCookies(accessToken, refreshToken);
}

/** Rotate refresh token → new access + refresh. Throws if refresh is invalid/revoked. */
export async function refreshSession(ctx: RequestContext = {}): Promise<SessionUser> {
  await connectDb();
  const token = await readRefreshToken();
  if (!token) throw new Error('No refresh token');

  const payload = verifyRefreshToken(token);
  const stored = await RefreshToken.findOne({ jti: payload.jti, revokedAt: null });
  if (!stored) throw new Error('Refresh token revoked');
  if (stored.expiresAt.getTime() < Date.now()) throw new Error('Refresh token expired');
  const match = await bcrypt.compare(token, stored.tokenHash);
  if (!match) throw new Error('Refresh token mismatch');

  const user = await User.findById(payload.sub);
  if (!user || user.status !== UserStatus.Active) throw new Error('User inactive');

  // Rotate: revoke old, issue new.
  stored.revokedAt = new Date();
  await stored.save();

  const session: SessionUser = {
    userId: String(user._id),
    role: user.role as Role,
    email: user.email,
  };
  await issueTokens(session, ctx);
  return session;
}

/** Log out — revoke the current refresh token and clear cookies. */
export async function logout(): Promise<void> {
  await connectDb();
  const token = await readRefreshToken();
  if (token) {
    try {
      const payload = verifyRefreshToken(token);
      await RefreshToken.updateOne(
        { jti: payload.jti, revokedAt: null },
        { $set: { revokedAt: new Date() } },
      );
    } catch {
      // ignore malformed token on logout
    }
  }
  await clearAuthCookies();
}

/** Start forgot-password: email a reset link. Always resolves (no user enumeration). */
export async function forgotPassword(email: string): Promise<void> {
  await connectDb();
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user || user.status === UserStatus.Disabled) return;

  const token = generateUrlToken();
  await issueOtp(String(user._id), OtpPurpose.ResetPassword, RESET_TTL_MIN, token);
  const link = `${env.appUrl}/reset-password?uid=${user._id}&code=${token}`;
  const mail = resetPasswordEmail(user.name, link);
  await sendMail({ to: user.email, ...mail });
}

/** Complete forgot-password: verify token, set new password, kill all sessions. */
export async function resetPassword(input: {
  userId: string;
  code: string;
  password: string;
}): Promise<void> {
  await connectDb();
  const ok = await verifyOtp(input.userId, OtpPurpose.ResetPassword, input.code);
  if (!ok) throw new Error('Invalid or expired reset link');

  const user = await User.findById(input.userId);
  if (!user) throw new Error('Invalid reset link');

  user.passwordHash = await hashPassword(input.password);
  user.mustSetPassword = false;
  await user.save();

  // Revoke every active refresh token for this user.
  await RefreshToken.updateMany(
    { userId: input.userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

/** Soft-delete: deactivate a user. Never hard-deletes; refuses protected users. */
export async function deactivateUser(actor: SessionUser, targetId: string): Promise<void> {
  await connectDb();
  assertCan(actor.role, Permission.UserManage);
  const target = await User.findById(targetId);
  if (!target) throw new Error('User not found');
  if (target.isProtected) throw new Error('This user is protected and cannot be deactivated');

  target.status = UserStatus.Disabled;
  await target.save();
  await RefreshToken.updateMany(
    { userId: targetId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}
