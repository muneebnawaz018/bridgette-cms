import { handle, ok } from '@/lib/api/respond';
import { requireSession, revokeSession } from '@/modules/auth';

// DELETE /api/auth/sessions/:jti — revoke one specific session (device) of the current user.
export const DELETE = handle(async (_req, ctx: { params: Promise<{ jti: string }> }) => {
  const actor = await requireSession();
  const { jti } = await ctx.params;
  await revokeSession(actor, jti);
  return ok({ revoked: jti });
});
