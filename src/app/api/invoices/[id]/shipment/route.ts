import { handle, ok } from '@/lib/api/respond';
import { requirePermission, Permission } from '@/modules/auth';
import {
  getShipment,
  createShipment,
  updateShipment,
  shipmentInputSchema,
} from '@/modules/shipments';
import { requireWrite } from '@/lib/security/guard';
import { assertBodySize } from '@/lib/api/bodyLimit';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/invoices/:id/shipment — the invoice's shipping details, or null when nothing has
// shipped yet. Null rather than a 404: the dialog opens on its add form in that case.
export const GET = handle<Ctx>(async (_req, { params }) => {
  const actor = await requirePermission(Permission.ShipmentView);
  const { id } = await params;
  return ok(await getShipment(actor, id));
});

// POST /api/invoices/:id/shipment — record shipping details for the first time.
export const POST = handle<Ctx>(async (req, { params }) => {
  assertBodySize(req);
  const actor = await requireWrite(Permission.ShipmentManage);
  const { id } = await params;
  const body = shipmentInputSchema.parse(await req.json());
  return ok(await createShipment(actor, id, body), 201);
});

// PATCH /api/invoices/:id/shipment — edit them. The form is four fields and submits all of
// them, so this replaces the record rather than merging a subset; that is what lets a cleared
// ETA actually clear.
export const PATCH = handle<Ctx>(async (req, { params }) => {
  assertBodySize(req);
  const actor = await requireWrite(Permission.ShipmentManage);
  const { id } = await params;
  const body = shipmentInputSchema.parse(await req.json());
  return ok(await updateShipment(actor, id, body));
});
