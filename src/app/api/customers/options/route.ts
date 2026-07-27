import { z } from 'zod';
import { handle, ok } from '@/lib/api/respond';
import { requirePermission, Permission } from '@/modules/auth';
import { listCustomerOptions } from '@/modules/customers';

// GET /api/customers/options?q=&limit=&skip= — paginated customer picker list; `q` runs a
// server-side name/email/company search. Returns { items, hasMore } for load-on-scroll.
const querySchema = z.object({
  q: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  skip: z.coerce.number().int().min(0).max(100_000).optional(),
});

export const GET = handle(async (req: Request) => {
  const actor = await requirePermission(Permission.CustomerView);
  const sp = new URL(req.url).searchParams;
  const { q, limit, skip } = querySchema.parse({
    q: sp.get('q') ?? undefined,
    limit: sp.get('limit') ?? undefined,
    skip: sp.get('skip') ?? undefined,
  });
  const { items, hasMore } = await listCustomerOptions(actor, { q, limit, skip });
  return ok({ items, hasMore });
});
