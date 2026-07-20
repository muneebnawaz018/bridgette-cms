import { handle, ok } from '@/lib/api/respond';
import { resetPassword, resetPasswordSchema } from '@/modules/auth';
import { assertBodySize } from '@/lib/api/bodyLimit';
import { enforce, clientIp, LIMITS } from '@/lib/security/rateLimit';

// Finish a password reset. The token itself already caps at 5 wrong codes; this stops
// someone burning through freshly issued tokens in bulk.
export const POST = handle(async (req) => {
  assertBodySize(req);
  await enforce(`otp:reset:${clientIp(req)}`, LIMITS.otpPerIp);

  const body = resetPasswordSchema.parse(await req.json());
  await resetPassword(body);
  return ok({ reset: true });
});
