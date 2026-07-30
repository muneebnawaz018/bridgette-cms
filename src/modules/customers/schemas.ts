import { z } from 'zod';
import { InvoiceType } from '@/modules/invoicing/enums';
import { isStateCode } from './address';

/**
 * A customer is a reusable billing party admins maintain once, so every role can pick it on an
 * invoice instead of retyping the same name/email each time. Only `name` is required; the rest
 * mirror the invoice `party` shape (email/phone/address), so a chosen customer can populate
 * `billTo` directly.
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

/**
 * Email is mandatory — invoices and reminders need somewhere to go — and unique across live
 * customers. Lower-cased on the way in, since the uniqueness index is a plain byte comparison
 * and "Bob@x.com" and "bob@x.com" are the same mailbox.
 */
const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'An email is required')
  .email('Enter a valid email address');

/**
 * The address, as the client spec'd it: line1/city/state/zip required, line2 optional. Both
 * countries use the same shape — only the state list differs (US states vs PK provinces), and
 * the +4 add-on is US-only routing, so Pakistan never carries it.
 */
const addressRules = (
  a: { country?: string; city?: string; state?: string; zip?: string },
  ctx: z.RefinementCtx,
) => {
  const isPk = a.country === 'PK';
  if (!a.city) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['city'], message: 'A city is required' });
  }
  if (!a.state) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['state'],
      message: isPk ? 'A province is required' : 'A state is required',
    });
  } else if (!isStateCode(a.state, a.country)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['state'],
      message: isPk ? 'Pick a Pakistani province' : 'Enter a US state code, e.g. CA',
    });
  }
  if (!a.zip || !/^\d{5}$/.test(a.zip)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['zip'],
      message: isPk ? 'A postal code is 5 digits' : 'A ZIP code is 5 digits',
    });
  }
};

export const addressPartsSchema = z
  .object({
    country: z.enum(['US', 'PK']).default('US'),
    line1: z
      .string()
      .trim()
      .min(1, 'A street address is required')
      .max(FIELD_MAX, 'That value is too long'),
    line2: optionalText(FIELD_MAX),
    city: optionalText(FIELD_MAX),
    state: optionalText(2),
    zip: optionalText(5),
    zipPlus4: optionalText(4).refine((v) => !v || /^\d{4}$/.test(v), 'The +4 add-on is 4 digits'),
  })
  .superRefine(addressRules)
  // The +4 add-on is US-only, whatever the client sent.
  .transform((a) => (a.country === 'PK' ? { ...a, zipPlus4: undefined } : a));

export const customerCreateSchema = z.object({
  // Full name stays accepted for callers (and older clients) that only have one; when first/last
  // are sent the service derives it from them.
  name: nameField.optional(),
  firstName: optionalText(FIELD_MAX),
  lastName: optionalText(FIELD_MAX),
  email: emailField,
  phone: optionalText(FIELD_MAX),
  address: optionalText(ADDRESS_MAX),
  addressParts: addressPartsSchema,
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
  email: emailField,
  phone: z.string().trim().max(FIELD_MAX, 'That value is too long'),
  country: z.enum(['US', 'PK']),
  line1: z
    .string()
    .trim()
    .min(1, 'A street address is required')
    .max(FIELD_MAX, 'That value is too long'),
  line2: z.string().trim().max(FIELD_MAX, 'That value is too long'),
  city: z.string().trim().max(FIELD_MAX, 'That value is too long'),
  state: z.string().trim(),
  zip: z.string().trim(),
  zipPlus4: z
    .string()
    .trim()
    .refine((v) => !v || /^\d{4}$/.test(v), 'The +4 add-on is 4 digits'),
  notes: z.string().trim().max(NOTES_MAX, 'That note is too long'),
  reseller: z.boolean(),
  // '' = no default type.
  invoiceType: z.union([z.literal(''), z.nativeEnum(InvoiceType)]),
});
export const customerFormSchemaChecked = customerFormSchema.superRefine(addressRules);

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
