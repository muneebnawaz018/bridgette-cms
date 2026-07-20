import 'server-only';
import { connectDb } from '@/lib/db/connection';
import { Permission, assertCan, type SessionUser } from '@/modules/auth';
import { Invoice } from '@/modules/invoicing';
import { InvoiceState } from '@/modules/invoicing/enums';
import { computePaymentState } from '@/modules/invoicing/state';
import { canViewInvoice } from '@/modules/invoicing/visibility';
import { round2, nonNegative } from '@/lib/money/money';
import { Payment, type PaymentDoc } from '../models/payment.model';
import type { RecordPaymentInput } from '../schemas';

/**
 * Recompute an invoice's amountPaid, balanceDue, and state from its payment ledger.
 * Payment-driven state is derived, never set by hand. Drafts stay Draft.
 *
 * The ledger total is summed in the database (indexed `invoiceId` + `$group`), so we
 * never pull every payment document into memory just to add them up.
 */
async function recalcInvoice(invoiceId: string): Promise<void> {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) return;

  const [agg] = await Payment.aggregate<{ total: number }>([
    { $match: { invoiceId: invoice._id } },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);
  const amountPaid = round2(agg?.total ?? 0);
  invoice.amountPaid = amountPaid;
  invoice.balanceDue = nonNegative(invoice.grandTotal - amountPaid);

  if (invoice.state !== InvoiceState.Draft) {
    invoice.state = computePaymentState({
      amountPaid,
      grandTotal: invoice.grandTotal,
      dueDate: invoice.dueDate,
    });
  }
  await invoice.save();
}

/** Record a payment against an invoice, then recompute its balance + state. */
export async function recordPayment(
  actor: SessionUser,
  invoiceId: string,
  input: RecordPaymentInput,
) {
  assertCan(actor.role, Permission.PaymentRecord);
  await connectDb();

  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw new Error('Invoice not found');
  // listPayments already applies this; recording one did not, so an invoice the caller
  // cannot read could still have money booked against it.
  if (!canViewInvoice(actor, invoice)) throw new Error('Forbidden: invoice not visible');
  if (invoice.isDeleted) throw new Error('Cannot record payment on a deleted invoice');
  if (invoice.isArchived) throw new Error('Cannot record payment on an archived invoice');

  // Block overpayment unless explicitly allowed.
  const projected = round2(invoice.amountPaid + input.amount);
  if (!input.allowOverpay && projected > invoice.grandTotal) {
    throw new Error(
      `Payment exceeds balance due (${nonNegative(invoice.grandTotal - invoice.amountPaid)} remaining)`,
    );
  }

  const payment = await Payment.create({
    invoiceId,
    amount: round2(input.amount),
    currency: invoice.currency,
    method: input.method,
    reference: input.reference,
    account: input.account,
    notes: input.notes,
    paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
    recordedBy: actor.userId,
  });

  await recalcInvoice(invoiceId);
  return payment.toObject();
}

/** List payments for an invoice (respects invoice archive visibility). */
export async function listPayments(actor: SessionUser, invoiceId: string) {
  assertCan(actor.role, Permission.InvoiceView);
  await connectDb();

  const invoice = await Invoice.findById(invoiceId).lean();
  if (!invoice) throw new Error('Invoice not found');
  if (!canViewInvoice(actor, invoice)) throw new Error('Forbidden: invoice not visible');

  return Payment.find({ invoiceId }).sort({ paidAt: -1 }).lean<PaymentDoc[]>();
}
