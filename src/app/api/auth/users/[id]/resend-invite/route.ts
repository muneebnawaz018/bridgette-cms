import { handle, ok } from '@/lib/api/respond';
import { resendInvite, Permission } from '@/modules/auth';
import { requireWrite } from '@/lib/security/guard';

type Ctx = { params: Promise<{ id: string }> };

// POST /api/auth/users/:id/resend-invite — issue a fresh code and email it again.
export const POST = handle<Ctx>(async (_req, { params }) => {
  const actor = await requireWrite(Permission.UserManage);
  const { id } = await params;
  return ok(await resendInvite(actor, id));
});
