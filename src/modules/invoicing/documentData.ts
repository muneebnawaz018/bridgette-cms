import type { InvoiceDocumentData } from '@/components/invoices/InvoiceDocument';
import type { InvoiceType } from '@/modules/invoicing/enums';

/**
 * A stored invoice, in the shape the printable document wants.
 *
 * Shared rather than duplicated: the detail page, the PDF renderer and anything else that shows
 * a finished invoice all read from here, so a field that starts printing wrong is wrong in one
 * place. The fallbacks cover invoices written before a field existed, which is why `totalBeforeTax`
 * can be recomputed and `lineTotal` derived.
 */
export interface StoredInvoiceLike {
  number: string;
  type: string;
  issueDate?: string | Date;
  dueDate?: string | Date;
  orderDeadline?: string | Date;
  billTo?: { name?: string; email?: string; phone?: string; address?: string };
  shipTo?: { name?: string; email?: string; phone?: string; address?: string };
  reseller?: boolean;
  items: {
    description: string;
    quantity: number;
    unitPrice: number;
    discountPercent?: number;
    lineTotal?: number;
  }[];
  subtotal: number;
  shippingHandlingTariff?: number;
  totalBeforeTax?: number;
  taxRate: number;
  taxAmount: number;
  discount?: number;
  grandTotal: number;
  amountPaid: number;
  balanceDue: number;
}

export function toDocumentData(invoice: StoredInvoiceLike): InvoiceDocumentData {
  return {
    number: invoice.number,
    type: invoice.type as InvoiceType,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    orderDeadline: invoice.orderDeadline,
    billTo: invoice.billTo,
    shipTo: invoice.shipTo,
    reseller: Boolean(invoice.reseller),
    items: (invoice.items ?? []).map((it) => ({
      description: it.description,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      discountPercent: it.discountPercent ?? 0,
      lineTotal: it.lineTotal ?? it.quantity * it.unitPrice,
    })),
    subtotal: invoice.subtotal,
    shippingHandlingTariff: invoice.shippingHandlingTariff ?? 0,
    totalBeforeTax:
      invoice.totalBeforeTax ??
      invoice.subtotal + (invoice.shippingHandlingTariff ?? 0) - (invoice.discount ?? 0),
    taxRate: invoice.taxRate,
    taxAmount: invoice.taxAmount,
    discount: invoice.discount ?? 0,
    grandTotal: invoice.grandTotal,
    amountPaid: invoice.amountPaid,
    balanceDue: invoice.balanceDue,
  };
}
