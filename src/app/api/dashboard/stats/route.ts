import { handle, ok } from '@/lib/api/respond';
import { requirePermission, Permission } from '@/modules/auth';
import { getInvoiceStats } from '@/modules/invoicing';

// GET /api/dashboard/stats — aggregated, role-scoped invoice metrics.
export const GET = handle(async () => {
  const actor = await requirePermission(Permission.InvoiceView);
  return ok(await getInvoiceStats(actor));
});
