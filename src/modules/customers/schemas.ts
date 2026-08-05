import { z } from 'zod';
import { MAX_LIMIT } from '@/lib/query/limits';
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

const addressFields = {
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
};

export const addressPartsSchema = z
  .object(addressFields)
  .superRefine(addressRules)
  // The +4 add-on is US-only, whatever the client sent.
  .transform((a) => (a.country === 'PK' ? { ...a, zipPlus4: undefined } : a));

/*
 * Shipping. `sameAsBilling` is the normal case, and while it holds nothing else is required or
 * even read — the invoice falls back to the billing party rather than to a stale copy. Only when
 * it is switched off does the address have to stand on its own, so the same rules are applied
 * conditionally rather than through the stricter schema above.
 */
const shippingAddressFields = {
  ...addressFields,
  line1: optionalText(FIELD_MAX),
};

export const shippingSchema = z
  .object({
    sameAsBilling: z.boolean().default(true),
    name: optionalText(FIELD_MAX),
    phone: optionalText(FIELD_MAX),
    addressParts: z.object(shippingAddressFields).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.sameAsBilling) return;
    if (!v.name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['name'],
        message: 'A shipping name is required',
      });
    }
    const a = v.addressParts;
    if (!a?.line1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['addressParts', 'line1'],
        message: 'A street address is required',
      });
    }
    if (a) {
      // Reuse the billing rules, re-pathed under addressParts so the right box lights up.
      addressRules(a, {
        ...ctx,
        addIssue: (issue) =>
          ctx.addIssue({ ...issue, path: ['addressParts', ...(issue.path ?? [])] }),
      } as z.RefinementCtx);
    }
  })
  .transform((v) =>
    v.sameAsBilling
      ? { sameAsBilling: true as const, name: undefined, phone: undefined, addressParts: undefined }
      : v,
  );

/** Product ids this customer buys — 24-char ObjectIds, deduped so a repeat pick is harmless. */
const productIdsField = z
  .array(z.string().regex(/^[a-f\d]{24}$/i, 'That is not a valid product'))
  .max(500, 'That is too many products')
  .optional()
  .transform((v) => (v ? Array.from(new Set(v)) : v));

/**
 * Per-product discounts negotiated with this customer. Each entry overrides that product's own
 * standing discount when a line is added to an invoice. Sent whole: the list replaces whatever
 * was stored, so removing an entry is how a customer reverts to the catalogue discount.
 */
const productDiscountsField = z
  .array(
    z.object({
      product: z.string().regex(/^[a-f\d]{24}$/i, 'That is not a valid product'),
      discountPercent: z
        .number({ invalid_type_error: 'Enter a number' })
        .min(0, 'Discount cannot be negative')
        .max(100, 'Discount cannot exceed 100%'),
    }),
  )
  .max(500, 'That is too many products')
  .optional();

/** A certificate file kept inline as a data URL. See the customer model for why. */
const resellerCertificateField = z
  .object({
    data: z.string().min(1),
    name: z.string().max(255).optional(),
    contentType: z.string().max(120).optional(),
    size: z.number().nonnegative().optional(),
  })
  .nullable()
  .optional();

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
  shipping: shippingSchema.optional(),
  products: productIdsField,
  productDiscounts: productDiscountsField,
  notes: optionalText(NOTES_MAX),
  reseller: z.boolean().optional(),
  resellerCertificate: resellerCertificateField,
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
  products: productIdsField,
  notes: z.string().trim().max(NOTES_MAX, 'That note is too long'),
  reseller: z.boolean(),
  // '' = no default type.
  invoiceType: z.union([z.literal(''), z.nativeEnum(InvoiceType)]),

  // Shipping, flat like the rest of the form. Checked only when shipSameAsBilling is off.
  shipSameAsBilling: z.boolean(),
  shipName: z.string().trim().max(FIELD_MAX, 'That value is too long'),
  shipPhone: z.string().trim().max(FIELD_MAX, 'That value is too long'),
  shipCountry: z.enum(['US', 'PK']),
  shipLine1: z.string().trim().max(FIELD_MAX, 'That value is too long'),
  shipLine2: z.string().trim().max(FIELD_MAX, 'That value is too long'),
  shipCity: z.string().trim().max(FIELD_MAX, 'That value is too long'),
  shipState: z.string().trim(),
  shipZip: z.string().trim(),
  shipZipPlus4: z
    .string()
    .trim()
    .refine((v) => !v || /^\d{4}$/.test(v), 'The +4 add-on is 4 digits'),
});

/** Billing rules always; shipping rules only once it is not a copy of billing. */
export const customerFormSchemaChecked = customerFormSchema
  .superRefine(addressRules)
  .superRefine((f, ctx) => {
    if (f.shipSameAsBilling) return;
    if (!f.shipName.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['shipName'],
        message: 'A shipping name is required',
      });
    }
    if (!f.shipLine1.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['shipLine1'],
        message: 'A street address is required',
      });
    }
    // Same city/state/zip rules as billing, re-pathed onto the ship* fields.
    addressRules({ country: f.shipCountry, city: f.shipCity, state: f.shipState, zip: f.shipZip }, {
      ...ctx,
      addIssue: (issue) => {
        const key = String(issue.path?.[0] ?? '');
        const mapped = `ship${key.charAt(0).toUpperCase()}${key.slice(1)}`;
        ctx.addIssue({ ...issue, path: [mapped] });
      },
    } as z.RefinementCtx);
  });

export const listCustomerSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(MAX_LIMIT).optional(),
  search: z.string().optional(),
});

export const deleteCustomerSchema = z.object({
  reason: z.string().min(1, 'A reason is required to delete').optional(),
});

export type CustomerCreateInput = z.infer<typeof customerCreateSchema>;
export type CustomerUpdateInput = z.infer<typeof customerUpdateSchema>;
export type CustomerFormInput = z.infer<typeof customerFormSchema>;
export type ListCustomerInput = z.infer<typeof listCustomerSchema>;
