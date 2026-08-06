import { handle, ok } from '@/lib/api/respond';
import { requirePermission, Permission } from '@/modules/auth';
import { getInvoiceStats, STATS_RANGES, type StatsRange } from '@/modules/invoicing';

// GET /api/dashboard/stats?range=month|3m|6m|9m|12m|all — aggregated, role-scoped invoice
// metrics. An unknown range falls back to `all` rather than erroring: the dashboard is a
// read-only summary, so a stale bookmark should still render.
export const GET = handle(async (req: Request) => {
  const actor = await requirePermission(Permission.InvoiceView);
  const raw = new URL(req.url).searchParams.get('range');
  const range = (STATS_RANGES as readonly string[]).includes(raw ?? '')
    ? (raw as StatsRange)
    : 'all';
  return ok(await getInvoiceStats(actor, range));
});
