import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  where,
  writeBatch,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type Transaction,
  type WriteBatch,
} from 'firebase/firestore'
import { getFirebase } from '@/services/firebase'
import { PreconditionFailedError, type Db, type Precondition, type WriteOp } from './types'

/**
 * Cloud Firestore implementation of Db. Data lives at users/{uid}/{collection}/{id}.
 * The security rules (firestore.rules) restrict each user to their own subtree.
 */

/** Firestore allows 500 writes per batch; stay below it. */
const BATCH_LIMIT = 450

const fs = (): Firestore => getFirebase().firestore
const colRef = (uid: string, name: string) => collection(fs(), 'users', uid, name)
const docRef = (uid: string, name: string, id: string) => doc(fs(), 'users', uid, name, id)

/** Firestore rejects `undefined` values. Dropping them matches what JSON storage does. */
const clean = (data: object): DocumentData => JSON.parse(JSON.stringify(data)) as DocumentData

/** Turns SDK errors into messages a user can act on. The original error is kept as `cause`. */
function friendly(error: unknown): Error {
  const code = (error as { code?: string } | null)?.code
  if (code === 'permission-denied') return new Error('You do not have permission to do that. Try signing in again.', { cause: error })
  if (code === 'unavailable' || code === 'deadline-exceeded') {
    return new Error('Could not reach the server. Check your connection and try again.', { cause: error })
  }
  if (code === 'resource-exhausted') return new Error('The service is busy or a daily limit was reached. Try again later.', { cause: error })
  return error instanceof Error ? error : new Error(String(error))
}

async function guarded<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (error instanceof PreconditionFailedError) throw error
    throw friendly(error)
  }
}

/** The part of WriteBatch and Transaction that both share. */
interface Writer {
  set(ref: DocumentReference, data: DocumentData): unknown
  delete(ref: DocumentReference): unknown
}

function applyOp(target: WriteBatch | Transaction, uid: string, op: WriteOp): void {
  const writer = target as unknown as Writer
  const ref = docRef(uid, op.collection, op.id)
  if (op.type === 'set') writer.set(ref, clean({ ...(op.data as object), id: op.id }))
  else writer.delete(ref)
}

/**
 * After a checked commit is denied, finds out why. The security rules are evaluated before the
 * transaction's own checks, so when another commit got there first (e.g. the payment was just
 * recorded) the rules refuse the write and the result looks like "permission denied". If one of the
 * conditions no longer holds, that is the real reason; otherwise it really is a permission problem.
 */
async function explainDenial(uid: string, preconditions: Precondition[], original: unknown): Promise<unknown> {
  if ((original as { code?: string } | null)?.code !== 'permission-denied') return original
  try {
    for (const p of preconditions) {
      const snap = await getDoc(docRef(uid, p.collection, p.id))
      if (!snap.exists() || snap.data()[p.field] !== p.equals) return new PreconditionFailedError()
    }
  } catch {
    // Cannot even read the documents: it is a genuine permission problem.
  }
  return original
}

export const firestoreDb: Db = {
  list: <T>(uid: string, name: string) =>
    guarded(async () => (await getDocs(colRef(uid, name))).docs.map((d) => d.data() as T)),

  get: <T>(uid: string, name: string, id: string) =>
    guarded(async () => {
      const snap = await getDoc(docRef(uid, name, id))
      return snap.exists() ? (snap.data() as T) : null
    }),

  where: <T>(uid: string, name: string, field: string, value: unknown) =>
    guarded(async () => (await getDocs(query(colRef(uid, name), where(field, '==', value)))).docs.map((d) => d.data() as T)),

  recent: <T>(uid: string, name: string, orderField: string, max: number) =>
    guarded(async () =>
      (await getDocs(query(colRef(uid, name), orderBy(orderField, 'desc'), limit(max)))).docs.map((d) => d.data() as T),
    ),

  commit: (uid: string, ops: WriteOp[], preconditions: Precondition[] = []) =>
    guarded(async () => {
      if (ops.length === 0) return

      if (preconditions.length > 0) {
        if (ops.length > BATCH_LIMIT) throw new Error('Too many changes to save at once.')
        // A transaction re-checks the conditions at commit time, so two tabs (or a double click)
        // cannot both record the same payment.
        try {
          await runTransaction(fs(), async (tx) => {
            for (const p of preconditions) {
              const snap = await tx.get(docRef(uid, p.collection, p.id))
              if (!snap.exists() || snap.data()[p.field] !== p.equals) throw new PreconditionFailedError()
            }
            for (const op of ops) applyOp(tx, uid, op)
          })
        } catch (error) {
          throw await explainDenial(uid, preconditions, error)
        }
        return
      }

      for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
        const batch = writeBatch(fs())
        for (const op of ops.slice(i, i + BATCH_LIMIT)) applyOp(batch, uid, op)
        await batch.commit()
      }
    }),
}
