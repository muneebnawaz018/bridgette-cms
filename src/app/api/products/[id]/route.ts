import { handle, ok } from '@/lib/api/respond';
import { requirePermission, Permission } from '@/modules/auth';
import {
  getProduct,
  updateProduct,
  deleteProduct,
  productUpdateSchema,
  deleteProductSchema,
} from '@/modules/products';
import { requireWrite } from '@/lib/security/guard';
import { assertBodySize } from '@/lib/api/bodyLimit';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/products/:id
export const GET = handle<Ctx>(async (_req, { params }) => {
  const actor = await requirePermission(Permission.ProductView);
  const { id } = await params;
  const product = await getProduct(actor, id);
  return ok(product);
});

// PATCH /api/products/:id — edit (admin only).
export const PATCH = handle<Ctx>(async (req, { params }) => {
  assertBodySize(req);
  const actor = await requireWrite(Permission.ProductEdit);
  const { id } = await params;
  const body = productUpdateSchema.parse(await req.json());
  const product = await updateProduct(actor, id, body);
  return ok(product);
});

// DELETE /api/products/:id — soft-delete (never hard-deletes), admin only.
export const DELETE = handle<Ctx>(async (req, { params }) => {
  assertBodySize(req);
  const actor = await requireWrite(Permission.ProductDelete);
  const { id } = await params;
  const { reason } = deleteProductSchema.parse(await req.json().catch(() => ({})));
  const product = await deleteProduct(actor, id, reason);
  return ok(product);
});
