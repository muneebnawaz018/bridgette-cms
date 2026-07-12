import { handle, ok } from '@/lib/api/respond';
import { requireSession, ROLE_PERMISSIONS } from '@/modules/auth';

// Current session + the caller's permission list (for FE gating).
export const GET = handle(async () => {
  const s = await requireSession();
  return ok({
    userId: s.userId,
    role: s.role,
    email: s.email,
    permissions: ROLE_PERMISSIONS[s.role],
  });
});
