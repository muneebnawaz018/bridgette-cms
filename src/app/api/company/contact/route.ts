import { handle, ok } from '@/lib/api/respond';
import { requireSession } from '@/modules/auth';
import { env } from '@/lib/config/env';

/**
 * GET /api/company/contact — the canonical Super Admin contact email, shown as the billing
 * contact on the terms pages. Sourced from SUPER_ADMIN_EMAIL (the seed config), not the live
 * DB row, so it stays the intended mailbox even if that account's own profile email changes.
 * Session-gated (this app is internal, so "a signed-in user" is the audience).
 */
export const GET = handle(async () => {
  await requireSession();
  return ok({ email: env.superAdminEmail || null });
});
