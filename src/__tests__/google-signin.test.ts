import assert from 'node:assert/strict'
import { beforeEach, describe, test, vi } from 'vitest'

const popup = vi.fn()
const redirect = vi.fn()

vi.mock('firebase/auth', () => ({
  GoogleAuthProvider: class {},
  signInWithPopup: (...args: unknown[]) => popup(...args),
  signInWithRedirect: (...args: unknown[]) => redirect(...args),
  confirmPasswordReset: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  onAuthStateChanged: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  updateProfile: vi.fn(),
}))
vi.mock('@/services/firebase', () => ({ getFirebase: () => ({ auth: { name: 'test-auth' } }) }))

const { firebaseAuthService } = await import('@/services/firebase-auth.service')

const settled = (promise: Promise<unknown>) =>
  Promise.race([promise.then(() => 'resolved', () => 'rejected'), new Promise((r) => setTimeout(() => r('pending'), 50))])

describe('Google sign-in', () => {
  beforeEach(() => {
    popup.mockReset()
    redirect.mockReset()
  })

  test('uses the popup when it opens', async () => {
    popup.mockResolvedValue({ user: { uid: 'u1', email: 'a@b.co', displayName: 'Asha' } })
    const user = await firebaseAuthService.signInWithGoogle()
    assert.equal(user.uid, 'u1')
    assert.equal(redirect.mock.calls.length, 0)
  })

  test('falls back to a full-page sign-in when the browser blocks the popup', async () => {
    popup.mockRejectedValue({ code: 'auth/popup-blocked' })
    redirect.mockResolvedValue(undefined)
    const result = await settled(firebaseAuthService.signInWithGoogle())
    assert.equal(redirect.mock.calls.length, 1, 'redirect sign-in started')
    assert.equal(result, 'pending', 'the page is navigating away, so nothing else happens')
  })

  test('closing the popup is not retried as a redirect', async () => {
    popup.mockRejectedValue({ code: 'auth/popup-closed-by-user' })
    await assert.rejects(firebaseAuthService.signInWithGoogle(), (e: { code?: string }) => e.code === 'auth/popup-closed-by-user')
    assert.equal(redirect.mock.calls.length, 0)
  })

  test('if even the redirect fails, the visitor sees an error instead of a stuck button', async () => {
    popup.mockRejectedValue({ code: 'auth/popup-blocked' })
    redirect.mockRejectedValue({ code: 'auth/network-request-failed' })
    await assert.rejects(firebaseAuthService.signInWithGoogle(), (e: { code?: string }) => e.code === 'auth/network-request-failed')
  })
})
