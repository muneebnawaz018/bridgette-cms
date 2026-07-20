import { handle, ok } from '@/lib/api/respond';
import { reactivateUser, Permission } from '@/modules/auth';
import { requireWrite } from '@/lib/security/guard';

type Ctx = { params: Promise<{ id: string }> };

// POST /api/auth/users/:id/reactivate — the counterpart to DELETE (deactivate).
export const POST = handle<Ctx>(async (_req, { params }) => {
  const actor = await requireWrite(Permission.UserManage);
  const { id } = await params;
  return ok(await reactivateUser(actor, id));
});
