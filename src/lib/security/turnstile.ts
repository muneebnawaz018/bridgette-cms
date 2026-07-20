import 'server-only';
import { logger } from '@/lib/logger/logger';

/**
 * Cloudflare Turnstile, used as an escalation rather than a toll booth.
 *
 * A challenge on every sign-in punishes the people who type their password correctly. This
 * only demands one once an account has already failed repeatedly, so normal use never sees
 * it and an automated guesser hits it immediately.
 *
 * Entirely optional. With no `TURNSTILE_SECRET_KEY` configured the feature reports itself as
 * disabled and nothing changes, so the app runs unmodified in development.
 */

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Failures on one account before a challenge is required. */
export const CAPTCHA_AFTER_FAILURES = 5;

/** Thrown when the caller must solve a challenge first. `handle()` maps this to 403. */
export class CaptchaRequiredError extends Error {
  constructor(message = 'Please complete the verification challenge and try again.') {
    super(message);
    this.name = 'CaptchaRequiredError';
  }
}

export function turnstileEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

/**
 * Check a token with Cloudflare. Returns false on any failure.
 *
 * Fails closed, unlike the rate limiter: if the challenge cannot be verified we do not know
 * whether a human solved it, and we only reach this code because the account already looks
 * like it is under attack.
 */
export async function verifyTurnstile(token: string | undefined, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true; // disabled
  if (!token) return false;

  try {
    const body = new URLSearchParams({ secret, response: token });
    if (ip && ip !== 'unknown') body.set('remoteip', ip);

    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(5000),
    });
    const json = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };

    if (!json.success) {
      logger.warn('turnstile verification rejected', { codes: json['error-codes'] });
      return false;
    }
    return true;
  } catch (err) {
    logger.warn('turnstile verification failed to complete', {
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * Demand a solved challenge when an account has failed too often.
 *
 * Throws `CaptchaRequiredError`, which the client turns into a visible widget. A no-op when
 * Turnstile is not configured or the account is below the threshold.
 */
export async function assertCaptchaIfSuspicious(
  failures: number,
  token: string | undefined,
  ip?: string,
): Promise<void> {
  if (!turnstileEnabled()) return;
  if (failures < CAPTCHA_AFTER_FAILURES) return;
  if (!(await verifyTurnstile(token, ip))) throw new CaptchaRequiredError();
}
