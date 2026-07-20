import { handle, ok } from '@/lib/api/respond';
import { login, loginSchema, failedAttemptsFor } from '@/modules/auth';
import { assertBodySize } from '@/lib/api/bodyLimit';
import { enforce, clientIp, LIMITS } from '@/lib/security/rateLimit';
import { assertCaptchaIfSuspicious } from '@/lib/security/turnstile';

/**
 * Sign in.
 *
 * The most attacked route in the app and the most expensive per call: bcrypt at cost 12
 * costs the server ~300ms whether the password is right or wrong, so an unthrottled version
 * lets one client burn a CPU core with a script. Hence three layers before any work happens:
 * per-IP and per-account limits, then a challenge once an account looks like it is being
 * guessed at.
 */
export const POST = handle(async (req) => {
  assertBodySize(req);
  const ip = clientIp(req);

  // Per IP first: it is free and catches the common case of one host hammering the route.
  await enforce(`login:ip:${ip}`, LIMITS.loginPerIp);

  const body = loginSchema.parse(await req.json());
  const email = body.email.toLowerCase().trim();

  // Per account as well, so guessing one password from a thousand addresses still trips.
  await enforce(`login:email:${email}`, LIMITS.loginPerEmail);

  // Unknown addresses report zero failures, the same as a clean account, so this cannot be
  // used to probe which addresses exist.
  await assertCaptchaIfSuspicious(await failedAttemptsFor(email), body.turnstileToken, ip);

  const ctx = {
    userAgent: req.headers.get('user-agent') ?? undefined,
    ip: req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined,
  };
  const session = await login(body, ctx);
  return ok({ userId: session.userId, role: session.role, email: session.email });
});
