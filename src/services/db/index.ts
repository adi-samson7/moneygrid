import { BACKEND } from '@/services/backend'
import { localDb } from './local-db'
import type { Db } from './types'

export * from './types'
export { COLLECTIONS } from './collections'

/**
 * The Db the services use. With the Firebase backend the Firestore implementation (and the Firebase
 * SDK) is loaded on first use, so the local build never downloads it.
 */
let firestorePromise: Promise<Db> | undefined
const loadFirestore = () => (firestorePromise ??= import('./firestore-db').then((m) => m.firestoreDb))

const lazyFirestore: Db = {
  list: async (uid, collection) => (await loadFirestore()).list(uid, collection),
  get: async (uid, collection, id) => (await loadFirestore()).get(uid, collection, id),
  where: async (uid, collection, field, value) => (await loadFirestore()).where(uid, collection, field, value),
  recent: async (uid, collection, orderBy, limit) => (await loadFirestore()).recent(uid, collection, orderBy, limit),
  commit: async (uid, ops, preconditions) => (await loadFirestore()).commit(uid, ops, preconditions),
}

export const db: Db = BACKEND === 'firebase' ? lazyFirestore : localDb
