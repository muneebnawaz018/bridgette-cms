// Public API of the invoicing module.

export {
  InvoiceType,
  InvoiceState,
  ShippingStatus,
  Currency,
  PaymentMethod,
  DEFAULT_CURRENCY,
  TAX_POLICY,
} from './enums';
export { computePaymentState } from './state';
export { calcInvoice, taxApplies, type CalcInput, type CalcResult } from './calc';
export { issueInvoiceNumber } from './numbering';
export {
  createInvoice,
  listInvoices,
  getInvoice,
  updateInvoice,
  archiveInvoice,
  deleteInvoice,
  getInvoiceStats,
  type InvoiceStats,
  type TypeTotals,
} from './services/invoice.service';
export {
  createInvoiceSchema,
  updateInvoiceSchema,
  listInvoiceSchema,
  archiveInvoiceSchema,
  deleteInvoiceSchema,
  type CreateInvoiceInput,
  type UpdateInvoiceInput,
  type ListInvoiceInput,
  type InvoiceView,
} from './schemas';
export { Invoice, type InvoiceDoc } from './models/invoice.model';
