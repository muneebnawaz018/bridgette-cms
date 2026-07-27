/** The three independent invoice types, each with its own numbering sequence. */
export enum InvoiceType {
  Tax = 'tax', // US, account/bank transfer, always sales tax
  Cash = 'cash', // US, direct cash, never sales tax
  PK = 'pk', // Pakistan operations, billed in USD, optional tax
}

/**
 * Unified invoice state — the 5-state lifecycle.
 *
 *   Draft         — partially created, not finalized
 *   Pending       — finalized/created, no payment yet
 *   PartiallyPaid — some payment received, balance remains
 *   Paid          — balance is zero
 *   Overdue       — finalized + unpaid balance past the due date
 *
 * Payment-driven states (Pending/PartiallyPaid/Paid/Overdue) are computed from the
 * ledger + due date — never set by hand (see state.ts). Draft is set explicitly.
 */
export enum InvoiceState {
  Draft = 'draft',
  Pending = 'pending',
  PartiallyPaid = 'partiallyPaid',
  Paid = 'paid',
  Overdue = 'overdue',
}

/** Shipping/tracking status (spec 4.11). Not used by Cash/PK for now. */
export enum ShippingStatus {
  NotShipped = 'notShipped',
  Preparing = 'preparing',
  Shipped = 'shipped',
  InTransit = 'inTransit',
  OutForDelivery = 'outForDelivery',
  Delivered = 'delivered',
  Delayed = 'delayed',
  Returned = 'returned',
  Lost = 'lost',
  Cancelled = 'cancelled',
}

/** Supported currencies. USD only — every invoice (US or PK) is billed in USD. */
export enum Currency {
  USD = 'USD',
}

/** Payment methods (spec 4.8). */
export enum PaymentMethod {
  Cash = 'cash',
  Zelle = 'zelle',
  BankTransfer = 'bankTransfer',
  PayPal = 'paypal',
  CashApp = 'cashapp',
  Card = 'card',
  Cheque = 'cheque',
  Other = 'other',
}

/** Default currency per invoice type. All types bill in USD, including PK. */
export const DEFAULT_CURRENCY: Record<InvoiceType, Currency> = {
  [InvoiceType.Tax]: Currency.USD,
  [InvoiceType.Cash]: Currency.USD,
  [InvoiceType.PK]: Currency.USD,
};

/** Whether sales tax applies for a type: Tax = always, Cash = never, PK = optional. */
export const TAX_POLICY: Record<InvoiceType, 'always' | 'never' | 'optional'> = {
  [InvoiceType.Tax]: 'always',
  [InvoiceType.Cash]: 'never',
  [InvoiceType.PK]: 'optional',
};
