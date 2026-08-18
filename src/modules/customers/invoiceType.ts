import { InvoiceType } from '@/modules/invoicing/enums';

/**
 * Which invoice a customer is billed with, derived from facts they can actually answer.
 *
 * The intake form never asks for it. A customer has no way of knowing what "US Cash" means here,
 * and letting them pick would put a tax decision in the hands of the party it costs money — so
 * the two things they do know, where they are and whether they hold a resale certificate, decide
 * it on the server when the submission lands.
 *
 *   Pakistan          → PK, billed out of the Sialkot office
 *   US, reseller      → Cash, the type that never carries sales tax
 *   US, not a reseller→ Tax
 */
export function invoiceTypeFor(country: string | undefined, reseller: boolean): InvoiceType {
  if (country === 'PK') return InvoiceType.PK;
  return reseller ? InvoiceType.Cash : InvoiceType.Tax;
}

/**
 * A resale certificate is a US sales-tax instrument. Pakistani operations do not charge US sales
 * tax at all, so there is nothing for one to exempt — a PK customer is never a reseller, however
 * the certificate reached us.
 */
export function canBeReseller(country: string | undefined): boolean {
  return country !== 'PK';
}
