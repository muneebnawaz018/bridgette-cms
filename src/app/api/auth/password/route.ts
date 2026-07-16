import { handle, ok } from '@/lib/api/respond';
import { requireSession, changePassword, changePasswordSchema } from '@/modules/auth';

// POST /api/auth/password — change your own password (verifies the current one).
export const POST = handle(async (req) => {
  const actor = await requireSession();
  const body = changePasswordSchema.parse(await req.json());
  await changePassword(actor, body);
  return ok({ changed: true });
});
