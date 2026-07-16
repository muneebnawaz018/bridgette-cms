import { z } from 'zod';
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
});

export const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  role: z.nativeEnum(Role),
  phone: z.string().optional(),
});

export const setPasswordSchema = z.object({
  email: z.string().email(),
  code: z.string().min(4),
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
  name: z.string().min(1).optional(),
  phone: z.string().optional(),
  role: z.nativeEnum(Role).optional(),
  status: z.nativeEnum(UserStatus).optional(),
  avatarUrl: avatarUrl.optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: password,
});

export const updateProfileSchema = z
  .object({
    name: z.string().min(1, 'Name is required').optional(),
    phone: z.string().trim().max(40).optional(),
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
