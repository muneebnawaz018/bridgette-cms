import { z } from 'zod';
import { handle, ok } from '@/lib/api/respond';
import { requirePermission, Permission } from '@/modules/auth';
import {
  listProductRates,
  setProductRate,
  removeProductRate,
  setRateSchema,
} from '@/modules/products';
import { requireWrite } from '@/lib/security/guard';
import { assertBodySize } from '@/lib/api/bodyLimit';

type Ctx = { params: Promise<{ id: string }> };

// A 24-char hex ObjectId — validate the DELETE query param before it hits a deleteOne filter.
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'A valid customer is required');

// GET /api/products/:id/rates — per-customer overrides for this product.
export const GET = handle<Ctx>(async (_req, { params }) => {
  const actor = await requirePermission(Permission.ProductView);
  const { id } = await params;
  const items = await listProductRates(actor, id);
  return ok({ items });
});

// POST /api/products/:id/rates — set (upsert) a customer's negotiated rate. Admin only.
export const POST = handle<Ctx>(async (req, { params }) => {
  assertBodySize(req);
  const actor = await requireWrite(Permission.ProductEdit);
  const { id } = await params;
  const { customerId, rate } = setRateSchema.parse(await req.json());
  await setProductRate(actor, id, customerId, rate);
  return ok({ ok: true });
});

// DELETE /api/products/:id/rates?customerId= — clear a customer's override. Admin only.
export const DELETE = handle<Ctx>(async (req, { params }) => {
  const actor = await requireWrite(Permission.ProductEdit);
  const { id } = await params;
  const customerId = objectId.parse(new URL(req.url).searchParams.get('customerId'));
  await removeProductRate(actor, id, customerId);
  return ok({ ok: true });
});
