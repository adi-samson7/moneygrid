import { initializeApp, type FirebaseApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore, type Firestore } from 'firebase/firestore'

/**
 * Firebase setup. Only loaded when the app runs with VITE_BACKEND=firebase (see backend.ts), so the
 * local/mock build does not include the Firebase SDK.
 *
 * Set VITE_USE_EMULATORS=true to talk to the local Auth and Firestore emulators (npm run emulators)
 * instead of a real project. No Firebase account is needed for that.
 */

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
}

export const USE_EMULATORS = import.meta.env.VITE_USE_EMULATORS === 'true'

export interface FirebaseServices {
  app: FirebaseApp
  auth: Auth
  firestore: Firestore
}

let instance: FirebaseServices | undefined

/** The initialised Firebase app, created on first use. Throws a clear error if it is not configured. */
export function getFirebase(): FirebaseServices {
  if (instance) return instance

  // Last line of defence: an automated test must never reach a real Firebase project.
  if (import.meta.env.MODE === 'test' && !USE_EMULATORS) {
    throw new Error('Tests must not use a real Firebase project. Use the emulators (npm run test:emulator).')
  }

  const configured = Boolean(config.apiKey && config.projectId)
  if (!configured && !USE_EMULATORS) {
    throw new Error(
      'Firebase is not configured. Copy .env.example to .env.local and fill in the VITE_FIREBASE_* values, ' +
        'or set VITE_USE_EMULATORS=true to use the local emulators.',
    )
  }

  // The emulators accept any key; a "demo-" project id keeps them from touching a real project.
  const app = initializeApp(configured ? config : { apiKey: 'demo-api-key', projectId: 'demo-spm', appId: 'demo-app' })
  const auth = getAuth(app)
  const firestore = getFirestore(app)

  if (USE_EMULATORS) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    connectFirestoreEmulator(firestore, '127.0.0.1', 8080)
  }

  instance = { app, auth, firestore }
  return instance
}
