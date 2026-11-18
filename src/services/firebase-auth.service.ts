import {
  GoogleAuthProvider,
  confirmPasswordReset as firebaseConfirmPasswordReset,
  createUserWithEmailAndPassword,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth'
import { getFirebase } from '@/services/firebase'
import { AuthError, type AuthErrorCode, type AuthService, type PasswordResetRequest, type RegisterParams } from '@/services/auth.types'
import type { AuthUser } from '@/types/user'

/**
 * Firebase Authentication implementation of AuthService. Passwords are handled entirely by Firebase;
 * this app never sees or stores them.
 */

/** Firebase error codes that map to one of ours. Anything else is rethrown unchanged. */
const CODE_MAP: Record<string, AuthErrorCode> = {
  'auth/email-already-in-use': 'auth/email-already-in-use',
  // One message for "no such user" and "wrong password", so accounts cannot be discovered.
  'auth/invalid-credential': 'auth/invalid-credential',
  'auth/invalid-login-credentials': 'auth/invalid-credential',
  'auth/wrong-password': 'auth/invalid-credential',
  'auth/user-not-found': 'auth/invalid-credential',
  'auth/invalid-email': 'auth/invalid-credential',
  'auth/weak-password': 'auth/weak-password',
  'auth/too-many-requests': 'auth/too-many-requests',
  'auth/network-request-failed': 'auth/network-request-failed',
  'auth/user-disabled': 'auth/user-disabled',
  'auth/popup-blocked': 'auth/popup-blocked',
  'auth/popup-closed-by-user': 'auth/popup-closed-by-user',
  'auth/cancelled-popup-request': 'auth/popup-closed-by-user',
  'auth/expired-action-code': 'auth/invalid-reset-token',
  'auth/invalid-action-code': 'auth/invalid-reset-token',
}

function translate(error: unknown): unknown {
  const code = (error as { code?: string } | null)?.code
  const mapped = code ? CODE_MAP[code] : undefined
  return mapped ? new AuthError(mapped) : error
}

async function guarded<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    throw translate(error)
  }
}

function toAuthUser(user: User): AuthUser {
  const email = user.email ?? ''
  return {
    uid: user.uid,
    email,
    displayName: user.displayName?.trim() || email.split('@')[0] || 'User',
    photoURL: user.photoURL ?? undefined,
  }
}

// While a new account is being set up (created, then its display name saved), auth-state listeners
// wait, so the app never sees an account that is still missing its name.
let pendingRegistration: Promise<unknown> | null = null

async function register({ fullName, email, password }: RegisterParams): Promise<AuthUser> {
  const { auth } = getFirebase()
  const setup = (async () => {
    const credential = await createUserWithEmailAndPassword(auth, email.trim(), password)
    await updateProfile(credential.user, { displayName: fullName.trim() })
    return credential.user
  })()
  pendingRegistration = setup
  try {
    return toAuthUser(await guarded(() => setup))
  } finally {
    pendingRegistration = null
  }
}

async function login(email: string, password: string): Promise<AuthUser> {
  const { auth } = getFirebase()
  const credential = await guarded(() => signInWithEmailAndPassword(auth, email.trim(), password))
  return toAuthUser(credential.user)
}

async function signInWithGoogle(): Promise<AuthUser> {
  const { auth } = getFirebase()
  const provider = new GoogleAuthProvider()
  try {
    const credential = await signInWithPopup(auth, provider)
    return toAuthUser(credential.user)
  } catch (error) {
    // A browser can block the sign-in popup. Fall back to signing in on a full page, which cannot be
    // blocked and brings the visitor back to the site; the auth listener then picks the user up.
    if ((error as { code?: string } | null)?.code === 'auth/popup-blocked') {
      await guarded(() => signInWithRedirect(auth, provider))
      return new Promise<AuthUser>(() => {}) // the page is navigating away
    }
    throw translate(error)
  }
}

async function logout(): Promise<void> {
  await guarded(() => signOut(getFirebase().auth))
}

async function sendPasswordReset(email: string): Promise<PasswordResetRequest> {
  try {
    await sendPasswordResetEmail(getFirebase().auth, email.trim())
  } catch (error) {
    // Do not reveal whether an account exists for this address.
    if ((error as { code?: string } | null)?.code === 'auth/user-not-found') return {}
    throw translate(error)
  }
  return {}
}

async function confirmPasswordReset(token: string, newPassword: string): Promise<void> {
  await guarded(() => firebaseConfirmPasswordReset(getFirebase().auth, token, newPassword))
}

function onAuthStateChanged(callback: (user: AuthUser | null) => void): () => void {
  return firebaseOnAuthStateChanged(getFirebase().auth, async (user) => {
    if (pendingRegistration) await pendingRegistration.catch(() => undefined)
    // Read from the live user so a name saved during registration is included.
    const current = getFirebase().auth.currentUser
    callback(user && current ? toAuthUser(current) : null)
  })
}

export const firebaseAuthService: AuthService = {
  register,
  login,
  signInWithGoogle,
  logout,
  sendPasswordReset,
  confirmPasswordReset,
  onAuthStateChanged,
}
