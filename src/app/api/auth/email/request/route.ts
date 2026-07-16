import { handle, ok } from '@/lib/api/respond';
import { requireSession, requestEmailChange, requestEmailChangeSchema } from '@/modules/auth';

// POST /api/auth/email/request — start an email change (verifies password, mails a code).
export const POST = handle(async (req) => {
  const actor = await requireSession();
  const body = requestEmailChangeSchema.parse(await req.json());
  await requestEmailChange(actor, body);
  return ok({ sent: true });
});
