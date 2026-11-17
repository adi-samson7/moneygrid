import { readArray, writeJson } from '@/utils/storage'
import { COLLECTIONS } from './collections'
import { PreconditionFailedError, type Db, type Precondition, type WriteOp } from './types'

/**
 * localStorage implementation of Db, used in development and in tests. Each collection is one JSON
 * array under spm.mock.{collection}.{uid}, so one user's code path never reads another user's data.
 *
 * Reads are defensive: damaged or wrongly shaped data is treated as empty (see utils/storage).
 */

const keyFor = (collection: string, uid: string) => `spm.mock.${collection}.${uid}`

/** localStorage has a small quota, so the activity log keeps only the newest entries. */
const CAPS: Record<string, number> = { [COLLECTIONS.activity]: 50 }

type Doc = { id: string } & Record<string, unknown>
const read = (uid: string, collection: string): Doc[] => readArray<Doc>(keyFor(collection, uid))

function compareDesc(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return b - a
  return String(b ?? '').localeCompare(String(a ?? ''))
}

export const localDb: Db = {
  async list<T>(uid: string, collection: string) {
    return read(uid, collection) as unknown as T[]
  },

  async get<T>(uid: string, collection: string, id: string) {
    return (read(uid, collection).find((d) => d.id === id) ?? null) as T | null
  },

  async where<T>(uid: string, collection: string, field: string, value: unknown) {
    return read(uid, collection).filter((d) => d[field] === value) as unknown as T[]
  },

  async recent<T>(uid: string, collection: string, orderBy: string, limit: number) {
    return read(uid, collection)
      .sort((a, b) => compareDesc(a[orderBy], b[orderBy]))
      .slice(0, limit) as unknown as T[]
  },

  async commit(uid: string, ops: WriteOp[], preconditions: Precondition[] = []) {
    for (const p of preconditions) {
      const doc = read(uid, p.collection).find((d) => d.id === p.id)
      if (!doc || doc[p.field] !== p.equals) throw new PreconditionFailedError()
    }

    // Apply everything in memory first, then write each changed collection.
    const next = new Map<string, Doc[]>()
    for (const op of ops) {
      const docs = next.get(op.collection) ?? read(uid, op.collection)
      const index = docs.findIndex((d) => d.id === op.id)
      if (op.type === 'delete') {
        next.set(op.collection, index === -1 ? docs : docs.filter((d) => d.id !== op.id))
        continue
      }
      const doc = { ...(op.data as object), id: op.id } as Doc
      // An updated document keeps its position; a new one goes at the end.
      next.set(op.collection, index === -1 ? [...docs, doc] : docs.map((d, i) => (i === index ? doc : d)))
    }

    const written: { key: string; previous: string | null }[] = []
    try {
      for (const [collection, docs] of next) {
        const cap = CAPS[collection]
        const kept = cap ? [...docs].sort((a, b) => compareDesc(a.createdAt, b.createdAt)).slice(0, cap) : docs
        const key = keyFor(collection, uid)
        const previous = localStorage.getItem(key)
        writeJson(key, kept)
        written.push({ key, previous })
      }
    } catch (error) {
      // Undo what was written so a failed save never leaves half of it behind.
      for (const { key, previous } of written.reverse()) {
        try {
          if (previous === null) localStorage.removeItem(key)
          else localStorage.setItem(key, previous)
        } catch {
          // Nothing more can be done.
        }
      }
      throw error
    }
  },
}
