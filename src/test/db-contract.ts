import { describe, expect, test } from 'vitest'
import { PreconditionFailedError, deleteOp, setOp, type Db } from '@/services/db/types'

/**
 * Behaviour every Db implementation must have, whichever storage is underneath. Run against the
 * localStorage implementation in the normal suite and against Firestore in the emulator suite.
 * Uses notification-shaped documents because they are valid under the Firestore security rules.
 */

const COL = 'notifications'
const at = (n: number) => new Date(Date.UTC(2026, 10, 1, 0, 0, n)).toISOString()

const note = (id: string, o: object = {}) => ({
  id, kind: 'subscription_due', title: `Title ${id}`, description: 'desc', relatedType: 'subscription', relatedId: null,
  createdAt: at(0), read: false, readAt: null, ...o,
})

interface Options {
  label: string
  db: Db
  uid: string
}

export function defineDbContract({ label, db, uid }: Options) {
  /** Removes everything in the test collection so each test starts clean. */
  const clean = async () => {
    const all = await db.list<{ id: string }>(uid, COL)
    if (all.length) await db.commit(uid, all.map((d) => deleteOp(COL, d.id)))
  }
  const ids = async () => (await db.list<{ id: string }>(uid, COL)).map((d) => d.id).sort()

  describe(`Db contract: ${label}`, () => {
    test('an empty collection lists nothing and a missing document is null', async () => {
      await clean()
      expect(await db.list(uid, COL)).toEqual([])
      expect(await db.get(uid, COL, 'nope')).toBeNull()
      expect(await db.where(uid, COL, 'read', false)).toEqual([])
      expect(await db.recent(uid, COL, 'createdAt', 5)).toEqual([])
    })

    test('set creates documents that can be listed and fetched, and carries the id', async () => {
      await clean()
      await db.commit(uid, [setOp(COL, note('a')), setOp(COL, note('b', { title: 'Second' }))])
      expect(await ids()).toEqual(['a', 'b'])
      expect(await db.get(uid, COL, 'b')).toMatchObject({ id: 'b', title: 'Second', read: false, relatedId: null })
    })

    test('set on an existing id replaces that document and does not duplicate it', async () => {
      await clean()
      await db.commit(uid, [setOp(COL, note('a'))])
      await db.commit(uid, [setOp(COL, note('a', { read: true, readAt: at(5) }))])
      expect(await ids()).toEqual(['a'])
      expect(await db.get(uid, COL, 'a')).toMatchObject({ read: true, readAt: at(5) })
    })

    test('delete removes a document; deleting one that does not exist is harmless', async () => {
      await clean()
      await db.commit(uid, [setOp(COL, note('a')), setOp(COL, note('b'))])
      await db.commit(uid, [deleteOp(COL, 'a'), deleteOp(COL, 'never-existed')])
      expect(await ids()).toEqual(['b'])
    })

    test('where finds documents by one field value', async () => {
      await clean()
      await db.commit(uid, [setOp(COL, note('a')), setOp(COL, note('b', { read: true, readAt: at(1) })), setOp(COL, note('c'))])
      expect((await db.where<{ id: string }>(uid, COL, 'read', false)).map((d) => d.id).sort()).toEqual(['a', 'c'])
      expect((await db.where<{ id: string }>(uid, COL, 'read', true)).map((d) => d.id)).toEqual(['b'])
      expect(await db.where(uid, COL, 'kind', 'payment_paid')).toEqual([])
    })

    test('recent returns the newest documents first, up to the limit', async () => {
      await clean()
      await db.commit(uid, [1, 2, 3, 4, 5].map((n) => setOp(COL, note(`n${n}`, { createdAt: at(n) }))))
      expect((await db.recent<{ id: string }>(uid, COL, 'createdAt', 3)).map((d) => d.id)).toEqual(['n5', 'n4', 'n3'])
      expect((await db.recent<{ id: string }>(uid, COL, 'createdAt', 99)).map((d) => d.id)).toEqual(['n5', 'n4', 'n3', 'n2', 'n1'])
    })

    test('a commit with an empty list does nothing', async () => {
      await clean()
      await db.commit(uid, [])
      expect(await ids()).toEqual([])
    })

    test('a commit applies all of its writes', async () => {
      await clean()
      await db.commit(uid, [setOp(COL, note('keep')), setOp(COL, note('gone'))])
      await db.commit(uid, [deleteOp(COL, 'gone'), setOp(COL, note('new')), setOp(COL, note('keep', { read: true, readAt: at(7) }))])
      expect(await ids()).toEqual(['keep', 'new'])
      expect(await db.get(uid, COL, 'keep')).toMatchObject({ read: true })
    })

    test('preconditions: when they hold the writes are applied', async () => {
      await clean()
      await db.commit(uid, [setOp(COL, note('a'))])
      await db.commit(uid, [setOp(COL, note('a', { read: true, readAt: at(2) })), setOp(COL, note('b'))], [
        { collection: COL, id: 'a', field: 'read', equals: false },
      ])
      expect(await ids()).toEqual(['a', 'b'])
      expect(await db.get(uid, COL, 'a')).toMatchObject({ read: true })
    })

    test('preconditions: when one fails nothing at all is written', async () => {
      await clean()
      await db.commit(uid, [setOp(COL, note('a', { read: true, readAt: at(2) }))])
      await expect(
        db.commit(uid, [setOp(COL, note('a', { read: true, readAt: at(9) })), setOp(COL, note('b'))], [
          { collection: COL, id: 'a', field: 'read', equals: false },
        ]),
      ).rejects.toBeInstanceOf(PreconditionFailedError)
      expect(await ids()).toEqual(['a'])
      expect(await db.get(uid, COL, 'a')).toMatchObject({ read: true, readAt: at(2) })
    })

    test('preconditions: a document that does not exist fails the check', async () => {
      await clean()
      await expect(
        db.commit(uid, [setOp(COL, note('b'))], [{ collection: COL, id: 'missing', field: 'read', equals: false }]),
      ).rejects.toBeInstanceOf(PreconditionFailedError)
      expect(await ids()).toEqual([])
    })

    test('two commits racing on the same precondition: exactly one wins', async () => {
      await clean()
      await db.commit(uid, [setOp(COL, note('a'))])
      const attempt = (second: number) =>
        db.commit(uid, [setOp(COL, note('a', { read: true, readAt: at(second) }))], [{ collection: COL, id: 'a', field: 'read', equals: false }])
      const results = await Promise.allSettled([attempt(3), attempt(4)])
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      const loser = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
      expect(loser.reason).toBeInstanceOf(PreconditionFailedError)
    })

    test('a large commit (more writes than one batch holds) is fully applied', async () => {
      await clean()
      await db.commit(uid, Array.from({ length: 600 }, (_, i) => setOp(COL, note(`bulk-${String(i).padStart(3, '0')}`, { createdAt: at(i % 50) }))))
      expect(await db.list(uid, COL)).toHaveLength(600)
      await clean()
      expect(await db.list(uid, COL)).toHaveLength(0)
    })

    test('documents are separate per collection', async () => {
      await clean()
      await db.commit(uid, [setOp(COL, note('a'))])
      expect(await db.get(uid, 'activity', 'a')).toBeNull()
    })
  })
}
