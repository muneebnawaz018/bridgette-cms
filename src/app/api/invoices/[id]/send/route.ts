import { z } from 'zod';
import { handle, ok } from '@/lib/api/respond';
import { requireWrite } from '@/lib/security/guard';
import { Permission } from '@/modules/auth';
import { assertBodySize } from '@/lib/api/bodyLimit';
import { sendInvoiceToCustomer } from '@/modules/invoicing/services/invoiceSend.service';

type Ctx = { params: Promise<{ id: string }> };

// Chromium renders the attachment in-process; a cold start plus a render outruns the default.
export const runtime = 'nodejs';
export const maxDuration = 60;

const sendSchema = z.object({
  /** Send somewhere other than the stored billing email, without editing the customer. */
  to: z.string().trim().email('Enter a valid email address').optional(),
});

// POST /api/invoices/:id/send — email the invoice to the customer with the PDF attached.
export const POST = handle<Ctx>(async (req, { params }) => {
  assertBodySize(req);
  const actor = await requireWrite(Permission.InvoiceEdit);
  const { id } = await params;
  // An empty body is the ordinary case: send it to whoever the invoice is billed to.
  const body = sendSchema.parse(await req.json().catch(() => ({})));
  const result = await sendInvoiceToCustomer(actor, id, body.to);
  return ok(result);
});
