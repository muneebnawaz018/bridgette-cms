import { PaymentMethod } from '@/modules/invoicing/enums';

/**
 * Per-method payment details.
 *
 * Each method gathers different "related information" — a bank transfer has a reference and a
 * sender, a card has its last four digits, a cheque has a number. Rather than a column per
 * possibility, every method declares its own field list here; the values are stored together on
 * `payment.details` (keyed by `key`), the record dialog renders one input per field, and the
 * invoice view reads them back by the same key. Shared (no server-only) so the dialog and the
 * server validation cannot drift.
 */

export interface MethodField {
  key: string;
  label: string;
  required?: boolean;
  /**
   * Input variety: `numeric` shows a number keypad and rejects letters while keeping leading
   * zeros (unlike type=number, which would drop a card's "0042"). `maxLength` bounds it — e.g.
   * a card's last four. Alphanumeric references (transaction IDs, cashtags) stay plain text.
   */
  inputMode?: 'numeric';
  maxLength?: number;
}

export const PAYMENT_METHOD_FIELDS: Record<PaymentMethod, MethodField[]> = {
  [PaymentMethod.Cash]: [{ key: 'receivedBy', label: 'Received by' }],
  [PaymentMethod.Zelle]: [
    // Zelle confirmations are alphanumeric — plain text, not digits-only.
    { key: 'reference', label: 'Confirmation number', required: true },
    { key: 'account', label: 'Sender name / email / phone' },
  ],
  [PaymentMethod.BankTransfer]: [
    { key: 'reference', label: 'Transaction reference', required: true },
    { key: 'account', label: 'Sender account / name' },
    { key: 'bank', label: 'Bank name' },
  ],
  [PaymentMethod.PayPal]: [
    { key: 'reference', label: 'Transaction ID', required: true },
    { key: 'account', label: 'PayPal email / handle' },
  ],
  [PaymentMethod.CashApp]: [
    { key: 'reference', label: 'Transaction ID', required: true },
    { key: 'account', label: '$Cashtag' },
  ],
  [PaymentMethod.Card]: [
    {
      key: 'cardLast4',
      label: 'Card last 4 digits',
      required: true,
      inputMode: 'numeric',
      maxLength: 4,
    },
    { key: 'authCode', label: 'Authorization code' },
  ],
  [PaymentMethod.Cheque]: [
    { key: 'reference', label: 'Cheque number', required: true, inputMode: 'numeric' },
    { key: 'bank', label: 'Bank name' },
  ],
  [PaymentMethod.Other]: [{ key: 'reference', label: 'Reference' }],
};

/** Human label for a stored details key, for the invoice view. Falls back to the raw key. */
export function paymentFieldLabel(method: PaymentMethod | string, key: string): string {
  const fields = PAYMENT_METHOD_FIELDS[method as PaymentMethod] ?? [];
  return fields.find((f) => f.key === key)?.label ?? key;
}

/**
 * Whether a payment by this method must carry a proof/screenshot. Cash is exempt — there is no
 * digital receipt to attach — every electronic method requires one.
 */
export function proofRequired(method: PaymentMethod): boolean {
  return method !== PaymentMethod.Cash;
}

/** Proof upload is compressed to a JPEG client-side; this bounds the stored payload server-side. */
export const MAX_PROOF_BYTES = 3 * 1024 * 1024;

/** Image types accepted for a proof upload. Kept to images — a "screenshot or proof". */
export const PROOF_ACCEPT = 'image/png,image/jpeg,image/webp,image/heic';
