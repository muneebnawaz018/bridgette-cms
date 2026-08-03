import { requirePermission, Permission } from '@/modules/auth';
import { getInvoice } from '@/modules/invoicing';
import { toDocumentData, type StoredInvoiceLike } from '@/modules/invoicing/documentData';
import { renderInvoicePdf, invoicePdfFilename } from '@/lib/pdf/invoicePdf';

type Ctx = { params: Promise<{ id: string }> };

// Chromium needs a real Node process, and a cold start plus a render runs well past the default.
export const runtime = 'nodejs';
export const maxDuration = 60;

/*
 * GET /api/invoices/:id/pdf — the invoice as a real file.
 *
 * Not wrapped in `handle`/`ok`: those exist to shape JSON envelopes, and this responds with
 * application/pdf. Permission and visibility still run through getInvoice, which enforces both.
 */
export async function GET(_req: Request, { params }: Ctx): Promise<Response> {
  const actor = await requirePermission(Permission.InvoiceView);
  const { id } = await params;
  const invoice = await getInvoice(actor, id);

  const pdf = await renderInvoicePdf(toDocumentData(invoice as unknown as StoredInvoiceLike));

  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      // `inline` so a click opens it in the browser's viewer; the filename is still what a
      // "save as" lands on.
      'Content-Disposition': `inline; filename="${invoicePdfFilename(invoice.number)}"`,
      // A finalized invoice never changes, but a draft can, and nothing here is worth a stale
      // copy in a shared cache.
      'Cache-Control': 'private, no-store',
    },
  });
}
