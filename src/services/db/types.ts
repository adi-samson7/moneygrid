/**
 * The data-access contract every service is written against. There are two implementations: one
 * over localStorage (development and tests) and one over Cloud Firestore (production).
 *
 * Every document lives under one user: users/{uid}/{collection}/{id}. Documents carry their own
 * `id` field, equal to the document id.
 */

export interface SetOp {
  type: 'set'
  collection: string
  id: string
  data: object
}

export interface DeleteOp {
  type: 'delete'
  collection: string
  id: string
}

export type WriteOp = SetOp | DeleteOp

/** A condition on a document that must hold at commit time, or the whole commit is rejected. */
export interface Precondition {
  collection: string
  id: string
  field: string
  equals: unknown
}

/** Thrown by commit() when a precondition no longer holds (e.g. a payment was already recorded). */
export class PreconditionFailedError extends Error {
  constructor() {
    super('The data changed while saving. Please try again.')
    this.name = 'PreconditionFailedError'
  }
}

export interface Db {
  /** Every document in a collection. */
  list<T>(uid: string, collection: string): Promise<T[]>
  get<T>(uid: string, collection: string, id: string): Promise<T | null>
  /** Documents whose `field` equals `value`. Single-field equality only (no composite index needed). */
  where<T>(uid: string, collection: string, field: string, value: unknown): Promise<T[]>
  /** The newest `limit` documents by `orderBy` (a string or number field), newest first. */
  recent<T>(uid: string, collection: string, orderBy: string, limit: number): Promise<T[]>
  /**
   * Applies all writes together. With preconditions, none are applied unless every precondition
   * holds when committing. Large batches may be split, in which case they are no longer atomic.
   */
  commit(uid: string, ops: WriteOp[], preconditions?: Precondition[]): Promise<void>
}

export const setOp = <T extends { id: string }>(collection: string, doc: T): SetOp => ({ type: 'set', collection, id: doc.id, data: doc })
export const deleteOp = (collection: string, id: string): DeleteOp => ({ type: 'delete', collection, id })
