import { handle, ok } from '@/lib/api/respond';
import { verifyAndSetPassword, setPasswordSchema } from '@/modules/auth';
import { assertBodySize } from '@/lib/api/bodyLimit';
import { enforce, clientIp, LIMITS } from '@/lib/security/rateLimit';

// Onboarding: verify email OTP + set initial password.
export const POST = handle(async (req) => {
  assertBodySize(req);
  await enforce(`otp:verify:${clientIp(req)}`, LIMITS.otpPerIp);

  const body = setPasswordSchema.parse(await req.json());
  await verifyAndSetPassword(body);
  return ok({ verified: true });
});
