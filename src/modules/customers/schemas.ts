import { z } from 'zod';
import { InvoiceType } from '@/modules/invoicing/enums';

/**
 * A customer is a reusable billing party admins maintain once, so every role can pick it on an
 * invoice instead of retyping the same name/email each time. Only `name` is required; the rest
 * mirror the invoice `party` shape (email/phone/address) plus a company field, so a chosen
 * customer can populate `billTo` directly.
 */

const NAME_MAX = 160;
const FIELD_MAX = 200;
const ADDRESS_MAX = 500;
const NOTES_MAX = 2000;

const nameField = z
  .string()
  .trim()
  .min(1, 'A customer name is required')
  .max(NAME_MAX, 'That name is too long');

/** Optional free-text: an empty string is normalised to undefined so blanks never store "". */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, 'That value is too long')
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined));

/** Optional email: blank is allowed, but a typo is still caught. */
const optionalEmail = z
  .union([z.literal(''), z.string().trim().email('Enter a valid email address')])
  .optional()
  .transform((v) => (v ? v : undefined));

export const customerCreateSchema = z.object({
  name: nameField,
  email: optionalEmail,
  phone: optionalText(FIELD_MAX),
  company: optionalText(FIELD_MAX),
  address: optionalText(ADDRESS_MAX),
  notes: optionalText(NOTES_MAX),
  reseller: z.boolean().optional(),
  invoiceType: z.nativeEnum(InvoiceType).optional(),
});

export const customerUpdateSchema = customerCreateSchema.partial().extend({
  name: nameField.optional(),
});

/** Form-shaped schema (client validation) — same fields, no transforms so inputs stay strings. */
export const customerFormSchema = z.object({
  name: nameField,
  email: z.union([z.literal(''), z.string().trim().email('Enter a valid email address')]),
  phone: z.string().trim().max(FIELD_MAX, 'That value is too long'),
  company: z.string().trim().max(FIELD_MAX, 'That value is too long'),
  address: z.string().trim().max(ADDRESS_MAX, 'That value is too long'),
  notes: z.string().trim().max(NOTES_MAX, 'That note is too long'),
  reseller: z.boolean(),
  // '' = no default type.
  invoiceType: z.union([z.literal(''), z.nativeEnum(InvoiceType)]),
});

export const listCustomerSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  search: z.string().optional(),
});

export const deleteCustomerSchema = z.object({
  reason: z.string().min(1, 'A reason is required to delete').optional(),
});

export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;
export type CustomerFormInput = z.infer<typeof customerFormSchema>;
export type ListCustomerInput = z.infer<typeof listCustomerSchema>;
