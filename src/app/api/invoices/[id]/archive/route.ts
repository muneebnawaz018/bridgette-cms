import { handle, ok } from '@/lib/api/respond';
import { Permission } from '@/modules/auth';
import { archiveInvoice, archiveInvoiceSchema } from '@/modules/invoicing';
import { requireWrite } from '@/lib/security/guard';
import { assertBodySize } from '@/lib/api/bodyLimit';

type Ctx = { params: Promise<{ id: string }> };

// POST /api/invoices/:id/archive — never deletes, archives with a reason.
export const POST = handle<Ctx>(async (req, { params }) => {
  assertBodySize(req);
  const actor = await requireWrite(Permission.InvoiceArchive);
  const { id } = await params;
  const { reason } = archiveInvoiceSchema.parse(await req.json());
  const invoice = await archiveInvoice(actor, id, reason);
  return ok(invoice);
});
