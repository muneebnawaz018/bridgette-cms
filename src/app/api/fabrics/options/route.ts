import { handle, ok } from '@/lib/api/respond';
import { requirePermission, Permission } from '@/modules/auth';
import { listFabricOptions } from '@/modules/products';

// GET /api/fabrics/options — lightweight fabric list for the product form's picker.
export const GET = handle(async () => {
  const actor = await requirePermission(Permission.ProductView);
  const items = await listFabricOptions(actor);
  return ok({ items });
});
