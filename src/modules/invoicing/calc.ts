import { round2, sum, multiply, nonNegative } from '@/lib/money/money';
import { InvoiceType, TAX_POLICY } from './enums';

export interface CalcLineInput {
  quantity: number;
  unitPrice: number;
  taxable?: boolean; // defaults true; ignored for types that never tax
  discount?: number; // fixed amount off this line
}

export interface CalcInput {
  type: InvoiceType;
  items: CalcLineInput[];
  shippingHandlingTariff?: number;
  invoiceDiscount?: number; // fixed amount off the whole invoice
  taxRate?: number; // e.g. 0.0875 — applied per TAX_POLICY
  applyTax?: boolean; // for PK (optional tax); ignored for Tax(always)/Cash(never)
}

export interface CalcResult {
  lineTotals: number[];
  subtotal: number;
  shippingHandlingTariff: number;
  discount: number;
  totalBeforeTax: number;
  taxRate: number;
  taxAmount: number;
  grandTotal: number;
}

/** Whether tax applies for this invoice, honoring the per-type policy. */
export function taxApplies(type: InvoiceType, applyTax: boolean | undefined): boolean {
  const policy = TAX_POLICY[type];
  if (policy === 'always') return true;
  if (policy === 'never') return false;
  return Boolean(applyTax); // optional (PK)
}

/**
 * Server-side authority for all invoice money math. Never trust client totals.
 * taxableAmount = taxable subtotal + taxable charges - discount; tax = taxable * rate.
 */
export function calcInvoice(input: CalcInput): CalcResult {
  const shipping = round2(input.shippingHandlingTariff ?? 0);
  const invoiceDiscount = round2(input.invoiceDiscount ?? 0);

  const lineTotals = input.items.map((it) =>
    nonNegative(multiply(it.quantity, it.unitPrice) - round2(it.discount ?? 0)),
  );
  const subtotal = sum(lineTotals);

  const applies = taxApplies(input.type, input.applyTax);
  const rate = applies ? (input.taxRate ?? 0) : 0;

  // Taxable base: taxable line totals + shipping/handling/tariff, less invoice discount.
  const taxableLineTotal = sum(
    input.items.map((it, i) => (it.taxable === false ? 0 : lineTotals[i])),
  );
  const taxableBase = nonNegative(taxableLineTotal + shipping - invoiceDiscount);
  const taxAmount = applies ? round2(taxableBase * rate) : 0;

  const totalBeforeTax = nonNegative(subtotal + shipping - invoiceDiscount);
  const grandTotal = round2(totalBeforeTax + taxAmount);

  return {
    lineTotals,
    subtotal,
    shippingHandlingTariff: shipping,
    discount: invoiceDiscount,
    totalBeforeTax,
    taxRate: rate,
    taxAmount,
    grandTotal,
  };
}
