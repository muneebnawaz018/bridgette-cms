import { handle, ok } from '@/lib/api/respond';
import { createUser, createUserSchema, requireSession } from '@/modules/auth';

// Admin/Super Admin creates a user (RBAC enforced inside createUser).
export const POST = handle(async (req) => {
  const actor = await requireSession();
  const body = createUserSchema.parse(await req.json());
  const result = await createUser(actor, body);
  return ok(result, 201);
});
