import { beforeEach, describe, expect, test } from 'vitest'
import { localDb } from '@/services/db/local-db'
import { deleteOp, setOp } from '@/services/db/types'
import { defineDbContract } from '@/test/db-contract'

defineDbContract({ label: 'localStorage', db: localDb, uid: 'u1' })

// Behaviour specific to the localStorage implementation.
describe('localStorage Db specifics', () => {
  beforeEach(() => localStorage.clear())

  test('each user\'s documents are kept apart', async () => {
    await localDb.commit('alice', [setOp('subscriptions', { id: 's1', name: 'A' })])
    expect(await localDb.get('bob', 'subscriptions', 's1')).toBeNull()
    expect(await localDb.list('bob', 'subscriptions')).toEqual([])
    expect(await localDb.list('alice', 'subscriptions')).toHaveLength(1)
  })

  test('an updated document keeps its place in the list; new ones go last', async () => {
    await localDb.commit('u', [setOp('x', { id: 'a' }), setOp('x', { id: 'b' }), setOp('x', { id: 'c' })])
    await localDb.commit('u', [setOp('x', { id: 'a', v: 2 }), setOp('x', { id: 'd' })])
    expect((await localDb.list<{ id: string }>('u', 'x')).map((d) => d.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  test('the activity log keeps only the newest 50 entries', async () => {
    const entries = Array.from({ length: 70 }, (_, i) => ({ id: `e${i}`, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString() }))
    await localDb.commit('u', entries.map((e) => setOp('activity', e)))
    const kept = await localDb.list<{ id: string }>('u', 'activity')
    expect(kept).toHaveLength(50)
    expect(kept.some((e) => e.id === 'e69')).toBe(true)
    expect(kept.some((e) => e.id === 'e0')).toBe(false)
  })

  test('a failed write leaves no half-saved data behind (everything is rolled back)', async () => {
    await localDb.commit('u', [setOp('one', { id: 'a', v: 1 }), setOp('two', { id: 'a', v: 1 })])
    const real = Storage.prototype.setItem
    let writes = 0
    Storage.prototype.setItem = function (key: string, value: string) {
      // Let the first collection save, then fail on the second.
      if (key.includes('.two.') && writes++ === 0) throw new DOMException('quota', 'QuotaExceededError')
      return real.call(this, key, value)
    }
    try {
      await expect(
        localDb.commit('u', [setOp('one', { id: 'a', v: 2 }), setOp('two', { id: 'a', v: 2 }), setOp('three', { id: 'z' })]),
      ).rejects.toThrow()
    } finally {
      Storage.prototype.setItem = real
    }
    expect(await localDb.get('u', 'one', 'a')).toMatchObject({ v: 1 })
    expect(await localDb.get('u', 'two', 'a')).toMatchObject({ v: 1 })
    expect(await localDb.get('u', 'three', 'z')).toBeNull()
  })

  test('damaged stored data reads as empty and can be written over', async () => {
    localStorage.setItem('spm.mock.things.u', '{not json')
    expect(await localDb.list('u', 'things')).toEqual([])
    await localDb.commit('u', [setOp('things', { id: 'a' }), deleteOp('things', 'zzz')])
    expect(await localDb.list('u', 'things')).toHaveLength(1)
  })
})
