import { handle, ok } from '@/lib/api/respond';
import { requirePermission, Permission } from '@/modules/auth';
import {
  createFabric,
  listFabrics,
  fabricCreateSchema,
  listFabricSchema,
} from '@/modules/products';
import { requireWrite } from '@/lib/security/guard';
import { assertBodySize } from '@/lib/api/bodyLimit';

// GET /api/fabrics — paginated, company-wide fabric list.
export const GET = handle(async (req) => {
  const actor = await requirePermission(Permission.ProductView);
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const query = listFabricSchema.parse(params);
  const result = await listFabrics(actor, query);
  return ok(result);
});

// POST /api/fabrics — create (admin only).
export const POST = handle(async (req) => {
  assertBodySize(req);
  const actor = await requireWrite(Permission.ProductCreate);
  const body = fabricCreateSchema.parse(await req.json());
  const fabric = await createFabric(actor, body);
  return ok(fabric, 201);
});
