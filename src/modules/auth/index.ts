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
} from './services/auth.service';
export {
  loginSchema,
  createUserSchema,
  setPasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  type LoginInput,
  type CreateUserInput,
  type SetPasswordInput,
  type ForgotPasswordInput,
  type ResetPasswordInput,
} from './schemas';
export { User } from './models/user.model';
