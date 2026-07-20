import { handle, ok } from '@/lib/api/respond';
import { confirmEmailChange, confirmEmailChangeSchema } from '@/modules/auth';
import { requireSessionWrite } from '@/lib/security/guard';
import { assertBodySize } from '@/lib/api/bodyLimit';

// POST /api/auth/email/confirm — verify the code and switch to the new email.
export const POST = handle(async (req) => {
  assertBodySize(req);
  const actor = await requireSessionWrite();
  const body = confirmEmailChangeSchema.parse(await req.json());
  const result = await confirmEmailChange(actor, body);
  return ok(result);
});
