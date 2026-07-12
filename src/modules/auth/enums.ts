/** Account lifecycle status. Users are never deleted — disabled instead. */
export enum UserStatus {
  Invited = 'invited', // created, awaiting email OTP verify + password
  Active = 'active',
  Disabled = 'disabled', // soft-deleted / deactivated
}

/** Purpose of a one-time token. */
export enum OtpPurpose {
  VerifyEmail = 'verifyEmail', // onboarding
  ResetPassword = 'resetPassword', // forgot password
  Login2fa = 'login2fa', // optional 2FA (future)
}
