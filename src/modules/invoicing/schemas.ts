import { z } from 'zod';
import { InvoiceType, InvoiceState, Currency, PaymentMethod } from './enums';

const party = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
});

// Sane ceilings so a fat-fingered amount (e.g. a pasted 1e21) can't book an invoice whose
// total dwarfs the whole business and skews every dashboard aggregate. Generous: a billion
// per unit and a million units still clear any real line.
const MAX_UNIT_PRICE = 1_000_000_000;
const MAX_QUANTITY = 1_000_000;
const MAX_AMOUNT = 1_000_000_000;

const item = z.object({
  description: z.string().min(1),
  quantity: z.number().nonnegative().max(MAX_QUANTITY, 'Quantity is too large'),
  unitPrice: z.number().nonnegative().max(MAX_UNIT_PRICE, 'Unit price is too large'),
  taxable: z.boolean().optional(),
  discount: z.number().nonnegative().max(MAX_AMOUNT, 'Discount is too large').optional(),
});

export const createInvoiceSchema = z.object({
  type: z.nativeEnum(InvoiceType),
  currency: z.nativeEnum(Currency).optional(),
  billTo: party,
  shipTo: party.optional(),
  items: z.array(item).min(1, 'At least one line item is required'),
  shippingHandlingTariff: z.number().nonnegative().max(MAX_AMOUNT, 'Amount is too large').optional(),
  invoiceDiscount: z.number().nonnegative().max(MAX_AMOUNT, 'Discount is too large').optional(),
  // A fraction, not a percentage (0.0875 = 8.75%). Capped at 1 so a stray 50 can't book a
  // 5000% tax; the form already limits its percentage input to 100.
  taxRate: z.number().nonnegative().max(1, 'Tax rate cannot exceed 100%').optional(),
  applyTax: z.boolean().optional(),
  paymentMethod: z.nativeEnum(PaymentMethod).optional(),
  issueDate: z.string().datetime().optional(),
  dueDate: z.string().datetime().optional(),
  terms: z.string().optional(),
  notes: z.string().optional(),
  reminderThresholdMinutes: z.number().int().positive().optional(),
  asDraft: z.boolean().optional(), // save as Draft instead of finalizing to Pending
  // type-specific
  cashReceived: z.number().nonnegative().max(MAX_AMOUNT, 'Amount is too large').optional(),
  advancePayment: z.number().nonnegative().max(MAX_AMOUNT, 'Amount is too large').optional(),
});

export const updateInvoiceSchema = createInvoiceSchema.partial().extend({
  type: z.nativeEnum(InvoiceType).optional(),
  // null clears an existing reminder. Without it there would be no way to turn one off:
  // omitting the key means "leave unchanged", which is a different intent.
  reminderThresholdMinutes: z.number().int().positive().nullable().optional(),
});

/**
 * What the New invoice dialog validates before it will submit.
 *
 * It covers the same ground as `createInvoiceSchema` but is shaped like the form rather than
 * like the API body: flat `billToName` / `billToEmail` instead of a nested party, a percentage
 * tax rate instead of a fraction. Sharing this file with the browser (nothing here imports
 * `server-only`) is what stops the two sets of rules from drifting.
 */
export const invoiceFormSchema = z.object({
  type: z.nativeEnum(InvoiceType, {
    required_error: 'Pick an invoice type',
    invalid_type_error: 'Pick an invoice type',
  }),
  billToName: z
    .string()
    .trim()
    .min(1, 'A customer name is required')
    .max(160, 'That name is too long'),
  // Optional, but a typo should still be caught rather than silently saved.
  billToEmail: z.union([z.literal(''), z.string().trim().email('Enter a valid email address')]),
  items: z
    .array(
      z.object({
        description: z.string().trim().min(1, 'Describe this line'),
        quantity: z
          .number({ invalid_type_error: 'Enter a number' })
          .positive('Quantity must be more than zero')
          .max(MAX_QUANTITY, 'Quantity is too large'),
        unitPrice: z
          .number({ invalid_type_error: 'Enter a number' })
          .nonnegative('Price cannot be negative')
          .max(MAX_UNIT_PRICE, 'Price is too large'),
      }),
    )
    .min(1, 'Add at least one line item'),
  taxRate: z
    .number({ invalid_type_error: 'Enter a number' })
    .nonnegative('Tax rate cannot be negative')
    .max(100, 'Tax rate cannot be more than 100%')
    .optional(),
  notes: z.string().max(2000, 'That note is too long').optional(),
});

export type InvoiceFormInput = z.infer<typeof invoiceFormSchema>;

/** Which slice of invoices to list. Default `active` hides archived + deleted; `all` shows
 *  everything the caller may see. */
export const invoiceViewSchema = z.enum(['active', 'archived', 'deleted', 'all']);

/** A calendar day as the browser's <input type="date"> emits it. */
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a YYYY-MM-DD date')
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'Not a real date');

/** `from`/`to` filter on createdAt and are inclusive of both whole days. */
export const listInvoiceSchema = z
  .object({
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().optional(),
    type: z.nativeEnum(InvoiceType).optional(),
    state: z.nativeEnum(InvoiceState).optional(),
    search: z.string().optional(),
    view: invoiceViewSchema.optional(),
    from: dateOnly.optional(),
    to: dateOnly.optional(),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: 'The start date must be on or before the end date',
    path: ['from'],
  });

export const EXPORT_FORMATS = ['csv', 'xlsx', 'json'] as const;
export const exportFormatSchema = z.enum(EXPORT_FORMATS);

/** Export reuses every list filter, minus pagination, plus the file format. */
export const exportInvoiceSchema = z
  .object({
    format: exportFormatSchema,
    type: z.nativeEnum(InvoiceType).optional(),
    state: z.nativeEnum(InvoiceState).optional(),
    search: z.string().optional(),
    view: invoiceViewSchema.optional(),
    from: dateOnly.optional(),
    to: dateOnly.optional(),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: 'The start date must be on or before the end date',
    path: ['from'],
  });

export const archiveInvoiceSchema = z.object({
  reason: z.string().min(1, 'A reason is required to archive'),
});

export const deleteInvoiceSchema = z.object({
  reason: z.string().min(1, 'A reason is required to delete'),
});

export type InvoiceView = z.infer<typeof invoiceViewSchema>;
export type CreateInvoiceInput = z.infer<typeof createInvoiceSchema>;
export type UpdateInvoiceInput = z.infer<typeof updateInvoiceSchema>;
export type ListInvoiceInput = z.infer<typeof listInvoiceSchema>;
export type ExportFormat = z.infer<typeof exportFormatSchema>;
export type ExportInvoiceInput = z.infer<typeof exportInvoiceSchema>;
