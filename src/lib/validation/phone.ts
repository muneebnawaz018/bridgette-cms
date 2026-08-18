import { z } from 'zod';
import { isValidPhoneNumber } from 'libphonenumber-js';

/**
 * The one phone rule, for every form that collects a number — users, profiles, customers, and
 * the customer's own intake form. They all feed the same `PhoneField`, so they all store E.164
 * and are all held to the same standard: a number saved by an admin and one a customer typed in
 * are the same shape, and neither can be half a number.
 *
 * Client-safe on purpose, so the browser and the server validate against exactly the same rule.
 *
 * The regex is only a shape check: it accepts 8-15 digits, which is E.164's global bound and
 * says nothing about the country. `+9230275` passed it happily despite being an incomplete
 * Pakistani number, so half-typed numbers saved. `isValidPhoneNumber` applies the actual
 * per-country rules — length, valid prefixes, mobile vs fixed-line — which cannot be expressed
 * as one pattern because they differ per country and vary within a country.
 *
 * Deliberately not derived from the `groups` data in lib/format/countries: that is display
 * spacing, set for only a handful of countries, and would silently break validation the day
 * someone adjusted how a number is rendered.
 */
export const E164 = /^\+[1-9]\d{7,14}$/;

export const PHONE_INCOMPLETE = 'Enter a complete number for the selected country';
const PHONE_SHAPE = 'Enter a valid number including the country code';

/** A complete number, required. */
export const phoneField = (missing = 'A contact number is required') =>
  z
    .string()
    .trim()
    .min(1, missing)
    .regex(E164, PHONE_SHAPE)
    .refine(isValidPhoneNumber, PHONE_INCOMPLETE);

/** The same rule where a blank is allowed to mean "no number on file". */
export const optionalPhoneField = () =>
  z.union([
    z.literal(''),
    z.string().trim().regex(E164, PHONE_SHAPE).refine(isValidPhoneNumber, PHONE_INCOMPLETE),
  ]);
