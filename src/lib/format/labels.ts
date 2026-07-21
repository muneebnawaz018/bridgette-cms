import { PaymentMethod } from '@/modules/invoicing/enums';

/**
 * Human-readable names for the values stored in the database.
 *
 * `ROLE_LABEL` had been copy-pasted into six files: the dashboard, settings, profile and user
 * pages plus both user dialogs. Renaming a role meant finding all six, so one of them was
 * always going to be missed.
 */

/** Roles as people should read them. Keys are the `Role` enum values. */
export const ROLE_LABEL: Record<string, string> = {
  superAdmin: 'Super Admin',
  admin: 'Administrator',
  accountant: 'Accountant / Manager',
  sales: 'Sales',
  readOnly: 'Read only',
};

/** Payment methods, which are otherwise shown as raw camelCase enum values. */
export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  [PaymentMethod.Cash]: 'Cash',
  [PaymentMethod.Zelle]: 'Zelle',
  [PaymentMethod.BankTransfer]: 'Bank transfer',
  [PaymentMethod.PayPal]: 'PayPal',
  [PaymentMethod.CashApp]: 'Cash App',
  [PaymentMethod.Card]: 'Card',
  [PaymentMethod.Cheque]: 'Cheque',
  [PaymentMethod.Other]: 'Other',
};

export const paymentMethodLabel = (method: string | undefined): string =>
  (method && PAYMENT_METHOD_LABEL[method]) || method || '—';

/** Invoice types as people should read them. Keys are the `InvoiceType` enum values. */
export const INVOICE_TYPE_LABEL: Record<string, string> = {
  tax: 'US Tax',
  cash: 'US Cash',
  pk: 'Pakistan',
};

export const invoiceTypeLabel = (type: string | undefined): string =>
  (type && INVOICE_TYPE_LABEL[type]) || type || '—';
