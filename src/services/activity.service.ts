import { COLLECTIONS, db, setOp, type WriteOp } from '@/services/db'
import type { ActivityEntry, ActivityInput } from '@/types/activity'

let lastStamp = 0

/** Millisecond timestamps that never repeat within a session, so entries always sort in the order they were made. */
function monotonicNow(): string {
  lastStamp = Math.max(Date.now(), lastStamp + 1)
  return new Date(lastStamp).toISOString()
}

/** A write that records a change. Include it in the same commit as the change it describes. */
export function activityOp(input: ActivityInput): WriteOp {
  const entry: ActivityEntry = { ...input, id: crypto.randomUUID(), createdAt: monotonicNow() }
  return setOp(COLLECTIONS.activity, entry)
}

/**
 * Records a change on its own. Never throws: a logging problem must not make the change it
 * describes fail.
 */
export async function logActivity(uid: string, input: ActivityInput): Promise<void> {
  try {
    await db.commit(uid, [activityOp(input)])
  } catch (error) {
    console.warn('Could not record activity', error)
  }
}

/** Newest first. Only the newest `limit` entries are read, however long the log is. */
export async function listActivity(uid: string, limit = 10): Promise<ActivityEntry[]> {
  return db.recent<ActivityEntry>(uid, COLLECTIONS.activity, 'createdAt', limit)
}
