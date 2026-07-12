import { handle, ok } from '@/lib/api/respond';
import { forgotPassword, forgotPasswordSchema } from '@/modules/auth';

export const POST = handle(async (req) => {
  const { email } = forgotPasswordSchema.parse(await req.json());
  await forgotPassword(email);
  // Always ok — no user enumeration.
  return ok({ sent: true });
});
