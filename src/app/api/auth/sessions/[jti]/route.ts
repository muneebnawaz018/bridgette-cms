import { handle, ok } from '@/lib/api/respond';
import { revokeSession } from '@/modules/auth';
import { requireSessionWrite } from '@/lib/security/guard';

// DELETE /api/auth/sessions/:jti — revoke one specific session (device) of the current user.
export const DELETE = handle(async (_req, ctx: { params: Promise<{ jti: string }> }) => {
  const actor = await requireSessionWrite();
  const { jti } = await ctx.params;
  await revokeSession(actor, jti);
  return ok({ revoked: jti });
});
