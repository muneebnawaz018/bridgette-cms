import { handle, ok } from '@/lib/api/respond';
import { changePassword, changePasswordSchema } from '@/modules/auth';
import { requireSessionWrite } from '@/lib/security/guard';
import { assertBodySize } from '@/lib/api/bodyLimit';

// POST /api/auth/password — change your own password (verifies the current one).
export const POST = handle(async (req) => {
  assertBodySize(req);
  const actor = await requireSessionWrite();
  const body = changePasswordSchema.parse(await req.json());
  await changePassword(actor, body);
  return ok({ changed: true });
});
