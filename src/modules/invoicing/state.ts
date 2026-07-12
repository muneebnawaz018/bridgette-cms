import { InvoiceState } from './enums';

/**
 * Compute the payment-driven state from the ledger + due date.
 * Draft is handled separately (explicit save-as-draft), so it's never returned here.
 */
export function computePaymentState(input: {
  amountPaid: number;
  grandTotal: number;
  dueDate?: Date | null;
  now?: Date;
}): InvoiceState {
  const now = input.now ?? new Date();
  if (input.grandTotal > 0 && input.amountPaid >= input.grandTotal) return InvoiceState.Paid;
  if (input.amountPaid > 0) return InvoiceState.PartiallyPaid;
  // Unpaid.
  if (input.dueDate && input.dueDate.getTime() < now.getTime()) return InvoiceState.Overdue;
  return InvoiceState.Pending;
}
