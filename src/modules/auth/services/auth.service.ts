import 'server-only';
import { randomUUID } from 'node:crypto';
import type { PipelineStage } from 'mongoose';
import bcrypt from 'bcryptjs';
import { connectDb } from '@/lib/db/connection';
import { escapeRegex } from '@/lib/query/escapeRegex';
import { aggregatePaginate, type Paginated } from '@/lib/query/paginate';
import { env } from '@/lib/config/env';
import { sendMail } from '@/lib/email/mailer';
import { normalizeIp } from '@/lib/geo/ipLocation';
import { otpEmail, resetPasswordEmail, changeEmailOtpEmail } from '@/lib/email/templates';
import { assertDeliverableEmail } from '@/lib/email/deliverability';
import { assertCaptchaIfSuspicious } from '@/lib/security/turnstile';
import { logger } from '@/lib/logger/logger';
import { User, type UserDoc } from '../models/user.model';
import { RefreshToken } from '../models/refresh-token.model';
import { UserStatus, OtpPurpose } from '../enums';
import { Role, Permission, assertCan, ACTIVE_ROLES } from '../rbac';
import { hashPassword, verifyPassword, burnPasswordTime } from '../password';
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
  /**
   * The caller's IP as the rate limiter resolves it (cf-connecting-ip first). Kept separate
   * from `ip`, which is what gets stored on the session record: this one is the value
   * Turnstile verifies against and must not fall back to a placeholder.
   */
  clientIp?: string;
}

/** Admin/Super Admin creates a user → emails an OTP for verify + set-password. */
export async function createUser(
  actor: SessionUser,
  input: {
    name: string;
    email: string;
    role: Role;
    phone: string;
    jobTitle?: string;
    notes?: string;
  },
): Promise<{ userId: string; emailSent: boolean; otpTtlMinutes: number }> {
  await connectDb();
  // The Super Admin is a single seeded fixture — it can never be handed out.
  if (input.role === Role.SuperAdmin) throw new Error('There can only be one Super Admin');
  // Sales / Read only are defined but not built yet — reject them from the API too.
  if (!ACTIVE_ROLES.includes(input.role)) throw new Error('That role is not available yet');
  // Creating an Admin requires the elevated permission.
  assertCan(
    actor.role,
    ADMIN_ROLES.includes(input.role) ? Permission.UserCreateAdmin : Permission.UserCreate,
  );

  const email = input.email.toLowerCase().trim();
  const existing = await User.findOne({ email });
  if (existing) throw new Error('A user with this email already exists');
  // Well-formed is not the same as reachable — reject typo'd/dead domains before we create
  // an account whose invite can never arrive.
  await assertDeliverableEmail(email);

  const user = await User.create({
    name: input.name,
    email,
    phone: input.phone,
    jobTitle: input.jobTitle,
    notes: input.notes,
    role: input.role,
    status: UserStatus.Invited,
    mustSetPassword: true,
    emailVerified: false,
    createdBy: actor.userId,
  });

  const code = await issueOtp(String(user._id), OtpPurpose.VerifyEmail, OTP_TTL_MIN);
  const mail = otpEmail(user.name, code, email);

  // The account already exists by this point. A mail failure must not surface as "create
  // failed" — that would leave a real user behind an error message. Report it instead, so
  // the caller can tell the admin the invite needs resending.
  let emailSent = true;
  try {
    await sendMail({ to: email, ...mail });
  } catch (err) {
    emailSent = false;
    logger.error('user created but the invite email failed to send', {
      userId: String(user._id),
      email,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // The lifetime travels with the response so the toast can state it exactly. Hardcoding
  // "15 minutes" in the dialog would quietly start lying the day OTP_TTL_MIN changes.
  return { userId: String(user._id), emailSent, otpTtlMinutes: OTP_TTL_MIN };
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

/**
 * Failed-attempt policy, counted per account so an attacker spreading guesses across many
 * IPs still trips it. `SOFT` starts a small delay, `HARD` locks the account outright.
 */
const SOFT_FAIL_THRESHOLD = 5;
const HARD_FAIL_THRESHOLD = 10;
const LOCK_MINUTES = 15;
/** Capped deliberately: a long sleep holds a connection open, which is its own DoS lever. */
const MAX_SOFT_DELAY_MS = 1000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** How long to stall this attempt, given how many have already failed. */
function softDelayMs(failures: number): number {
  if (failures < SOFT_FAIL_THRESHOLD) return 0;
  const step = 2 ** (failures - SOFT_FAIL_THRESHOLD) * 250;
  return Math.min(MAX_SOFT_DELAY_MS, step);
}

/** Email + password login → issues tokens and sets httpOnly cookies. */
export async function login(
  input: { email: string; password: string; turnstileToken?: string },
  ctx: RequestContext = {},
): Promise<SessionUser> {
  await connectDb();
  const user = await User.findOne({ email: input.email.toLowerCase().trim() });

  // The captcha gate reads this user's failure count, so it lives here rather than in the
  // route. It used to sit in front of login() and fetch the same document through
  // failedAttemptsFor(), which meant every sign-in paid two round trips to Atlas for one
  // record — ~190ms of pure waste from Pakistan to ap-south-1. Still evaluated before
  // bcrypt, which is the property that matters: an unsolved challenge must not buy 300ms
  // of CPU. An unknown address reports 0 failures, exactly as a clean account does, so this
  // cannot be used to probe which addresses exist.
  await assertCaptchaIfSuspicious(
    user?.failedLoginAttempts ?? 0,
    input.turnstileToken,
    ctx.clientIp,
  );

  // No account, or no password set yet (an invited user who never onboarded): spend the same
  // time a real check would before answering. Returning early here is what let an attacker
  // time the response and learn which addresses are registered, since only the real path paid
  // for bcrypt. Neither case can be told apart from a wrong password, by design.
  //
  // Status is deliberately NOT checked here — see below.
  if (!user || !user.passwordHash) {
    await burnPasswordTime(input.password);
    throw new Error('Invalid credentials');
  }

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const minutes = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000));
    throw new Error(
      `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
    );
  }

  const ok = await verifyPassword(input.password, user.passwordHash);

  if (!ok) {
    const failures = (user.failedLoginAttempts ?? 0) + 1;
    user.failedLoginAttempts = failures;
    if (failures >= HARD_FAIL_THRESHOLD) {
      user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
      user.failedLoginAttempts = 0; // the lock now carries the penalty
    }
    await user.save();

    const delay = softDelayMs(failures);
    if (delay > 0) await sleep(delay);

    if (user.lockedUntil) {
      throw new Error(`Too many failed attempts. Try again in ${LOCK_MINUTES} minutes.`);
    }
    throw new Error('Invalid credentials');
  }

  // The password is correct, so the caller demonstrably owns this account — telling them it
  // has been deactivated reveals nothing they could not already establish, and no enumeration
  // channel opens because anyone without the password still gets a flat "Invalid credentials"
  // above. Checking status before bcrypt is what produced the old behavior: a deactivated
  // user who had just reset their password was told their credentials were wrong, which sent
  // them back to reset it again instead of to an administrator.
  if (user.status !== UserStatus.Active) {
    logger.info('sign-in blocked: account is not active', {
      userId: String(user._id),
      email: user.email,
      status: user.status,
    });
    throw new Error('This account has been deactivated. Contact an administrator.');
  }

  const session: SessionUser = {
    userId: String(user._id),
    role: user.role as Role,
    email: user.email,
  };
  // Two independent writes — the refresh-token insert and the bookkeeping on the user — so
  // they go out together rather than one after the other. Sequentially that was two full
  // round trips; concurrently it is one. updateOne rather than user.save() because the
  // document is not otherwise dirty and a targeted $set is what this actually is.
  await Promise.all([
    issueTokens(session, ctx),
    User.updateOne(
      { _id: user._id },
      { $set: { lastLoginAt: new Date(), failedLoginAttempts: 0, lockedUntil: null } },
    ),
  ]);

  return session;
}

/**
 * How many failures this account has on record, for deciding whether to demand a captcha.
 * Unknown addresses report 0, which is the same answer a clean account gives, so this can
 * never be used to probe for registered users.
 */
export async function failedAttemptsFor(email: string): Promise<number> {
  await connectDb();
  const user = await User.findOne({ email: email.toLowerCase().trim() })
    .select('failedLoginAttempts')
    .lean<{ failedLoginAttempts?: number }>();
  return user?.failedLoginAttempts ?? 0;
}

/** Sign tokens, persist the refresh token (hashed), set cookies. */
async function issueTokens(session: SessionUser, ctx: RequestContext): Promise<void> {
  // One id for the pair. Both tokens carry it, so a revoked device session is recognisable
  // from the access token alone — no waiting for it to expire first.
  const jti = randomUUID();

  const payload: AccessTokenPayload = {
    sub: session.userId,
    role: session.role,
    email: session.email,
    jti,
  };
  const accessToken = await signAccessToken(payload);

  const refreshToken = await signRefreshToken({
    sub: session.userId,
    jti,
    role: session.role,
    email: session.email,
  });
  // Store the raw IP only — no blocking geo lookup on the hot login path. Location (and
  // the loopback→public upgrade) is resolved lazily by listSessions' backfill.
  await RefreshToken.create({
    userId: session.userId,
    jti,
    tokenHash: await bcrypt.hash(refreshToken, 10),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    userAgent: ctx.userAgent,
    ip: normalizeIp(ctx.ip) ?? undefined,
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

  // Rotate: revoke old, issue new. Tagged 'rotate' so routine rotation never shows up in
  // the "recently revoked" audit list.
  stored.revokedAt = new Date();
  stored.revokedReason = 'rotate';
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

  // Both misses answer the caller identically — a 200 and the same "if an account exists"
  // panel — because saying which one happened is exactly the enumeration this flow avoids.
  // The silence is for the caller, though, not for us: with nothing recorded, a legitimate
  // "I never got the email" report is indistinguishable from a broken mailer, and answering
  // it means querying the database by hand. One line here turns that into a log lookup.
  //
  // A disabled account is deliberately not sent a link. login() rejects on status before it
  // ever checks a password, so the reset would succeed and sign-in would still fail — a
  // longer, more confusing dead end than no email at all. Reactivating is an admin action.
  if (!user) {
    logger.info('password reset requested for an unknown address', {
      email: email.toLowerCase().trim(),
    });
    return;
  }

  // Disabled accounts DO get the link. resetPassword does not check status either, so the
  // reset itself succeeds; login() still refuses on status, so this grants no access. The
  // point is that someone who has been deactivated can arrive with a working password the
  // moment an admin re-enables them, rather than needing a second round trip through support.
  // Logged because "deactivated user is resetting their password" is worth being able to see.
  if (user.status === UserStatus.Disabled) {
    logger.info('password reset requested by a disabled account', {
      userId: String(user._id),
      email: user.email,
    });
  }

  const token = generateUrlToken();
  await issueOtp(String(user._id), OtpPurpose.ResetPassword, RESET_TTL_MIN, token);
  const link = `${env.appUrl}/reset-password?uid=${user._id}&code=${token}`;
  const mail = resetPasswordEmail(user.name, link);

  // A send failure must not escape this function. The unknown-address branch above returns
  // silently, so if a real address let the mailer throw, the route would answer 200 for
  // "no such account" and 500 for a genuine one — the exact existence oracle this flow avoids.
  // Report it like createUser/resendInvite do and still resolve.
  try {
    await sendMail({ to: user.email, ...mail });
  } catch (err) {
    logger.error('password reset email failed to send', {
      userId: String(user._id),
      email: user.email,
      error: err instanceof Error ? err.message : String(err),
    });
  }
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
  input: { name?: string; phone?: string; avatarUrl?: string | null },
): Promise<{ name: string; phone: string | null; avatarUrl: string | null }> {
  await connectDb();
  const user = await User.findById(actor.userId);
  if (!user) throw new Error('Account not found');
  if (input.name !== undefined) user.name = input.name;
  if (input.phone !== undefined) user.phone = input.phone;
  if (input.avatarUrl !== undefined) user.avatarUrl = input.avatarUrl;
  await user.save();
  return { name: user.name, phone: user.phone ?? null, avatarUrl: user.avatarUrl ?? null };
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

  // Same MX check createUser runs. It matters more here: pendingEmail is committed below and
  // the code is sent to an address the account holder cannot read yet, so a typo like
  // "@gmial.com" leaves a pending change that can never be confirmed. Checked before the save
  // so a bad address changes nothing.
  await assertDeliverableEmail(newEmail);

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

/**
 * Send a fresh invite code to someone who never finished onboarding.
 *
 * The original code lives for OTP_TTL_MIN and there was no way to issue another, so an
 * invite that expired, bounced, or landed in spam stranded the account permanently — the
 * email address is taken, so the admin cannot even re-create it. `issueOtp` consumes any
 * prior unredeemed code for the same purpose, so the newest email is always the only one
 * that works.
 *
 * Restricted to Invited accounts on purpose. An Active user has a password and belongs in
 * the forgot-password flow; a Disabled one must be reactivated first, or this would be a
 * way to hand working credentials back to a revoked account.
 */
export async function resendInvite(
  actor: SessionUser,
  targetId: string,
): Promise<{ emailSent: boolean; otpTtlMinutes: number }> {
  await connectDb();
  assertCan(actor.role, Permission.UserManage);
  const user = await User.findById(targetId);
  if (!user) throw new Error('User not found');
  if (user.status !== UserStatus.Invited) {
    throw new Error('Only a pending invitation can be resent');
  }

  const code = await issueOtp(String(user._id), OtpPurpose.VerifyEmail, OTP_TTL_MIN);
  const mail = otpEmail(user.name, code, user.email);

  // Same reasoning as createUser: the code is already issued and the old one already dead,
  // so a mail failure is reported rather than thrown. Throwing would tell the admin nothing
  // was sent while leaving the account holding a code it never received.
  let emailSent = true;
  try {
    await sendMail({ to: user.email, ...mail });
  } catch (err) {
    emailSent = false;
    logger.error('invite resend failed to send', {
      userId: String(user._id),
      email: user.email,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return { emailSent, otpTtlMinutes: OTP_TTL_MIN };
}

/**
 * Undo a deactivation.
 *
 * Where the account lands depends on how far it got before being disabled. Someone who had
 * verified their email and set a password returns to Active and can sign straight back in.
 * Someone disabled while still Invited has no password hash, and `login` rejects those — so
 * flipping them to Active would produce an account that looks enabled in the UI and can
 * never actually be used. They go back to Invited instead, and the admin resends the invite.
 */
export async function reactivateUser(
  actor: SessionUser,
  targetId: string,
): Promise<{ status: UserStatus }> {
  await connectDb();
  assertCan(actor.role, Permission.UserManage);
  const target = await User.findById(targetId).select('+passwordHash');
  if (!target) throw new Error('User not found');
  if (target.status !== UserStatus.Disabled) throw new Error('This user is not disabled');

  target.status =
    target.emailVerified && target.passwordHash ? UserStatus.Active : UserStatus.Invited;
  await target.save();
  return { status: target.status as UserStatus };
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
    const rx = new RegExp(escapeRegex(query.search.trim()), 'i');
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
  // passwordHash is select:false but the status guard below needs it. It is stripped from
  // the returned object at the end of this function, as it already was.
  const user = await User.findById(id).select('+passwordHash');
  if (!user) throw new Error('User not found');

  // There is exactly one Super Admin and it stays that way — the role is never assignable.
  if (input.role === Role.SuperAdmin) throw new Error('There can only be one Super Admin');
  // Sales / Read only are defined but not built yet — reject them from the API too.
  if (input.role !== undefined && !ACTIVE_ROLES.includes(input.role)) {
    throw new Error('That role is not available yet');
  }
  // Only the Super Admin may assign admin-level roles.
  if (input.role && ADMIN_ROLES.includes(input.role)) {
    assertCan(actor.role, Permission.UserCreateAdmin);
  }
  // The protected (seeded) Super Admin is locked: its role and status can never change, and
  // nobody else may touch its profile. Only the account holder can change their own photo,
  // name and phone.
  if (user.isProtected) {
    if (input.role !== undefined || input.status !== undefined) {
      throw new Error('The Super Admin role and status cannot be changed');
    }
    if (String(user._id) !== actor.userId) {
      throw new Error('Only the Super Admin can edit their own profile');
    }
  }

  if (input.name !== undefined) user.name = input.name;
  if (input.phone !== undefined) user.phone = input.phone;
  if (input.jobTitle !== undefined) user.jobTitle = input.jobTitle;
  if (input.notes !== undefined) user.notes = input.notes;
  if (input.avatarUrl !== undefined) user.avatarUrl = input.avatarUrl;
  if (input.role !== undefined) user.role = input.role;
  if (input.status !== undefined) {
    // An account with no password hash cannot log in, so marking one Active produces a user
    // the UI shows as enabled and the sign-in form always rejects. Invited is the honest
    // state for them — reactivateUser applies the same rule.
    if (input.status === UserStatus.Active && !(user.emailVerified && user.passwordHash)) {
      throw new Error('This user has not set a password yet — resend their invitation instead');
    }
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
