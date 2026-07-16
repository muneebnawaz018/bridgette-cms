// Public API of the auth module.

export * from './rbac';
export { UserStatus, OtpPurpose } from './enums';
export { getSession, requireSession, requirePermission, type SessionUser } from './session';
export {
  login,
  logout,
  refreshSession,
  createUser,
  verifyAndSetPassword,
  forgotPassword,
  resetPassword,
  deactivateUser,
  listUsers,
  getUser,
  updateUser,
  changePassword,
  updateOwnProfile,
} from './services/auth.service';
export {
  listSessions,
  revokeSession,
  revokeOtherSessions,
  revokeAllSessions,
  currentJti,
  type ActiveSession,
} from './services/session.service';
export {
  loginSchema,
  createUserSchema,
  setPasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  listUsersSchema,
  updateUserSchema,
  changePasswordSchema,
  updateProfileSchema,
  revokeSessionsSchema,
  type LoginInput,
  type CreateUserInput,
  type SetPasswordInput,
  type ForgotPasswordInput,
  type ResetPasswordInput,
  type ListUsersInput,
  type UpdateUserInput,
  type ChangePasswordInput,
  type UpdateProfileInput,
  type RevokeSessionsInput,
} from './schemas';
export { User } from './models/user.model';
