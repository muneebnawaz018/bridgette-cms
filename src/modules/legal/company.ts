/** The legal entity behind the Portal and its invoices. One source, shared by both terms
 *  documents and the app footer, so the name never disagrees with itself. */
export const COMPANY = 'Bridgette Enterprises LLC';

/** The product name used in system-facing copy. */
export const PORTAL_NAME = 'Bridgette Portal';

/** Company contact block, as printed on the invoice document header. Single source of truth. */
export const COMPANY_CONTACT = {
  name: COMPANY,
  addressLine1: '5775 Riverside DR',
  addressLine2: 'Chino, CA 91710-6710',
  /*
   * Stored as E.164, like every other number in the system. It used to be the literal string
   * `1 (909) 516-8570`, which is neither of the two US conventions and could not be dialled from
   * outside the country. Display goes through formatPhone, so the way it is written is decided in
   * one place instead of being typed out here and diverging from every customer's number.
   */
  phone: '+19095168570',
  email: 'Info@bridgetteenterprises.com',
} as const;

/** Invoice terms & conditions, shown verbatim under the line-item table on the document. */
export const INVOICE_TERMS: { label: string; url: string }[] = [
  { label: 'FAQ', url: 'https://bridgetteenterprises.com/faqs/' },
  { label: 'Shipping', url: 'https://bridgetteenterprises.com/shipping/' },
  { label: 'Payments', url: 'https://bridgetteenterprises.com/payments/' },
  { label: 'Returns', url: 'https://bridgetteenterprises.com/returns/' },
];
