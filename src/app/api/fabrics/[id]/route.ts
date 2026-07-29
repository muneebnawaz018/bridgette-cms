import { handle, ok } from '@/lib/api/respond';
import { requirePermission, Permission } from '@/modules/auth';
import {
  getFabric,
  updateFabric,
  deleteFabric,
  fabricUpdateSchema,
  deleteFabricSchema,
} from '@/modules/products';
import { requireWrite } from '@/lib/security/guard';
import { assertBodySize } from '@/lib/api/bodyLimit';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/fabrics/:id
export const GET = handle<Ctx>(async (_req, { params }) => {
  const actor = await requirePermission(Permission.ProductView);
  const { id } = await params;
  const fabric = await getFabric(actor, id);
  return ok(fabric);
});

// PATCH /api/fabrics/:id — edit (admin only).
export const PATCH = handle<Ctx>(async (req, { params }) => {
  assertBodySize(req);
  const actor = await requireWrite(Permission.ProductEdit);
  const { id } = await params;
  const body = fabricUpdateSchema.parse(await req.json());
  const fabric = await updateFabric(actor, id, body);
  return ok(fabric);
});

// DELETE /api/fabrics/:id — soft-delete (never hard-deletes), admin only. Refused while a live
// product still uses the fabric.
export const DELETE = handle<Ctx>(async (req, { params }) => {
  assertBodySize(req);
  const actor = await requireWrite(Permission.ProductDelete);
  const { id } = await params;
  const { reason } = deleteFabricSchema.parse(await req.json().catch(() => ({})));
  const fabric = await deleteFabric(actor, id, reason);
  return ok(fabric);
});
