import { handle, ok } from '@/lib/api/respond';
import { login, loginSchema } from '@/modules/auth';

export const POST = handle(async (req) => {
  const body = loginSchema.parse(await req.json());
  const ctx = {
    userAgent: req.headers.get('user-agent') ?? undefined,
    ip: req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? undefined,
  };
  const session = await login(body, ctx);
  return ok({ userId: session.userId, role: session.role, email: session.email });
});
