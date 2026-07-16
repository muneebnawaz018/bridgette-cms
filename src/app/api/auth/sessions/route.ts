import { handle, ok } from '@/lib/api/respond';
import { requireSession, listSessions } from '@/modules/auth';

// GET /api/auth/sessions — the current user's active sign-ins across devices.
export const GET = handle(async () => {
  const actor = await requireSession();
  const sessions = await listSessions(actor);
  return ok({ sessions });
});
