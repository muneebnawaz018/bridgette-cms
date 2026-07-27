import { handle, ok } from '@/lib/api/respond';
import { requirePermission, Permission } from '@/modules/auth';
import { listProductOptions } from '@/modules/products';

// GET /api/products/options[?customerId=] — product list for the invoice line picker. With a
// customerId, each item's `rate` is that customer's negotiated price (else the default).
export const GET = handle(async (req) => {
  const actor = await requirePermission(Permission.ProductView);
  const customerId = new URL(req.url).searchParams.get('customerId') ?? undefined;
  const items = await listProductOptions(actor, customerId);
  return ok({ items });
});
