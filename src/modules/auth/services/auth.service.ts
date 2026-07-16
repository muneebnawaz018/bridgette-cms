import 'server-only';
import { randomUUID } from 'node:crypto';
import type { PipelineStage } from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDb } from '@/lib/db/connection';
import { aggregatePaginate, type Paginated } from '@/lib/query/paginate';
import { env } from '@/lib/config/env';
import { sendMail } from '@/lib/email/mailer';
import { resolveOrigin } from '@/lib/geo/ipLocation';
import { otpEmail, resetPasswordEmail, changeEmailOtpEmail } from '@/lib/email/templates';
import { User, type UserDoc } from '../models/user.model';
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
import type { ListUsersInput, UpdateUserInput } from '../schemas';

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
  const accessToken = await signAccessToken(payload);

  const jti = randomUUID();
  const refreshToken = await signRefreshToken({
    sub: session.userId,
    jti,
    role: session.role,
    email: session.email,
  });
  const origin = await resolveOrigin(ctx.ip);
  await RefreshToken.create({
    userId: session.userId,
    jti,
    tokenHash: await bcrypt.hash(refreshToken, 10),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    userAgent: ctx.userAgent,
    ip: origin.ip ?? undefined,
    location: origin.location ?? undefined,
  });
  await setAuthCookies(accessToken, refreshToken);
}

/** Rotate refresh token → new access + refresh. Throws if refresh is invalid/revoked. */
export async function refreshSession(ctx: RequestContext = {}): Promise<SessionUser> {
  await connectDb();
  const token = await readRefreshToken();
  if (!token) throw new Error('No refresh token');

  const payload = await verifyRefreshToken(token);
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
      const payload = await verifyRefreshToken(token);
      await RefreshToken.updateOne(
        { jti: payload.jti, revokedAt: null },
        { $set: { revokedAt: new Date(), revokedReason: 'logout' } },
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
    { $set: { revokedAt: new Date(), revokedReason: 'password' } },
  );
}

/** Change your own password. Verifies the current password before setting the new one. */
export async function changePassword(
  actor: SessionUser,
  input: { currentPassword: string; newPassword: string },
): Promise<void> {
  await connectDb();
  const user = await User.findById(actor.userId);
  if (!user || !user.passwordHash) throw new Error('Account not found');

  const ok = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!ok) throw new Error('Current password is incorrect');
  if (input.currentPassword === input.newPassword) {
    throw new Error('New password must be different from the current one');
  }

  user.passwordHash = await hashPassword(input.newPassword);
  await user.save();
}

/** Update your OWN profile — name/phone only. Never touches role, status, or email. */
export async function updateOwnProfile(
  actor: SessionUser,
  input: { name?: string; phone?: string },
): Promise<{ name: string; phone: string | null }> {
  await connectDb();
  const user = await User.findById(actor.userId);
  if (!user) throw new Error('Account not found');
  if (input.name !== undefined) user.name = input.name;
  if (input.phone !== undefined) user.phone = input.phone;
  await user.save();
  return { name: user.name, phone: user.phone ?? null };
}

/**
 * Step 1 of an email change: verify the current password, make sure the new address is
 * free, stash it as `pendingEmail`, and email a verification code to the NEW address.
 */
export async function requestEmailChange(
  actor: SessionUser,
  input: { newEmail: string; currentPassword: string },
): Promise<void> {
  await connectDb();
  const user = await User.findById(actor.userId);
  if (!user || !user.passwordHash) throw new Error('Account not found');

  const ok = await verifyPassword(input.currentPassword, user.passwordHash);
  if (!ok) throw new Error('Current password is incorrect');

  const newEmail = input.newEmail.toLowerCase().trim();
  if (newEmail === user.email) throw new Error('That is already your email');

  const taken = await User.findOne({ email: newEmail, _id: { $ne: user._id } });
  if (taken) throw new Error('That email is already in use');

  user.pendingEmail = newEmail;
  await user.save();

  const code = await issueOtp(String(user._id), OtpPurpose.ChangeEmail, OTP_TTL_MIN);
  await sendMail({ to: newEmail, ...changeEmailOtpEmail(user.name, code) });
}

/** Step 2: verify the code and switch the account over to the pending email. */
export async function confirmEmailChange(
  actor: SessionUser,
  input: { code: string },
): Promise<{ email: string }> {
  await connectDb();
  const user = await User.findById(actor.userId);
  if (!user || !user.pendingEmail) throw new Error('No pending email change');

  const ok = await verifyOtp(String(user._id), OtpPurpose.ChangeEmail, input.code);
  if (!ok) throw new Error('Invalid or expired code');

  // Re-check the address is still free (someone may have claimed it in the meantime).
  const taken = await User.findOne({ email: user.pendingEmail, _id: { $ne: user._id } });
  if (taken) throw new Error('That email is already in use');

  user.email = user.pendingEmail;
  user.pendingEmail = null;
  user.emailVerified = true;
  await user.save();

  // The old tokens still carry the previous email in their claims. Rotate them so this
  // device's session reflects the new address right away (no forced re-login).
  const oldToken = await readRefreshToken();
  if (oldToken) {
    try {
      const p = await verifyRefreshToken(oldToken);
      await RefreshToken.updateOne(
        { jti: p.jti, revokedAt: null },
        { $set: { revokedAt: new Date(), revokedReason: 'logout' } },
      );
    } catch {
      /* ignore */
    }
  }
  await issueTokens({ userId: String(user._id), role: user.role as Role, email: user.email }, {});

  return { email: user.email };
}

/** Soft-delete: deactivate a user. Never hard-deletes; refuses protected users. */
export async function deactivateUser(actor: SessionUser, targetId: string): Promise<void> {
  await connectDb();
  assertCan(actor.role, Permission.UserManage);
  if (targetId === actor.userId) throw new Error('You cannot deactivate your own account');
  const target = await User.findById(targetId);
  if (!target) throw new Error('User not found');
  if (target.isProtected) throw new Error('This user is protected and cannot be deactivated');

  target.status = UserStatus.Disabled;
  await target.save();
  await RefreshToken.updateMany(
    { userId: targetId, revokedAt: null },
    { $set: { revokedAt: new Date(), revokedReason: 'admin' } },
  );
}

/** Paginated, searchable user list (passwordHash never returned). */
export async function listUsers(
  actor: SessionUser,
  query: ListUsersInput,
): Promise<Paginated<UserDoc>> {
  assertCan(actor.role, Permission.UserView);
  await connectDb();

  const match: Record<string, unknown> = {};
  if (query.role) match.role = query.role;
  if (query.search) {
    const rx = new RegExp(query.search.trim(), 'i');
    match.$or = [{ name: rx }, { email: rx }];
  }

  const stages: PipelineStage[] = [{ $match: match }, { $project: { passwordHash: 0 } }];
  return aggregatePaginate<UserDoc>(User, stages, { page: query.page, limit: query.limit });
}

/** Fetch one user (no passwordHash). */
export async function getUser(actor: SessionUser, id: string) {
  assertCan(actor.role, Permission.UserView);
  await connectDb();
  const user = await User.findById(id).select('-passwordHash').lean<UserDoc>();
  if (!user) throw new Error('User not found');
  return user;
}

/** Update a user's profile/role/status with RBAC + protection guards. */
export async function updateUser(actor: SessionUser, id: string, input: UpdateUserInput) {
  assertCan(actor.role, Permission.UserManage);
  await connectDb();
  const user = await User.findById(id);
  if (!user) throw new Error('User not found');

  // Only the Super Admin may create/assign admin-level roles.
  if (input.role && ADMIN_ROLES.includes(input.role)) {
    assertCan(actor.role, Permission.UserCreateAdmin);
  }
  // Protected (seeded Super Admin) cannot have role/status changed or be disabled.
  if (user.isProtected && (input.role || input.status)) {
    throw new Error('This user is protected and cannot be modified');
  }

  if (input.name !== undefined) user.name = input.name;
  if (input.phone !== undefined) user.phone = input.phone;
  if (input.role !== undefined) user.role = input.role;
  if (input.status !== undefined) {
    user.status = input.status;
    if (input.status === UserStatus.Disabled) {
      await RefreshToken.updateMany(
        { userId: id, revokedAt: null },
        { $set: { revokedAt: new Date(), revokedReason: 'admin' } },
      );
    }
  }
  await user.save();
  const obj = user.toObject();
  delete (obj as { passwordHash?: string }).passwordHash;
  return obj;
}
