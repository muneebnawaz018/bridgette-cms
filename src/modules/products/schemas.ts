import { z } from 'zod';

/**
 * A product is a catalogue item admins maintain: a name, a unique SKU and a default rate. The
 * rate a given customer actually pays can be negotiated lower/higher — those overrides live in
 * a separate ProductRate record (see rateSchema), so the catalogue and its per-customer pricing
 * stay decoupled. All money is USD (the system is USD-only).
 */

const NAME_MAX = 160;
const SKU_MAX = 64;
const UNIT_MAX = 40;
const DESC_MAX = 2000;
const NOTES_MAX = 2000;
const MAX_RATE = 1_000_000_000;

const nameField = z
  .string()
  .trim()
  .min(1, 'A product name is required')
  .max(NAME_MAX, 'That name is too long');

const rateField = z
  .number({ invalid_type_error: 'Enter a rate' })
  .nonnegative('Rate cannot be negative')
  .max(MAX_RATE, 'That rate is too large');

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, 'That value is too long')
    .optional()
    .or(z.literal(''))
    .transform((v) => (v ? v : undefined));

/** A Mongo id, or '' / undefined meaning "no fabric linked". */
const optionalId = z
  .string()
  .trim()
  .optional()
  .or(z.literal(''))
  .transform((v) => (v ? v : undefined));

export const productCreateSchema = z.object({
  name: nameField,
  sku: optionalText(SKU_MAX),
  defaultRate: rateField,
  unit: optionalText(UNIT_MAX),
  fabric: optionalId,
  description: optionalText(DESC_MAX),
  notes: optionalText(NOTES_MAX),
});

export const productUpdateSchema = productCreateSchema.partial();

/** Form-shaped (client) — no transforms so inputs stay strings; rate is a string in the input. */
export const productFormSchema = z.object({
  name: nameField,
  sku: z.string().trim().max(SKU_MAX, 'That SKU is too long'),
  defaultRate: rateField,
  unit: z.string().trim().max(UNIT_MAX, 'That value is too long'),
  // '' = no fabric linked.
  fabric: z.string().trim(),
  description: z.string().trim().max(DESC_MAX, 'That value is too long'),
  notes: z.string().trim().max(NOTES_MAX, 'That note is too long'),
});

// --- Fabrics ---

const FABRIC_TYPE_MAX = 80;
const MAX_GSM = 5000;

const fabricNameField = z
  .string()
  .trim()
  .min(1, 'A fabric name is required')
  .max(NAME_MAX, 'That name is too long');

/** GSM is optional; a blank input arrives as NaN from the form, which is treated as "not set". */
const gsmField = z
  .number()
  .nonnegative('GSM cannot be negative')
  .max(MAX_GSM, 'That GSM is too large')
  .optional();

export const fabricCreateSchema = z.object({
  name: fabricNameField,
  gsm: z.preprocess((v) => (v === '' || v == null || Number.isNaN(v) ? undefined : v), gsmField),
  type: optionalText(FABRIC_TYPE_MAX),
  notes: optionalText(NOTES_MAX),
});

export const fabricUpdateSchema = fabricCreateSchema.partial();

/** Form-shaped (client) — GSM stays a string in the input. */
export const fabricFormSchema = z.object({
  name: fabricNameField,
  gsm: z.preprocess((v) => (v === '' || v == null || Number.isNaN(v) ? undefined : v), gsmField),
  type: z.string().trim().max(FABRIC_TYPE_MAX, 'That value is too long'),
  notes: z.string().trim().max(NOTES_MAX, 'That note is too long'),
});

export const listFabricSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  search: z.string().optional(),
});

export const deleteFabricSchema = z.object({
  reason: z.string().min(1, 'A reason is required to delete').optional(),
});

export const listProductSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  search: z.string().optional(),
});

/** Set (upsert) or clear a per-customer negotiated rate. */
export const setRateSchema = z.object({
  customerId: z.string().min(1, 'A customer is required'),
  rate: rateField,
});

/** Customer-side variant: pick the product instead. */
export const setCustomerRateSchema = z.object({
  productId: z.string().min(1, 'A product is required'),
  rate: rateField,
});

export const deleteProductSchema = z.object({
  reason: z.string().min(1, 'A reason is required to delete').optional(),
});

export type FabricCreateInput = z.infer<typeof fabricCreateSchema>;
export type FabricUpdateInput = z.infer<typeof fabricUpdateSchema>;
export type FabricFormInput = z.infer<typeof fabricFormSchema>;
export type ListFabricInput = z.infer<typeof listFabricSchema>;

export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
export type ProductFormInput = z.infer<typeof productFormSchema>;
export type ListProductInput = z.infer<typeof listProductSchema>;
export type SetRateInput = z.infer<typeof setRateSchema>;
export type SetCustomerRateInput = z.infer<typeof setCustomerRateSchema>;
