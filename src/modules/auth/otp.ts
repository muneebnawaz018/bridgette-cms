import 'server-only';
import { randomInt, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { OtpToken } from './models/otp-token.model';
import type { OtpPurpose } from './enums';

const MAX_ATTEMPTS = 5;

/** 6-digit numeric code for email OTP (onboarding / 2FA). */
export function generateNumericOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** URL-safe random token for reset links. */
export function generateUrlToken(): string {
  return randomBytes(32).toString('base64url');
}

/** Create + store a one-time token (hashed). Returns the plaintext to send by email. */
export async function issueOtp(
  userId: string,
  purpose: OtpPurpose,
  ttlMinutes: number,
  code = generateNumericOtp(),
): Promise<string> {
  const codeHash = await bcrypt.hash(code, 10);
  // Invalidate prior unconsumed tokens of the same purpose.
  await OtpToken.updateMany(
    { userId, purpose, consumedAt: null },
    { $set: { consumedAt: new Date() } },
  );
  await OtpToken.create({
    userId,
    purpose,
    codeHash,
    expiresAt: new Date(Date.now() + ttlMinutes * 60_000),
  });
  return code;
}

/** Verify + consume a one-time token. Returns true on success. */
export async function verifyOtp(
  userId: string,
  purpose: OtpPurpose,
  code: string,
): Promise<boolean> {
  const token = await OtpToken.findOne({ userId, purpose, consumedAt: null }).sort({
    createdAt: -1,
  });
  if (!token) return false;
  if (token.expiresAt.getTime() < Date.now()) return false;
  if ((token.attempts ?? 0) >= MAX_ATTEMPTS) return false;

  const ok = await bcrypt.compare(code, token.codeHash);
  if (!ok) {
    await OtpToken.updateOne({ _id: token._id }, { $inc: { attempts: 1 } });
    return false;
  }
  await OtpToken.updateOne({ _id: token._id }, { $set: { consumedAt: new Date() } });
  return true;
}
