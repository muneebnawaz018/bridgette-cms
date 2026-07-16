import { z } from 'zod';
import { InvoiceType, Currency, PaymentMethod } from './enums';

const party = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
});

const item = z.object({
  description: z.string().min(1),
  quantity: z.number().nonnegative(),
  unitPrice: z.number().nonnegative(),
  taxable: z.boolean().optional(),
  discount: z.number().nonnegative().optional(),
});

export const createInvoiceSchema = z.object({
  type: z.nativeEnum(InvoiceType),
  currency: z.nativeEnum(Currency).optional(),
  billTo: party,
  shipTo: party.optional(),
  items: z.array(item).min(1, 'At least one line item is required'),
  shippingHandlingTariff: z.number().nonnegative().optional(),
  invoiceDiscount: z.number().nonnegative().optional(),
  taxRate: z.number().nonnegative().optional(),
  applyTax: z.boolean().optional(),
  paymentMethod: z.nativeEnum(PaymentMethod).optional(),
  dueDate: z.string().datetime().optional(),
  terms: z.string().optional(),
  notes: z.string().optional(),
  reminderThresholdHours: z.number().positive().optional(),
  asDraft: z.boolean().optional(), // save as Draft instead of finalizing to Pending
  // type-specific
  cashReceived: z.number().nonnegative().optional(),
  advancePayment: z.number().nonnegative().optional(),
});

export const updateInvoiceSchema = createInvoiceSchema.partial().extend({
  type: z.nativeEnum(InvoiceType).optional(),
});

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
