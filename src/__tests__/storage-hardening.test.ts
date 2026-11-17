import assert from 'node:assert/strict'
import { scenario } from '@/test/steps'
import { listActivity } from '@/services/activity.service'
import { authService } from '@/services/auth.service'
import { listNotifications, markAllNotificationsRead, syncNotifications } from '@/services/notification.service'
import { listPayments } from '@/services/payment.service'
import { listPolicyPayments } from '@/services/policy-payment.service'
import { listPolicies } from '@/services/policy.service'
import { getPreferences } from '@/services/preferences.service'
import { getProfile } from '@/services/profile.service'
import { createSubscription, listSubscriptions } from '@/services/subscription.service'
import { DEFAULT_NOTIFICATION_PREFERENCES } from '@/types/notification'
import { readArray, readObject } from '@/utils/storage'

// Values that are valid or invalid JSON but not what the app expects to find.
const DAMAGED = ['{not json', 'null', '5', '"text"', 'true', '{}', '[1,"a",null,true]', '[[1],[2]]', '']

const uid = 'u-damaged'
const COLLECTION_KEYS = ['subscriptions', 'subscriptionPayments', 'policies', 'policyPayments', 'activity', 'notifications', 'settings', 'profile']

scenario('storage hardening: damaged localStorage never crashes the data layer', async (check) => {
  await check('reading helpers return safe shapes for any stored value', async () => {
    for (const raw of DAMAGED) {
      localStorage.setItem('k', raw)
      assert.ok(Array.isArray(readArray('k')), raw)
      assert.ok(readArray('k').every((x) => typeof x === 'object' && x !== null && !Array.isArray(x)), raw)
      const fallback = { ok: true }
      const obj = readObject('k', fallback)
      assert.equal(typeof obj, 'object', raw)
      assert.ok(!Array.isArray(obj) && obj !== null, raw)
    }
    localStorage.removeItem('k')
    assert.deepEqual(readArray('missing'), [])
    assert.deepEqual(readObject('missing', { a: 1 }), { a: 1 })
    localStorage.setItem('k', '[{"a":1},5,null,{"b":2}]')
    assert.deepEqual(readArray('k'), [{ a: 1 }, { b: 2 }], 'object entries are kept, the rest dropped')
  })

  await check('every list service returns an empty list, whatever is stored', async () => {
    for (const raw of DAMAGED) {
      for (const name of COLLECTION_KEYS) localStorage.setItem(`spm.mock.${name}.${uid}`, raw)
      assert.ok(Array.isArray(await listSubscriptions(uid)), raw)
      assert.ok(Array.isArray(await listPayments(uid)), raw)
      assert.ok(Array.isArray(await listPolicies(uid)), raw)
      assert.ok(Array.isArray(await listPolicyPayments(uid)), raw)
      assert.ok(Array.isArray(await listActivity(uid)), raw)
      assert.ok(Array.isArray(await listNotifications(uid)), raw)
      await markAllNotificationsRead(uid)
      await syncNotifications(uid, { subscriptions: [], subscriptionPayments: [], policies: [], policyPayments: [] }, DEFAULT_NOTIFICATION_PREFERENCES)
    }
  })

  await check('preferences fall back to defaults', async () => {
    for (const raw of DAMAGED) {
      localStorage.setItem(`spm.mock.settings.${uid}`, raw)
      const prefs = await getPreferences(uid)
      assert.equal(typeof prefs.inAppNotifications, 'boolean', raw)
      assert.equal(typeof prefs.premiumReminderDays, 'number', raw)
    }
  })

  await check('new data can be saved over damaged data and read back', async () => {
    for (const name of COLLECTION_KEYS) localStorage.setItem(`spm.mock.${name}.${uid}`, '{not json')
    const created = await createSubscription(uid, {
      name: 'Netflix', provider: '', category: 'Entertainment', amountMinor: 49900, currency: 'INR', billingCycle: 'monthly',
      startDate: '2026-01-01', nextPaymentDate: '2026-12-01', paymentMethod: '', reminderDays: 3,
    })
    const list = await listSubscriptions(uid)
    assert.equal(list.length, 1)
    assert.equal(list[0].id, created.id)
    assert.equal((await listPayments(uid)).length, 1)
  })

  await check('auth: damaged users, session, reset tokens and profiles are treated as "nothing stored"', async () => {
    for (const raw of DAMAGED) {
      localStorage.setItem('spm.mock.users', raw)
      localStorage.setItem('spm.mock.session', raw)
      localStorage.setItem('spm.mock.resetTokens', raw)
      localStorage.setItem('spm.mock.profile.someone', raw)
      await assert.rejects(authService.login('a@b.co', 'password123'), (e: { code?: string }) => e.code === 'auth/invalid-credential', raw)
      await assert.rejects(authService.confirmPasswordReset('token', 'password123'), (e: { code?: string }) => e.code === 'auth/invalid-reset-token', raw)
      assert.deepEqual(await authService.sendPasswordReset('a@b.co'), {})
      assert.equal(await getProfile('someone'), null, raw)
      const seen: unknown[] = []
      const unsubscribe = authService.onAuthStateChanged((user) => seen.push(user))
      await new Promise((resolve) => setTimeout(resolve, 5))
      unsubscribe()
      assert.deepEqual(seen, [null], `signed out when the session value is ${raw}`)
    }
  })

  await check('auth: registering works after the user list was damaged', async () => {
    localStorage.setItem('spm.mock.users', 'null')
    const user = await authService.register({ fullName: 'Asha', email: 'asha@example.com', password: 'password123' })
    assert.equal(user.email, 'asha@example.com')
    const again = await authService.login('asha@example.com', 'password123')
    assert.equal(again.uid, user.uid)
  })
})
