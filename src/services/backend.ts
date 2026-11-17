/**
 * Which backend the app talks to. Chosen at build time from VITE_BACKEND:
 *   "firebase" -> Firebase Authentication + Cloud Firestore (production)
 *   anything else (default) -> mock sign-in and localStorage (development and tests)
 */
export type Backend = 'firebase' | 'local'

export const BACKEND: Backend = import.meta.env.VITE_BACKEND === 'firebase' ? 'firebase' : 'local'
