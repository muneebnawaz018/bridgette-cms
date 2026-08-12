/** The legal entity behind the Portal and its invoices. One source, shared by both terms
 *  documents and the app footer, so the name never disagrees with itself. */
export const COMPANY = 'Bridgette Enterprises LLC';

/** The product name used in system-facing copy. */
export const PORTAL_NAME = 'Bridgette Portal';

/** A contact block as printed on an invoice header — one per operating location. */
export interface CompanyContact {
  name: string;
  /** Street/city lines, rendered one per line. Length varies by location, so it is a list
   *  rather than a fixed addressLine1/2 pair the Pakistan office would leave half empty. */
  addressLines: readonly string[];
  /** E.164, like every other number in the system. Display goes through formatPhone, so how a
   *  number is written is decided in one place instead of being typed out per location. */
  phone: string;
  email: string;
}

/** US operations — the registered entity. Billed under `tax` and `cash` invoices. */
export const COMPANY_CONTACT_US: CompanyContact = {
  name: COMPANY,
  addressLines: ['5775 Riverside DR', 'Chino, CA 91710-6710'],
  phone: '+19095168570',
  email: 'Info@bridgetteenterprises.com',
};

/** Pakistan operations — the Sialkot office, billed under `pk` invoices (still in USD). */
export const COMPANY_CONTACT_PK: CompanyContact = {
  name: 'Bridgette Enterprises',
  addressLines: ['Sialkot, Pakistan'],
  phone: '+923042492222',
  email: 'bridgette.enterprises@gmail.com',
};

/**
 * The contact block an invoice of this type is issued from. `pk` bills from Sialkot; the two US
 * types bill from Chino. Kept as a function of the type rather than a field on the invoice so a
 * corrected address applies to every invoice at once, old ones included.
 *
 * Typed loosely on purpose: importing InvoiceType here would make the legal module depend on
 * invoicing, which imports this one.
 */
export function companyContactFor(type?: string): CompanyContact {
  return type === 'pk' ? COMPANY_CONTACT_PK : COMPANY_CONTACT_US;
}

/** Invoice terms & conditions, shown verbatim under the line-item table on the document. */
export const INVOICE_TERMS: { label: string; url: string }[] = [
  { label: 'FAQ', url: 'https://bridgetteenterprises.com/faqs/' },
  { label: 'Shipping', url: 'https://bridgetteenterprises.com/shipping/' },
  { label: 'Payments', url: 'https://bridgetteenterprises.com/payments/' },
  { label: 'Returns', url: 'https://bridgetteenterprises.com/returns/' },
];
