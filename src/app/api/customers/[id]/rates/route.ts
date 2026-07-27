import { z } from 'zod';
import { handle, ok } from '@/lib/api/respond';
import { requirePermission, Permission } from '@/modules/auth';
import {
  listCustomerRates,
  setProductRate,
  removeProductRate,
  setCustomerRateSchema,
} from '@/modules/products';
import { requireWrite } from '@/lib/security/guard';
import { assertBodySize } from '@/lib/api/bodyLimit';

type Ctx = { params: Promise<{ id: string }> };

// A 24-char hex ObjectId — validate the DELETE query param before it hits a deleteOne filter.
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'A valid product is required');

// GET /api/customers/:id/rates — every active product with this customer's rate (null = default).
export const GET = handle<Ctx>(async (_req, { params }) => {
  const actor = await requirePermission(Permission.ProductView);
  const { id } = await params;
  const items = await listCustomerRates(actor, id);
  return ok({ items });
});

// POST /api/customers/:id/rates — set (upsert) this customer's rate for a product. Admin only.
export const POST = handle<Ctx>(async (req, { params }) => {
  assertBodySize(req);
  const actor = await requireWrite(Permission.ProductEdit);
  const { id } = await params;
  const { productId, rate } = setCustomerRateSchema.parse(await req.json());
  await setProductRate(actor, productId, id, rate);
  return ok({ ok: true });
});

// DELETE /api/customers/:id/rates?productId= — clear this customer's override for a product.
export const DELETE = handle<Ctx>(async (req, { params }) => {
  const actor = await requireWrite(Permission.ProductEdit);
  const { id } = await params;
  const productId = objectId.parse(new URL(req.url).searchParams.get('productId'));
  await removeProductRate(actor, productId, id);
  return ok({ ok: true });
});
