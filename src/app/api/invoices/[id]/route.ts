import { handle, ok } from '@/lib/api/respond';
import { requirePermission, Permission } from '@/modules/auth';
import {
  getInvoice,
  updateInvoice,
  deleteInvoice,
  updateInvoiceSchema,
  deleteInvoiceSchema,
} from '@/modules/invoicing';

type Ctx = { params: Promise<{ id: string }> };

// GET /api/invoices/:id
export const GET = handle<Ctx>(async (_req, { params }) => {
  const actor = await requirePermission(Permission.InvoiceView);
  const { id } = await params;
  const invoice = await getInvoice(actor, id);
  return ok(invoice);
});

// PATCH /api/invoices/:id
export const PATCH = handle<Ctx>(async (req, { params }) => {
  const actor = await requirePermission(Permission.InvoiceEdit);
  const { id } = await params;
  const body = updateInvoiceSchema.parse(await req.json());
  const invoice = await updateInvoice(actor, id, body);
  return ok(invoice);
});

// DELETE /api/invoices/:id — soft-delete (never hard-deletes). Requires a reason.
export const DELETE = handle<Ctx>(async (req, { params }) => {
  const actor = await requirePermission(Permission.InvoiceDelete);
  const { id } = await params;
  const { reason } = deleteInvoiceSchema.parse(await req.json());
  const invoice = await deleteInvoice(actor, id, reason);
  return ok(invoice);
});
