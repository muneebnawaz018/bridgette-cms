import { handle, ok } from '@/lib/api/respond';
import { requirePermission, Permission } from '@/modules/auth';
import {
  createProduct,
  listProducts,
  productCreateSchema,
  listProductSchema,
} from '@/modules/products';
import { requireWrite } from '@/lib/security/guard';
import { assertBodySize } from '@/lib/api/bodyLimit';

// GET /api/products — paginated, company-wide catalogue.
export const GET = handle(async (req) => {
  const actor = await requirePermission(Permission.ProductView);
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const query = listProductSchema.parse(params);
  const result = await listProducts(actor, query);
  return ok(result);
});

// POST /api/products — create (admin only).
export const POST = handle(async (req) => {
  assertBodySize(req);
  const actor = await requireWrite(Permission.ProductCreate);
  const body = productCreateSchema.parse(await req.json());
  const product = await createProduct(actor, body);
  return ok(product, 201);
});
