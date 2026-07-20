import { handle, ok } from '@/lib/api/respond';
import { requestEmailChange, requestEmailChangeSchema } from '@/modules/auth';
import { requireSessionWrite } from '@/lib/security/guard';
import { assertBodySize } from '@/lib/api/bodyLimit';

// POST /api/auth/email/request — start an email change (verifies password, mails a code).
export const POST = handle(async (req) => {
  assertBodySize(req);
  const actor = await requireSessionWrite();
  const body = requestEmailChangeSchema.parse(await req.json());
  await requestEmailChange(actor, body);
  return ok({ sent: true });
});
