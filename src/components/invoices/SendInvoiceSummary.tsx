'use client';

import { formatMoney } from '@/lib/format/money';

/*
 * The line of text in the send confirm. Shared by the list row and the invoice page so the two
 * cannot drift apart, and so the address shown is always the one the send will use.
 *
 * Names the customer as well as the address: sending cannot be undone, and the mistake worth
 * catching at this point is the wrong customer, which an email address alone does not reveal.
 */

export interface SendInvoiceSummaryProps {
  customerName?: string;
  /** Resolved server-side. Absent means there is nowhere to send it. */
  sendTo?: string;
  total: number;
  currency: string;
  /** Set when this invoice has gone out before, so a second send is a deliberate repeat. */
  alreadySent?: boolean;
}

export function SendInvoiceSummary({
  customerName,
  sendTo,
  total,
  currency,
  alreadySent,
}: SendInvoiceSummaryProps) {
  if (!sendTo) {
    return <>This customer has no email address. Add one to the customer record first.</>;
  }

  return (
    <>
      Sending {formatMoney(currency, total)} to <strong>{customerName || 'this customer'}</strong>{' '}
      at <strong>{sendTo}</strong>, PDF attached.
      {alreadySent && ' Already sent once.'}
    </>
  );
}
