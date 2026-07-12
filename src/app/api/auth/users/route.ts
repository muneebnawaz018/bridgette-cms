import { handle, ok } from '@/lib/api/respond';
import {
  createUser,
  listUsers,
  createUserSchema,
  listUsersSchema,
  requirePermission,
  requireSession,
  Permission,
} from '@/modules/auth';

// GET /api/auth/users — paginated, searchable list (requires UserView).
export const GET = handle(async (req) => {
  const actor = await requirePermission(Permission.UserView);
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const query = listUsersSchema.parse(params);
  const result = await listUsers(actor, query);
  return ok(result);
});

// POST /api/auth/users — create a user (RBAC enforced in createUser; emails OTP).
export const POST = handle(async (req) => {
  const actor = await requireSession();
  const body = createUserSchema.parse(await req.json());
  const result = await createUser(actor, body);
  return ok(result, 201);
});
