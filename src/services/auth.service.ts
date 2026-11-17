import { mockAuthService } from '@/services/mock/mock-auth.service'
import { BACKEND } from '@/services/backend'
import type { AuthService } from '@/services/auth.types'
import type { AuthUser } from '@/types/user'

export { AuthError, getAuthErrorMessage, isCancelledSignIn } from '@/services/auth.types'

/**
 * The AuthService the app uses: Firebase Authentication when built with VITE_BACKEND=firebase,
 * otherwise the localStorage mock. The Firebase code is loaded on first use, so the local build
 * does not download it.
 */
let firebasePromise: Promise<AuthService> | undefined
const loadFirebase = () => (firebasePromise ??= import('./firebase-auth.service').then((m) => m.firebaseAuthService))

const lazyFirebaseAuth: AuthService = {
  register: async (params) => (await loadFirebase()).register(params),
  login: async (email, password) => (await loadFirebase()).login(email, password),
  signInWithGoogle: async () => (await loadFirebase()).signInWithGoogle(),
  logout: async () => (await loadFirebase()).logout(),
  sendPasswordReset: async (email) => (await loadFirebase()).sendPasswordReset(email),
  confirmPasswordReset: async (token, password) => (await loadFirebase()).confirmPasswordReset(token, password),
  onAuthStateChanged(callback: (user: AuthUser | null) => void) {
    let unsubscribe: (() => void) | undefined
    let cancelled = false
    loadFirebase()
      .then((service) => {
        if (!cancelled) unsubscribe = service.onAuthStateChanged(callback)
      })
      .catch((error) => {
        // Firebase could not start (e.g. missing configuration): treat the visitor as signed out.
        console.error('Firebase sign-in is unavailable', error)
        callback(null)
      })
    return () => {
      cancelled = true
      unsubscribe?.()
    }
  },
}

export const authService: AuthService = BACKEND === 'firebase' ? lazyFirebaseAuth : mockAuthService
