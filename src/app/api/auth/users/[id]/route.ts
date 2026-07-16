import { handle, ok } from '@/lib/api/respond';
import { assertBodySize } from '@/lib/api/bodyLimit';
import {
  getUser,
  updateUser,
  deactivateUser,
  updateUserSchema,
  requirePermission,
  Permission,
} from '@/modules/auth';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/auth/users/:id
export const GET = handle<Ctx>(async (_req, { params }) => {
  const actor = await requirePermission(Permission.UserView);
  const { id } = await params;
  return ok(await getUser(actor, id));
});

// PATCH /api/auth/users/:id — update profile/role/status.
export const PATCH = handle<Ctx>(async (req, { params }) => {
  const actor = await requirePermission(Permission.UserManage);
  assertBodySize(req); // avatar payloads make this the one route that can carry real weight
  const { id } = await params;
  const body = updateUserSchema.parse(await req.json());
  return ok(await updateUser(actor, id, body));
});

// DELETE /api/auth/users/:id — soft delete (deactivate). Never hard-deletes.
export const DELETE = handle<Ctx>(async (_req, { params }) => {
  const actor = await requirePermission(Permission.UserManage);
  const { id } = await params;
  await deactivateUser(actor, id);
  return ok({ deactivated: true });
});
