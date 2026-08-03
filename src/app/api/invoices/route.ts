import { handle, ok } from '@/lib/api/respond';
import { requirePermission, Permission } from '@/modules/auth';
import {
  createInvoice,
  listInvoices,
  createInvoiceSchema,
  listInvoiceSchema,
} from '@/modules/invoicing';
import { requireWrite } from '@/lib/security/guard';
import { assertBodySize } from '@/lib/api/bodyLimit';

// GET /api/invoices — paginated, role-scoped list.
export const GET = handle(async (req) => {
  const actor = await requirePermission(Permission.InvoiceView);
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const query = listInvoiceSchema.parse(params);
  const result = await listInvoices(actor, query);
  return ok(result);
});

/*
 * POST /api/invoices — create only. Creating does not email the customer.
 *
 * It used to. The problem with sending on save is that there is no unsend: an invoice with the
 * wrong price, the wrong line or the wrong customer is already in their inbox before anyone has
 * looked at it, and the correction has to be a second email admitting the first. Whoever raised
 * it lands on the preview page, checks it, and presses Email to customer when it is right.
 *
 * It also kept the request open for the length of a PDF render plus an SMTP round trip, so the
 * form sat blocked for the better part of ten seconds on every save.
 */
export const POST = handle(async (req) => {
  assertBodySize(req);
  const actor = await requireWrite(Permission.InvoiceCreate);
  const body = createInvoiceSchema.parse(await req.json());
  const invoice = await createInvoice(actor, body);
  return ok(invoice, 201);
});
