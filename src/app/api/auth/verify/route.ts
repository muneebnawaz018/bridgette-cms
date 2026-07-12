import { handle, ok } from '@/lib/api/respond';
import { verifyAndSetPassword, setPasswordSchema } from '@/modules/auth';

// Onboarding: verify email OTP + set initial password.
export const POST = handle(async (req) => {
  const body = setPasswordSchema.parse(await req.json());
  await verifyAndSetPassword(body);
  return ok({ verified: true });
});
