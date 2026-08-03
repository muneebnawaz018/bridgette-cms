import 'server-only';
import { connectDb } from '@/lib/db/connection';
import { Permission, assertCan, type SessionUser } from '@/modules/auth';
import { sendMail } from '@/lib/email/mailer';
import { invoiceEmail } from '@/lib/email/templates';
import { renderInvoicePdf, invoicePdfFilename } from '@/lib/pdf/invoicePdf';
import { toDocumentData, type StoredInvoiceLike } from '@/modules/invoicing/documentData';
import { COMPANY_CONTACT } from '@/modules/legal/company';
import { formatMoney } from '@/lib/format/money';
import { logger } from '@/lib/logger/logger';
import { Invoice } from '../models/invoice.model';
import { InvoiceState } from '../enums';
import { canViewInvoice } from '../visibility';

/*
 * Emailing an invoice to the customer, PDF attached.
 *
 * Deliberately explicit, never automatic-on-save: an invoice raised to correct a mistake would
 * otherwise mail the customer a second time with no way to stop it. The caller decides; this
 * just refuses the cases that would embarrass whoever pressed the button.
 */

export interface SendInvoiceResult {
  to: string;
  sentAt: Date;
}

const dateLabel = (d?: Date | string | null) =>
  d
    ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : undefined;

/**
 * Send invoice `id` to its billing email, or to `overrideTo` when one is given (a customer who
 * asks for it to go to their accounts address, without editing the record).
 */
export async function sendInvoiceToCustomer(
  actor: SessionUser,
  id: string,
  overrideTo?: string,
): Promise<SendInvoiceResult> {
  // Sending is a customer-facing act, so it needs more than read access.
  assertCan(actor.role, Permission.InvoiceEdit);
  await connectDb();

  const doc = await Invoice.findById(id).lean();
  if (!doc) throw new Error('Invoice not found');
  if (!canViewInvoice(actor, doc)) throw new Error('Forbidden: invoice not visible');

  // A draft has no agreed figures and a deleted one should never have gone out at all. Both are
  // refused here rather than in the UI alone, so the API cannot be talked into it either.
  if (doc.state === InvoiceState.Draft) {
    throw new Error('This invoice is still a draft. Finalize it before sending.');
  }
  if (doc.isDeleted) throw new Error('This invoice has been deleted and cannot be sent.');

  const to = (overrideTo ?? doc.billTo?.email ?? '').trim();
  if (!to) {
    throw new Error('This customer has no email address. Add one before sending.');
  }

  const currency = doc.currency ?? 'USD';
  const paid = doc.amountPaid ?? 0;
  const mail = invoiceEmail({
    invoiceNumber: doc.number,
    billTo: doc.billTo?.name,
    total: formatMoney(currency, doc.grandTotal ?? 0),
    // Only mentioned when something is already paid, so a fresh invoice does not print the same
    // figure twice under two different labels.
    paid: paid > 0 ? formatMoney(currency, paid) : undefined,
    amountDue: formatMoney(currency, doc.balanceDue ?? doc.grandTotal ?? 0),
    issueDate: dateLabel(doc.issueDate),
    dueDate: dateLabel(doc.dueDate),
    companyName: COMPANY_CONTACT.name,
  });

  const pdf = await renderInvoicePdf(toDocumentData(doc as unknown as StoredInvoiceLike));

  await sendMail({
    to,
    ...mail,
    attachments: [
      { filename: invoicePdfFilename(doc.number), content: pdf, contentType: 'application/pdf' },
    ],
  });

  /*
   * Stamped only after the mail server accepted it. A failed send leaves no trace of success, so
   * the invoice still reads as unsent and can simply be retried — the same rule the reminder
   * sweep follows.
   */
  const sentAt = new Date();
  await Invoice.updateOne(
    { _id: doc._id },
    {
      $set: { 'sent.at': sentAt, 'sent.to': to, 'sent.by': actor.userId },
      $inc: { 'sent.count': 1 },
    },
  );

  logger.info('invoice emailed to customer', {
    invoiceId: String(doc._id),
    number: doc.number,
    to,
    by: actor.userId,
  });

  return { to, sentAt };
}
