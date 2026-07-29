import { z } from 'zod';
import { InvoiceType } from '@/modules/invoicing/enums';
import { CustomerType } from './enums';
import { isStateCode } from './address';

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

/**
 * Structured US address. Everything is optional so a half-known address still saves; what IS
 * given is checked — a state must be a real USPS code, a ZIP exactly 5 digits, the add-on 4.
 */
export const addressPartsSchema = z.object({
  line1: optionalText(FIELD_MAX),
  line2: optionalText(FIELD_MAX),
  city: optionalText(FIELD_MAX),
  state: optionalText(2).refine((v) => !v || isStateCode(v), 'Enter a US state code, e.g. CA'),
  zip: optionalText(5).refine((v) => !v || /^\d{5}$/.test(v), 'A ZIP code is 5 digits'),
  zipPlus4: optionalText(4).refine((v) => !v || /^\d{4}$/.test(v), 'The +4 add-on is 4 digits'),
});

export const customerCreateSchema = z.object({
  // Full name stays accepted for callers (and older clients) that only have one; when first/last
  // are sent the service derives it from them.
  name: nameField.optional(),
  firstName: optionalText(FIELD_MAX),
  lastName: optionalText(FIELD_MAX),
  email: optionalEmail,
  phone: optionalText(FIELD_MAX),
  company: optionalText(FIELD_MAX),
  customerType: z.nativeEnum(CustomerType).optional(),
  address: optionalText(ADDRESS_MAX),
  addressParts: addressPartsSchema.optional(),
  notes: optionalText(NOTES_MAX),
  reseller: z.boolean().optional(),
  invoiceType: z.nativeEnum(InvoiceType).optional(),
});
// A create needs *some* name: either the full one or a first name to derive it from.
export const customerCreateSchemaChecked = customerCreateSchema.refine(
  (v) => Boolean(v.name?.trim() || v.firstName?.trim()),
  { message: 'A customer name is required', path: ['firstName'] },
);

export const customerUpdateSchema = customerCreateSchema.partial();

/** Form-shaped schema (client validation) — same fields, no transforms so inputs stay strings. */
export const customerFormSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, 'A first name is required')
    .max(FIELD_MAX, 'That value is too long'),
  lastName: z.string().trim().max(FIELD_MAX, 'That value is too long'),
  email: z.union([z.literal(''), z.string().trim().email('Enter a valid email address')]),
  phone: z.string().trim().max(FIELD_MAX, 'That value is too long'),
  company: z.string().trim().max(FIELD_MAX, 'That value is too long'),
  // '' = no type set.
  customerType: z.union([z.literal(''), z.nativeEnum(CustomerType)]),
  line1: z.string().trim().max(FIELD_MAX, 'That value is too long'),
  line2: z.string().trim().max(FIELD_MAX, 'That value is too long'),
  city: z.string().trim().max(FIELD_MAX, 'That value is too long'),
  state: z
    .string()
    .trim()
    .refine((v) => !v || isStateCode(v), 'Enter a US state code, e.g. CA'),
  zip: z
    .string()
    .trim()
    .refine((v) => !v || /^\d{5}$/.test(v), 'A ZIP code is 5 digits'),
  zipPlus4: z
    .string()
    .trim()
    .refine((v) => !v || /^\d{4}$/.test(v), 'The +4 add-on is 4 digits'),
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
