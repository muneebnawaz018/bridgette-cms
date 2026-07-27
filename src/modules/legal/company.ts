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
  phone: '1 (909) 516-8570',
  email: 'Info@bridgetteenterprises.com',
} as const;

/** Invoice terms & conditions, shown verbatim under the line-item table on the document. */
export const INVOICE_TERMS: { label: string; url: string }[] = [
  { label: 'FAQ', url: 'https://bridgetteenterprises.com/faqs/' },
  { label: 'Shipping', url: 'https://bridgetteenterprises.com/shipping/' },
  { label: 'Payments', url: 'https://bridgetteenterprises.com/payments/' },
  { label: 'Returns', url: 'https://bridgetteenterprises.com/returns/' },
];
