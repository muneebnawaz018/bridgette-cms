import { handle, ok } from '@/lib/api/respond';
import { resetPassword, resetPasswordSchema } from '@/modules/auth';

export const POST = handle(async (req) => {
  const body = resetPasswordSchema.parse(await req.json());
  await resetPassword(body);
  return ok({ reset: true });
});
