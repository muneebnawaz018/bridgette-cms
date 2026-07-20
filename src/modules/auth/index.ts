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
  reactivateUser,
  resendInvite,
  listUsers,
  getUser,
  updateUser,
  changePassword,
  updateOwnProfile,
  requestEmailChange,
  confirmEmailChange,
  failedAttemptsFor,
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
  requestEmailChangeSchema,
  confirmEmailChangeSchema,
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
  type RequestEmailChangeInput,
  type ConfirmEmailChangeInput,
} from './schemas';
export { User } from './models/user.model';
