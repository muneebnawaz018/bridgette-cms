import 'server-only';
import type { Types } from 'mongoose';
import { Customer } from '@/modules/customers/models/customer.model';

/*
 * Where an invoice would actually be emailed.
 *
 * `billTo` is a snapshot of the party as they were when the invoice was raised, and it stays that
 * way — the name and address printed on an issued document are a record of what was agreed, not a
 * live view of the customer. Where to post it is a separate question with a separate answer: the
 * address they have now.
 *
 * One implementation, because three callers need the same answer and any disagreement between
 * them is a bug the user sees — a confirm dialog naming one address while the send uses another.
 * The list resolves this in its aggregation (the same `$ifNull` precedence); this is the version
 * for the paths that already hold a document.
 */

export interface SendToSource {
  customerId?: Types.ObjectId | string | null;
  billTo?: { email?: string | null } | null;
}

/**
 * The customer's current email, falling back to the billing snapshot.
 *
 * The fallback only applies when there is nothing better: an invoice raised before invoices were
 * linked to customers, or one whose customer has since been deleted. A customer who is present
 * but has no email returns empty — that is them saying "do not email me", and reaching past it
 * to a stale snapshot would send to an address they deliberately removed.
 */
export async function resolveSendTo(doc: SendToSource): Promise<string> {
  if (doc.customerId) {
    const customer = await Customer.findById(doc.customerId).select('email').lean();
    if (customer) return (customer.email ?? '').trim();
  }
  return (doc.billTo?.email ?? '').trim();
}
