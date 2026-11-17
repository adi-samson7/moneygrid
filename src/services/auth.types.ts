import type { AuthUser } from '@/types/user'

export type AuthErrorCode =
  | 'auth/email-already-in-use'
  | 'auth/invalid-credential'
  | 'auth/invalid-reset-token'
  | 'auth/weak-password'
  | 'auth/too-many-requests'
  | 'auth/network-request-failed'
  | 'auth/user-disabled'
  | 'auth/popup-blocked'
  /** The user closed the Google window. Not a failure: callers should stay quiet. */
  | 'auth/popup-closed-by-user'

const MESSAGES: Record<AuthErrorCode, string> = {
  'auth/email-already-in-use': 'An account with this email already exists. Try logging in instead.',
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/invalid-reset-token': 'This reset link is invalid or has expired. Request a new one.',
  'auth/weak-password': 'Choose a stronger password (at least 8 characters).',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/network-request-failed': 'Could not reach the server. Check your connection and try again.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/popup-blocked': 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.',
  'auth/popup-closed-by-user': 'The sign-in window was closed before finishing.',
}

export class AuthError extends Error {
  readonly code: AuthErrorCode

  constructor(code: AuthErrorCode) {
    super(MESSAGES[code])
    this.name = 'AuthError'
    this.code = code
  }
}

/** A user-facing message for any error thrown by an auth call. */
export function getAuthErrorMessage(error: unknown): string {
  if (error instanceof AuthError) return error.message
  console.error(error)
  return 'Something went wrong. Please try again.'
}

/** True when the user simply dismissed the Google window, which should not show an error. */
export const isCancelledSignIn = (error: unknown): boolean =>
  error instanceof AuthError && error.code === 'auth/popup-closed-by-user'

export interface RegisterParams {
  fullName: string
  email: string
  password: string
}

export interface PasswordResetRequest {
  /** Only set by the mock service, which cannot send email. */
  mockResetToken?: string
}

/** Contract implemented by both the mock service and Firebase Authentication. */
export interface AuthService {
  register(params: RegisterParams): Promise<AuthUser>
  login(email: string, password: string): Promise<AuthUser>
  signInWithGoogle(): Promise<AuthUser>
  logout(): Promise<void>
  sendPasswordReset(email: string): Promise<PasswordResetRequest>
  confirmPasswordReset(token: string, newPassword: string): Promise<void>
  /** Calls back with the current user (or null) now and on every change. Returns an unsubscribe function. */
  onAuthStateChanged(callback: (user: AuthUser | null) => void): () => void
}
