import { handle, ok } from '@/lib/api/respond';
import { requirePermission, Permission } from '@/modules/auth';
import {
  createInvoice,
  listInvoices,
  createInvoiceSchema,
  listInvoiceSchema,
} from '@/modules/invoicing';
import { sendInvoiceToCustomer } from '@/modules/invoicing/services/invoiceSend.service';
import { requireWrite } from '@/lib/security/guard';
import { assertBodySize } from '@/lib/api/bodyLimit';
import { logger } from '@/lib/logger/logger';

// Finalizing an invoice renders a PDF and sends it inline, which needs a real Node process
// and outlasts the default budget.
export const runtime = 'nodejs';
export const maxDuration = 60;

// GET /api/invoices — paginated, role-scoped list.
export const GET = handle(async (req) => {
  const actor = await requirePermission(Permission.InvoiceView);
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const query = listInvoiceSchema.parse(params);
  const result = await listInvoices(actor, query);
  return ok(result);
});

/** What happened to the customer email, so the UI can say so rather than guess. */
interface EmailOutcome {
  sent: boolean;
  to?: string;
  /** Why it did not go: no address, still a draft, or the mail/PDF step failed. */
  reason?: string;
}

// POST /api/invoices — create, and email it to the customer when it is finalized.
export const POST = handle(async (req) => {
  assertBodySize(req);
  const actor = await requireWrite(Permission.InvoiceCreate);
  const body = createInvoiceSchema.parse(await req.json());
  const invoice = await createInvoice(actor, body);

  /*
   * The send is awaited, not fired and forgotten: the caller is told what actually happened and
   * shows it, instead of a "sent" toast that was only ever a hope. It costs the request a few
   * seconds — a PDF render plus an SMTP round trip — which is the price of an honest answer.
   *
   * What it must never do is fail the creation. The invoice is already written and numbered; a
   * refused mail server is not a reason to pretend it does not exist, so the error is reported
   * as an outcome and the invoice still comes back 201. "Email to customer" on the list and on
   * the invoice page is the retry.
   */
  let emailed: EmailOutcome = { sent: false };
  if (body.asDraft) {
    emailed.reason = 'Drafts are not sent to customers.';
  } else if (!invoice.customerId && !invoice.billTo?.email) {
    // Checked against the link as well as the snapshot, since the send resolves the address
    // through the customer record and can succeed where the snapshot is blank.
    emailed.reason = 'This customer has no email address.';
  } else {
    try {
      const result = await sendInvoiceToCustomer(actor, String(invoice._id));
      emailed = { sent: true, to: result.to };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      emailed = { sent: false, reason };
      logger.error('invoice created but could not be emailed', {
        invoiceId: String(invoice._id),
        number: invoice.number,
        reason,
      });
    }
  }

  return ok({ ...invoice, emailed }, 201);
});
