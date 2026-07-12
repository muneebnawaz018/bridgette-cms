import { handle, ok } from '@/lib/api/respond';
import { requirePermission, Permission } from '@/modules/auth';
import { createInvoice, listInvoices, createInvoiceSchema, listInvoiceSchema } from '@/modules/invoicing';

// GET /api/invoices — paginated, role-scoped list.
export const GET = handle(async (req) => {
  const actor = await requirePermission(Permission.InvoiceView);
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const query = listInvoiceSchema.parse(params);
  const result = await listInvoices(actor, query);
  return ok(result);
});

// POST /api/invoices — create.
export const POST = handle(async (req) => {
  const actor = await requirePermission(Permission.InvoiceCreate);
  const body = createInvoiceSchema.parse(await req.json());
  const invoice = await createInvoice(actor, body);
  return ok(invoice, 201);
});
