import assert from 'node:assert/strict'
import { AuthError, authService } from '@/services/auth.service'
import { COLLECTIONS, db } from '@/services/db'
import { listActivity } from '@/services/activity.service'
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  syncNotifications,
} from '@/services/notification.service'
import { listPayments, resolvePayment } from '@/services/payment.service'
import { listPolicyPayments, resolvePolicyPayment } from '@/services/policy-payment.service'
import { createPolicy, deletePolicy, listPolicies, renewPolicy, setPolicyStatus } from '@/services/policy.service'
import { getPreferences, updatePreferences } from '@/services/preferences.service'
import { createProfile, getProfile, updateProfile } from '@/services/profile.service'
import { createSubscription, deleteSubscription, listSubscriptions, setSubscriptionStatus, updateSubscription } from '@/services/subscription.service'
import { scenario } from '@/test/steps'
import { addDaysISO, todayISO } from '@/utils/dates'

/**
 * The app's own services running against the real Firebase Auth and Firestore emulators, with the
 * security rules enforced. Every document the app writes has to pass the rules, so this is the
 * check that the app and the rules agree. Run with: npm run test:emulator
 */

const today = todayISO()
const d = (n: number) => addDaysISO(today, n)
const stamp = Date.now()
const emailA = `asha-${stamp}@example.com`
const emailB = `ben-${stamp}@example.com`

const sub = (o: object = {}) => ({
  name: 'Netflix', provider: 'Netflix Inc', category: 'Entertainment', amountMinor: 49900, currency: 'INR', billingCycle: 'monthly',
  startDate: d(-40), nextPaymentDate: d(2), paymentMethod: 'Visa', reminderDays: 3, ...o,
}) as never
const pol = (o: object = {}) => ({
  provider: 'HDFC Ergo', policyName: 'Family Health', policyType: 'health', policyNumber: 'FH-1', premiumAmountMinor: 120000,
  currency: 'INR', coverageAmountMinor: 50000000, billingCycle: 'monthly', startDate: d(-100), expiryDate: d(250), nextPremiumDate: d(5),
  reminderDays: 30, notes: 'Includes dental', ...o,
}) as never

/** Reads the one-time codes the Auth emulator "emailed" (there is no real email in the emulator). */
async function emulatorResetCodes(): Promise<{ email: string; oobCode: string }[]> {
  const res = await fetch('http://127.0.0.1:9099/emulator/v1/projects/demo-spm/oobCodes')
  const body = (await res.json()) as { oobCodes: { email: string; oobCode: string; requestType: string }[] }
  return body.oobCodes.filter((c) => c.requestType === 'PASSWORD_RESET')
}

scenario(
  'firebase backend: auth, subscriptions, policies, notifications and isolation (emulators)',
  async (check) => {
    let a = { uid: '', email: emailA }
    let b = { uid: '', email: emailB }
    let subId = ''
    let polId = ''

    await check('register creates the account with its display name (the listener never sees a nameless user)', async () => {
      const seen: (string | null)[] = []
      const unsubscribe = authService.onAuthStateChanged((u) => seen.push(u ? u.displayName : null))
      const user = await authService.register({ fullName: 'Asha Rao', email: emailA, password: 'password123' })
      await new Promise((r) => setTimeout(r, 300))
      unsubscribe()
      a = { uid: user.uid, email: user.email }
      assert.equal(user.displayName, 'Asha Rao')
      assert.equal(user.email, emailA)
      assert.ok(user.uid.length > 5)
      const named = seen.filter((n): n is string => n !== null)
      assert.ok(named.length > 0 && named.every((n) => n === 'Asha Rao'), `listener saw: ${JSON.stringify(seen)}`)
    })

    await check('sign-in errors map to our messages; accounts cannot be told apart', async () => {
      await authService.logout()
      await assert.rejects(authService.login(emailA, 'wrong-password'), (e: AuthError) => e.code === 'auth/invalid-credential')
      await assert.rejects(authService.login(`nobody-${stamp}@example.com`, 'password123'), (e: AuthError) => e.code === 'auth/invalid-credential')
      await assert.rejects(authService.register({ fullName: 'Dup', email: emailA, password: 'password123' }), (e: AuthError) => e.code === 'auth/email-already-in-use')
      await assert.rejects(authService.register({ fullName: 'Weak', email: `weak-${stamp}@example.com`, password: '123' }), (e: AuthError) => e.code === 'auth/weak-password')
      const user = await authService.login(emailA.toUpperCase(), 'password123')
      assert.equal(user.uid, a.uid)
    })

    await check('password reset: sends, accepts the code once, and the new password works', async () => {
      assert.deepEqual(await authService.sendPasswordReset(`ghost-${stamp}@example.com`), {})
      assert.deepEqual(await authService.sendPasswordReset(emailA), {})
      const code = (await emulatorResetCodes()).filter((c) => c.email === emailA).pop()
      assert.ok(code, 'a reset code was issued')
      await authService.confirmPasswordReset(code.oobCode, 'newpassword456')
      await assert.rejects(authService.confirmPasswordReset(code.oobCode, 'another789'), (e: AuthError) => e.code === 'auth/invalid-reset-token')
      await assert.rejects(authService.confirmPasswordReset('garbage-code', 'another789'), (e: AuthError) => e.code === 'auth/invalid-reset-token')
      await authService.logout()
      await assert.rejects(authService.login(emailA, 'password123'), (e: AuthError) => e.code === 'auth/invalid-credential')
      const user = await authService.login(emailA, 'newpassword456')
      assert.equal(user.uid, a.uid)
    })

    await check('signed out: the database refuses everything', async () => {
      await authService.logout()
      await assert.rejects(listSubscriptions(a.uid), /permission/i)
      await assert.rejects(createSubscription(a.uid, sub()), /permission/i)
      await authService.login(emailA, 'newpassword456')
    })

    await check('profile and preferences are stored under the user and pass the rules', async () => {
      assert.equal(await getProfile(a.uid), null)
      const created = await createProfile({ uid: a.uid, email: a.email, displayName: 'Asha Rao' })
      assert.equal(created.email, emailA)
      assert.deepEqual(await getProfile(a.uid), created)
      const updated = await updateProfile(a.uid, { fullName: 'Asha R', preferredCurrency: 'USD', timeZone: 'America/New_York' })
      assert.equal((await getProfile(a.uid))?.fullName, 'Asha R')
      assert.equal(updated.preferredCurrency, 'USD')
      assert.equal(updated.email, emailA, 'identity fields do not change')
      assert.deepEqual(await getPreferences(a.uid), { inAppNotifications: true, premiumReminderDays: 7 })
      await updatePreferences(a.uid, { premiumReminderDays: 15 })
      await updatePreferences(a.uid, { inAppNotifications: false })
      assert.deepEqual(await getPreferences(a.uid), { inAppNotifications: false, premiumReminderDays: 15 })
      await updatePreferences(a.uid, { inAppNotifications: true })
    })

    await check('create subscription: saved with its open payment and an activity entry, all at once', async () => {
      const created = await createSubscription(a.uid, sub())
      subId = created.id
      assert.equal(created.nextPaymentDate, d(2))
      const subs = await listSubscriptions(a.uid)
      assert.equal(subs.length, 1)
      const payments = await listPayments(a.uid)
      assert.equal(payments.length, 1)
      assert.equal(payments[0].status, 'upcoming')
      assert.equal(payments[0].dueDate, d(2))
      assert.equal(payments[0].subscriptionId, subId)
      assert.ok((await listActivity(a.uid)).some((e) => e.message === 'Added subscription Netflix' && e.relatedId === subId))
    })

    await check('mark paid: history kept, next cycle opened, notification and activity recorded', async () => {
      const open = (await listPayments(a.uid))[0]
      await resolvePayment(a.uid, open.id, { status: 'paid', paymentDate: today, notes: ' autopay ' })
      const payments = await listPayments(a.uid)
      const paid = payments.find((p) => p.id === open.id)!
      assert.equal(paid.status, 'paid')
      assert.equal(paid.paymentDate, today)
      assert.equal(paid.notes, 'autopay')
      const opens = payments.filter((p) => p.status === 'upcoming')
      assert.equal(opens.length, 1)
      const [s] = await listSubscriptions(a.uid)
      assert.equal(opens[0].dueDate, s.nextPaymentDate)
      assert.ok(s.nextPaymentDate > open.dueDate)
      const notes = await listNotifications(a.uid)
      assert.ok(notes.some((n) => n.id === `paid:${open.id}` && n.kind === 'payment_paid' && !n.read))
      assert.ok((await listActivity(a.uid)).some((e) => e.message === 'Marked as paid: Netflix payment'))
    })

    await check('paying twice at the same moment records it once (checked at commit time)', async () => {
      const open = (await listPayments(a.uid)).find((p) => p.status === 'upcoming')!
      const results = await Promise.allSettled([
        resolvePayment(a.uid, open.id, { status: 'paid', paymentDate: today }),
        resolvePayment(a.uid, open.id, { status: 'paid', paymentDate: today }),
        resolvePayment(a.uid, open.id, { status: 'skipped' }),
      ])
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1, JSON.stringify(results.map((r) => r.status)))
      for (const r of results.filter((x): x is PromiseRejectedResult => x.status === 'rejected')) {
        assert.match(String(r.reason?.message), /already been recorded/)
      }
      const payments = await listPayments(a.uid)
      assert.equal(payments.filter((p) => p.status === 'upcoming').length, 1, 'exactly one new open payment, not several')
      assert.equal(payments.length, 3)
      const paidNotes = (await listNotifications(a.uid)).filter((n) => n.id === `paid:${open.id}`)
      assert.ok(paidNotes.length <= 1)
      await assert.rejects(resolvePayment(a.uid, open.id, { status: 'paid' }), /already been recorded/)
    })

    await check('edit syncs the open payment; pause removes it; resume recreates it', async () => {
      const [s] = await listSubscriptions(a.uid)
      await updateSubscription(a.uid, subId, { ...sub(), amountMinor: 59900, nextPaymentDate: d(9), status: 'active' })
      let open = (await listPayments(a.uid)).find((p) => p.status === 'upcoming')!
      assert.equal(open.amountMinor, 59900)
      assert.equal(open.dueDate, d(9))
      await setSubscriptionStatus(a.uid, subId, 'paused')
      assert.equal((await listPayments(a.uid)).filter((p) => p.status === 'upcoming').length, 0)
      assert.ok((await listPayments(a.uid)).filter((p) => p.status === 'paid').length >= 1, 'history kept')
      await setSubscriptionStatus(a.uid, subId, 'active')
      open = (await listPayments(a.uid)).find((p) => p.status === 'upcoming')!
      assert.ok(open.dueDate >= today)
      assert.equal(s.id, subId)
    })

    await check('delete removes the subscription and all of its payments', async () => {
      await createSubscription(a.uid, sub({ name: 'Spotify' }))
      await deleteSubscription(a.uid, subId)
      const subs = await listSubscriptions(a.uid)
      assert.deepEqual(subs.map((s) => s.name), ['Spotify'])
      assert.ok((await listPayments(a.uid)).every((p) => p.subscriptionId === subs[0].id))
      assert.ok((await listActivity(a.uid, 5)).some((e) => e.message === 'Deleted subscription Netflix' && e.relatedId === null))
    })

    await check('activity: newest first and limited without reading the whole log', async () => {
      const recent = await listActivity(a.uid, 3)
      assert.equal(recent.length, 3)
      assert.deepEqual(recent.map((e) => e.createdAt), [...recent.map((e) => e.createdAt)].sort().reverse())
    })

    await check('policies: create, pay a premium, renew (with history), cancel, reactivate, delete', async () => {
      const created = await createPolicy(a.uid, pol())
      polId = created.id
      assert.equal(created.nextPremiumDate, d(5))
      let premiums = await listPolicyPayments(a.uid)
      assert.equal(premiums.length, 1)
      await resolvePolicyPayment(a.uid, premiums[0].id, { status: 'paid', paymentDate: today, notes: 'netbanking' })
      premiums = await listPolicyPayments(a.uid)
      assert.equal(premiums.filter((p) => p.status === 'upcoming').length, 1)
      assert.ok(premiums.some((p) => p.status === 'paid' && p.notes === 'netbanking'))

      const renewed = await renewPolicy(a.uid, polId, { newExpiryDate: d(250 + 365), premiumAmountMinor: 130000, coverageAmountMinor: 60000000, notes: 'online' })
      assert.equal(renewed.renewals.length, 1)
      const stored = (await listPolicies(a.uid))[0]
      assert.equal(stored.renewals[0].previousExpiryDate, d(250))
      assert.equal(stored.expiryDate, d(250 + 365))
      assert.equal(stored.premiumAmountMinor, 130000)

      await setPolicyStatus(a.uid, polId, 'cancelled')
      assert.equal((await listPolicyPayments(a.uid)).filter((p) => p.status === 'upcoming').length, 0)
      await assert.rejects(renewPolicy(a.uid, polId, { newExpiryDate: d(9999), premiumAmountMinor: 1, coverageAmountMinor: 1, notes: '' }), /cancelled/)
      await setPolicyStatus(a.uid, polId, 'active')
      assert.equal((await listPolicyPayments(a.uid)).filter((p) => p.status === 'upcoming').length, 1)

      await assert.rejects(resolvePolicyPayment(a.uid, premiums.find((p) => p.status === 'paid')!.id, { status: 'paid' }), /already been recorded/)
      await deletePolicy(a.uid, polId)
      assert.deepEqual(await listPolicies(a.uid), [])
      assert.deepEqual(await listPolicyPayments(a.uid), [])
    })

    await check('notifications: created once, closed when they stop applying, read states persisted', async () => {
      const spotify = (await listSubscriptions(a.uid))[0]
      const source = async () => ({
        subscriptions: await listSubscriptions(a.uid), subscriptionPayments: await listPayments(a.uid),
        policies: await listPolicies(a.uid), policyPayments: await listPolicyPayments(a.uid),
      })
      await updateSubscription(a.uid, spotify.id, { ...sub({ name: 'Spotify' }), nextPaymentDate: d(1), status: 'active' })
      const prefs = await getPreferences(a.uid)
      assert.equal(await syncNotifications(a.uid, await source(), prefs, today), true)
      const first = (await listNotifications(a.uid)).filter((n) => n.kind === 'subscription_due')
      assert.equal(first.length, 1)
      assert.equal(first[0].title, 'Upcoming payment: Spotify')
      // Quiet runs change nothing and need no extra reads when the list is passed in.
      assert.equal(await syncNotifications(a.uid, await source(), prefs, today, await listNotifications(a.uid)), false)
      assert.equal(await syncNotifications(a.uid, await source(), prefs, today), false)
      await markNotificationRead(a.uid, first[0].id)
      assert.equal((await db.get<{ read: boolean }>(a.uid, COLLECTIONS.notifications, first[0].id))?.read, true)
      await markAllNotificationsRead(a.uid)
      assert.equal((await listNotifications(a.uid)).filter((n) => !n.read).length, 0)
      // Pay it: the reminder is no longer applicable and stays closed.
      const open = (await listPayments(a.uid)).find((p) => p.status === 'upcoming')!
      await resolvePayment(a.uid, open.id, { status: 'paid' })
      await syncNotifications(a.uid, await source(), prefs, today)
      assert.equal((await listNotifications(a.uid)).find((n) => n.id === first[0].id)?.read, true)
    })

    await check('another user cannot see, change or delete this user\'s data', async () => {
      const subsBefore = await listSubscriptions(a.uid)
      assert.ok(subsBefore.length >= 1)
      await authService.logout()
      const user = await authService.register({ fullName: 'Ben Cole', email: emailB, password: 'password123' })
      b = { uid: user.uid, email: user.email }
      assert.notEqual(b.uid, a.uid)

      await assert.rejects(listSubscriptions(a.uid), /permission/i)
      await assert.rejects(listPayments(a.uid), /permission/i)
      await assert.rejects(listNotifications(a.uid), /permission/i)
      await assert.rejects(getProfile(a.uid), /permission/i)
      await assert.rejects(createSubscription(a.uid, sub({ name: 'Planted' })), /permission/i)
      await assert.rejects(db.commit(a.uid, [{ type: 'delete', collection: COLLECTIONS.subscriptions, id: subsBefore[0].id }]), /permission/i)
      await assert.rejects(createProfile({ uid: a.uid, email: emailB, displayName: 'Impostor' }), /permission/i)

      // Ben's own space starts empty and works normally.
      assert.deepEqual(await listSubscriptions(b.uid), [])
      assert.equal(await getProfile(b.uid), null)
      await createSubscription(b.uid, sub({ name: 'Hulu' }))
      assert.deepEqual((await listSubscriptions(b.uid)).map((s) => s.name), ['Hulu'])
      await authService.logout()

      // Asha's data is untouched.
      await authService.login(emailA, 'newpassword456')
      assert.deepEqual((await listSubscriptions(a.uid)).map((s) => s.id).sort(), subsBefore.map((s) => s.id).sort())
      assert.ok(!(await listSubscriptions(a.uid)).some((s) => s.name === 'Planted' || s.name === 'Hulu'))
    })

    await check('the first user can sign out and the listener reports it', async () => {
      const seen: (string | null)[] = []
      const unsubscribe = authService.onAuthStateChanged((u) => seen.push(u?.uid ?? null))
      await new Promise((r) => setTimeout(r, 200))
      await authService.logout()
      await new Promise((r) => setTimeout(r, 200))
      unsubscribe()
      assert.equal(seen[0], a.uid)
      assert.equal(seen[seen.length - 1], null)
    })
  },
  180_000,
)
