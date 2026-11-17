import { describe, expect, test } from 'vitest'
import { BACKEND } from '@/services/backend'
import { getFirebase } from '@/services/firebase'

/**
 * Guards against a test run touching a real Firebase project: `.env.local` holds the real settings
 * and must never be read by the tests.
 */
describe('tests are isolated from the real Firebase project', () => {
  test('the app runs in local mode, whatever .env.local says', () => {
    expect(BACKEND).toBe('local')
    expect(import.meta.env.VITE_BACKEND).not.toBe('firebase')
  })

  test('no real Firebase settings are visible to the tests', () => {
    expect(import.meta.env.VITE_FIREBASE_API_KEY).toBeUndefined()
    expect(import.meta.env.VITE_FIREBASE_PROJECT_ID).toBeUndefined()
    expect(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN).toBeUndefined()
    expect(import.meta.env.VITE_FIREBASE_APP_ID).toBeUndefined()
  })

  test('Firebase refuses to start in a test unless it is pointed at the emulators', () => {
    expect(() => getFirebase()).toThrow(/must not use a real Firebase project/)
  })
})
