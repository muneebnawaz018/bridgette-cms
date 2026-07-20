import { handle, ok } from '@/lib/api/respond';
import { login, loginSchema } from '@/modules/auth';
import { assertBodySize } from '@/lib/api/bodyLimit';
import { enforce, clientIp, LIMITS } from '@/lib/security/rateLimit';

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

  const body = loginSchema.parse(await req.json());
  const email = body.email.toLowerCase().trim();

  // Per IP and per account: the first catches one host hammering the route, the second means
  // guessing one password across a thousand addresses still trips. They are independent
  // counters, so both hits go out at once — sequentially this was two round trips before any
  // real work started. Either rejecting still rejects the request; both counters increment
  // either way, which is what a limiter wants.
  await Promise.all([
    enforce(`login:ip:${ip}`, LIMITS.loginPerIp),
    enforce(`login:email:${email}`, LIMITS.loginPerEmail),
  ]);

  const ctx = {
    userAgent: req.headers.get('user-agent') ?? undefined,
    ip: req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined,
    clientIp: ip,
  };
  // The captcha gate now runs inside login(), which already has the user document it needs.
  const session = await login(body, ctx);
  return ok({ userId: session.userId, role: session.role, email: session.email });
});
