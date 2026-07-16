import { z } from 'zod';
import { Role } from './rbac';
import { UserStatus } from './enums';

const password = z.string().min(8, 'Password must be at least 8 characters');

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
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: password,
});

export const updateProfileSchema = z
  .object({
    name: z.string().min(1, 'Name is required').optional(),
    phone: z.string().trim().max(40).optional(),
  })
  .refine((v) => v.name !== undefined || v.phone !== undefined, {
    message: 'Nothing to update',
  });

/** Which sessions to revoke after a password change (or from the sessions card). */
export const revokeSessionsSchema = z.object({
  scope: z.enum(['others', 'all']),
});

export type ListUsersInput = z.infer<typeof listUsersSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type RevokeSessionsInput = z.infer<typeof revokeSessionsSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
