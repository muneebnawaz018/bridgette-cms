import { z } from 'zod';
import { isValidPhoneNumber } from 'libphonenumber-js';
import { Role } from './rbac';
import { UserStatus } from './enums';

const password = z.string().min(8, 'Password must be at least 8 characters');

/** A profile photo as a small base64 data URL, or null to clear it. Kept well under ~500KB
 *  of binary — the client downsizes to ~256px before upload (see lib/image/avatar). */
const avatarUrl = z
  .string()
  .regex(/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/]+=*$/, 'Unsupported image format')
  .max(700_000, 'Image is too large — pick a smaller photo')
  .nullable();

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  /** Turnstile response, only demanded once an account has failed repeatedly. */
  turnstileToken: z.string().max(2048).optional(),
});

/** Optional free-text profile fields, shared by create + update. Trimmed and length-capped. */
const jobTitle = z.string().trim().max(80).optional();
const notes = z.string().trim().max(500).optional();

/**
 * Contact number in E.164 — `+` then country code then the national number, digits only.
 * The UI composes this from its country picker; this file is client-safe, so the browser and
 * the server validate against exactly the same rule.
 *
 * The regex is only a shape check: it accepts 8-15 digits, which is E.164's global bound and
 * says nothing about the country. `+9230275` passed it happily despite being an incomplete
 * Pakistani number, so half-typed numbers saved. `isValidPhoneNumber` applies the actual
 * per-country rules — length, valid prefixes, mobile vs fixed-line — which cannot be
 * expressed as one pattern because they differ per country and vary within a country.
 *
 * Deliberately not derived from the `groups` data in lib/format/countries: that is display
 * spacing, set for only a handful of countries, and would silently break validation the day
 * someone adjusted how a number is rendered.
 */
export const E164 = /^\+[1-9]\d{7,14}$/;
const PHONE_INCOMPLETE = 'Enter a complete number for the selected country';

const phone = z
  .string()
  .trim()
  .min(1, 'A contact number is required')
  .regex(E164, 'Enter a valid number including the country code')
  .refine(isValidPhoneNumber, PHONE_INCOMPLETE);

export const createUserSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  email: z.string().trim().min(1, 'Email is required').email('Enter a valid email address'),
  role: z.nativeEnum(Role, {
    required_error: 'A role is required',
    invalid_type_error: 'A role is required',
  }),
  phone,
  jobTitle,
  notes,
});

// Messages spelled out because these now render under the inputs on /set-password, where
// Zod's defaults ("String must contain at least 4 character(s)") would be the visible text.
export const setPasswordSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  code: z.string().min(4, 'Enter the code from your email'),
  password,
});

export const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

export const resetPasswordSchema = z.object({
  userId: z.string().min(1),
  code: z.string().min(1),
  password,
});

export const listUsersSchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional(),
  search: z.string().optional(),
  role: z.nativeEnum(Role).optional(),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120).optional(),
  // Optional so avatar-only PATCHes still work, but never blankable — contact is required.
  phone: phone.optional(),
  jobTitle,
  notes,
  role: z.nativeEnum(Role).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  avatarUrl: avatarUrl.optional(),
});

/** The subset the edit form actually submits — lets the client validate before sending. */
export const editUserFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  phone,
  jobTitle,
  notes,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: password,
});

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(120).optional(),
    // The same E.164 rule user management enforces, so a number saved from the profile page
    // and one saved by an admin are the same shape. Empty clears it: unlike a team member
    // created by an admin, your own profile is not blocked on having a contact number.
    phone: z
      .union([
        z.literal(''),
        z
          .string()
          .trim()
          .regex(E164, 'Enter a valid number including the country code')
          .refine(isValidPhoneNumber, PHONE_INCOMPLETE),
      ])
      .optional(),
    avatarUrl: avatarUrl.optional(),
  })
  .refine((v) => v.name !== undefined || v.phone !== undefined || v.avatarUrl !== undefined, {
    message: 'Nothing to update',
  });

/** Which sessions to revoke after a password change (or from the sessions card). */
export const revokeSessionsSchema = z.object({
  scope: z.enum(['others', 'all']),
});

/** Step 1 of changing your email: prove identity + choose a new address. */
export const requestEmailChangeSchema = z.object({
  newEmail: z.string().email(),
  currentPassword: z.string().min(1),
});

/** Step 2: confirm the code sent to the new address. */
export const confirmEmailChangeSchema = z.object({
  code: z.string().min(4),
});

export type ListUsersInput = z.infer<typeof listUsersSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type RevokeSessionsInput = z.infer<typeof revokeSessionsSchema>;
export type RequestEmailChangeInput = z.infer<typeof requestEmailChangeSchema>;
export type ConfirmEmailChangeInput = z.infer<typeof confirmEmailChangeSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
