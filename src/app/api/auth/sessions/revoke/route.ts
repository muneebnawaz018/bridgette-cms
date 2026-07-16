import { handle, ok } from '@/lib/api/respond';
import {
  requireSession,
  revokeOtherSessions,
  revokeAllSessions,
  revokeSessionsSchema,
} from '@/modules/auth';

/**
 * POST /api/auth/sessions/revoke — sign out other devices.
 * - scope "others": revoke every session except this one (stay signed in here).
 * - scope "all": revoke everything including this device (forces re-login).
 */
export const POST = handle(async (req) => {
  const actor = await requireSession();
  const { scope } = revokeSessionsSchema.parse(await req.json());

  if (scope === 'all') {
    await revokeAllSessions(actor);
    return ok({ scope, signedOut: true });
  }

  const revoked = await revokeOtherSessions(actor);
  return ok({ scope, revoked });
});
