import { handle, ok } from '@/lib/api/respond';
import { refreshSession } from '@/modules/auth';

export const POST = handle(async (req) => {
  const ctx = {
    userAgent: req.headers.get('user-agent') ?? undefined,
    ip: req.headers.get('x-forwarded-for') ?? undefined,
  };
  const session = await refreshSession(ctx);
  return ok({ userId: session.userId, role: session.role, email: session.email });
});
