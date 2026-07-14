import { handle, ok } from '@/lib/api/respond';
import { requireSession, ROLE_PERMISSIONS, User } from '@/modules/auth';
import { connectDb } from '@/lib/db/connection';

// Current session + full profile + permission list (for FE gating and the profile page).
export const GET = handle(async () => {
  const s = await requireSession();
  await connectDb();
  const user = await User.findById(s.userId).select('-passwordHash').lean<{
    name?: string;
    status?: string;
    phone?: string;
    isSuperAdmin?: boolean;
    createdAt?: Date;
    lastLoginAt?: Date;
  }>();

  return ok({
    userId: s.userId,
    email: s.email,
    role: s.role,
    permissions: ROLE_PERMISSIONS[s.role],
    name: user?.name ?? null,
    phone: user?.phone ?? null,
    status: user?.status ?? null,
    isSuperAdmin: user?.isSuperAdmin ?? false,
    createdAt: user?.createdAt ?? null,
    lastLoginAt: user?.lastLoginAt ?? null,
  });
});
