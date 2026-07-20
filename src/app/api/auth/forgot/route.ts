import { handle, ok } from '@/lib/api/respond';
import { forgotPassword, forgotPasswordSchema } from '@/modules/auth';
import { assertBodySize } from '@/lib/api/bodyLimit';
import { enforce, clientIp, LIMITS } from '@/lib/security/rateLimit';

/**
 * Start a password reset.
 *
 * Every accepted call sends a real email, so an unthrottled version lets someone burn the
 * SMTP quota, bury a real user's inbox, and get the sending domain marked as a spam source.
 * The per-address limit is the one that protects the recipient; the per-IP limit stops a
 * script walking a list of addresses.
 */
export const POST = handle(async (req) => {
  assertBodySize(req);
  const ip = clientIp(req);
  await enforce(`forgot:ip:${ip}`, LIMITS.forgotPerIp);

  const { email } = forgotPasswordSchema.parse(await req.json());
  await enforce(`forgot:email:${email.toLowerCase().trim()}`, LIMITS.forgotPerEmail);

  await forgotPassword(email);
  // Always ok — no user enumeration.
  return ok({ sent: true });
});
