import { handle, ok } from '@/lib/api/respond';
import { revokeOtherSessions, revokeAllSessions, revokeSessionsSchema } from '@/modules/auth';
import { requireSessionWrite } from '@/lib/security/guard';
import { assertBodySize } from '@/lib/api/bodyLimit';

/**
 * POST /api/auth/sessions/revoke — sign out other devices.
 * - scope "others": revoke every session except this one (stay signed in here).
 * - scope "all": revoke everything including this device (forces re-login).
 */
export const POST = handle(async (req) => {
  assertBodySize(req);
  const actor = await requireSessionWrite();
  const { scope } = revokeSessionsSchema.parse(await req.json());

  if (scope === 'all') {
    await revokeAllSessions(actor);
    return ok({ scope, signedOut: true });
  }

  const revoked = await revokeOtherSessions(actor);
  return ok({ scope, revoked });
});
