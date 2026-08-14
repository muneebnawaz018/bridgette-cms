import { handle, ok } from '@/lib/api/respond';
import { requirePermission, Permission } from '@/modules/auth';
import { listIntakes } from '@/modules/customers';

type Ctx = { params: Promise<{ id: string }> };

/*
 * GET /api/customers/:id/intakes — what this customer has submitted through their link.
 *
 * Pending rows drive the review panel; reviewed ones stay in the list as the record of what was
 * asserted and what staff did with it. The certificate's bytes are projected out by the service:
 * the panel only needs to know a file arrived, and the existing certificate route serves it.
 */
export const GET = handle<Ctx>(async (_req, { params }) => {
  const actor = await requirePermission(Permission.CustomerView);
  const { id } = await params;
  return ok({ items: await listIntakes(actor, id) });
});
