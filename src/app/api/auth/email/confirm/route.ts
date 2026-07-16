import { handle, ok } from '@/lib/api/respond';
import { requireSession, confirmEmailChange, confirmEmailChangeSchema } from '@/modules/auth';

// POST /api/auth/email/confirm — verify the code and switch to the new email.
export const POST = handle(async (req) => {
  const actor = await requireSession();
  const body = confirmEmailChangeSchema.parse(await req.json());
  const result = await confirmEmailChange(actor, body);
  return ok(result);
});
